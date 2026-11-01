import { type ApiErrorResponse, isApiError } from './client.js';
import type { components } from './generated/schema.js';

/** Ответ входа без refresh-токена: он остаётся в httpOnly-cookie (D-31). */
export type SessionLogin = Omit<components['schemas']['LoginResultDto'], 'refreshToken'>;

export type SessionState = 'unknown' | 'authenticated' | 'anonymous';

export type SessionResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error: ApiErrorResponse['error'] };

export interface SessionManagerOptions {
  /** Путь route handlers сессии в приложении (`/api/session`). */
  basePath?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  /** Имя блокировки Web Locks: вкладки обновляют токен по очереди, иначе ротация отзовёт цепочку. */
  lockName?: string;
  /** Обновлять access-токен заранее, за столько секунд до истечения. */
  refreshLeewaySec?: number;
}

interface Tokens {
  accessToken: string;
  accessTokenExpiresIn: number;
}

type Listener = (state: SessionState) => void;

const networkError = (): ApiErrorResponse['error'] => ({
  code: 'INTERNAL_ERROR',
  message: 'Network error',
  requestId: '',
});

/**
 * Сессия в браузере (D-31): access-токен только в памяти, обновление через route handler,
 * один запрос обновления за раз (в том числе между вкладками), повтор запроса после 401.
 */
export class SessionManager {
  private token: string | null = null;
  private expiresAt = 0;
  private state: SessionState = 'unknown';
  private inflight: Promise<string | null> | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly base: string;
  private readonly baseFetch: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly leewayMs: number;
  private readonly lockName: string;

  constructor(options: SessionManagerOptions = {}) {
    this.base = (options.basePath ?? '/api/session').replace(/\/+$/, '');
    const f = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.baseFetch = f;
    this.now = options.now ?? Date.now;
    this.leewayMs = (options.refreshLeewaySec ?? 30) * 1000;
    this.lockName = options.lockName ?? 'baliqbozor-session';
  }

  getState(): SessionState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Восстановление сессии при загрузке страницы по cookie. */
  async init(): Promise<SessionState> {
    if (this.state === 'unknown') await this.refresh();
    if (this.state === 'unknown') this.setState('anonymous');
    return this.state;
  }

  async login(phone: string, code: string): Promise<SessionResult<SessionLogin>> {
    let res: Response;
    try {
      res = await this.baseFetch(`${this.base}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
        credentials: 'same-origin',
      });
    } catch {
      return { ok: false, status: 0, error: networkError() };
    }
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: isApiError(body) ? body.error : networkError(),
      };
    }
    const data = body as SessionLogin;
    this.accept(data);
    return { ok: true, data };
  }

  async logout(): Promise<void> {
    const token = this.token;
    this.token = null;
    this.expiresAt = 0;
    try {
      await this.baseFetch(`${this.base}/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'same-origin',
      });
    } catch {
      // Cookie удалит следующий неудачный refresh; локально сессия уже закрыта.
    }
    this.setState('anonymous');
  }

  /** Действующий access-токен; при истечении — обновление. `null` — не авторизован. */
  async getAccessToken(): Promise<string | null> {
    if (this.token && this.expiresAt - this.leewayMs > this.now()) return this.token;
    if (this.state === 'anonymous') return null;
    return this.refresh();
  }

  /** Обновление пары токенов; параллельные вызовы ждут один запрос. */
  refresh(): Promise<string | null> {
    this.inflight ??= this.withLock(() => this.doRefresh()).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** `fetch` для api-client: при 401 обновляет токен и повторяет запрос один раз. */
  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const retry = request.clone();
    const res = await this.baseFetch(request);
    if (res.status !== 401 || !request.headers.has('Authorization')) return res;
    this.token = null;
    const token = await this.refresh();
    if (!token) return res;
    retry.headers.set('Authorization', `Bearer ${token}`);
    return this.baseFetch(retry);
  };

  private async doRefresh(): Promise<string | null> {
    let res: Response;
    try {
      res = await this.baseFetch(`${this.base}/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      return null;
    }
    if (!res.ok) {
      // 401 — сессии нет или она отозвана; прочие ошибки (API недоступен) состояние не меняют.
      if (res.status === 401) {
        this.token = null;
        this.setState('anonymous');
      }
      return null;
    }
    const tokens = (await res.json()) as Tokens;
    this.accept(tokens);
    return tokens.accessToken;
  }

  private accept(tokens: Tokens): void {
    this.token = tokens.accessToken;
    this.expiresAt = this.now() + tokens.accessTokenExpiresIn * 1000;
    this.setState('authenticated');
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (!locks) return fn();
    return locks.request(this.lockName, fn);
  }

  private setState(state: SessionState): void {
    if (state === this.state) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
