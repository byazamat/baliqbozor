export interface CheckResult {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

export const READINESS_TIMEOUT_MS = 2000;

/** Проверка зависимости с таймаутом; ошибка превращается в `down` без деталей окружения. */
export async function probe(
  check: () => Promise<unknown>,
  timeoutMs = READINESS_TIMEOUT_MS,
): Promise<CheckResult> {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    await Promise.race([check(), timeout]);
    return { status: 'up', latencyMs: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - started),
      error: err instanceof Error ? (err.name === 'Error' ? err.message : err.name) : 'unknown',
    };
  } finally {
    clearTimeout(timer);
  }
}
