'use client';

import type { components, SessionLogin, SessionResult } from '@baliqbozor/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { useApi, useSessionManager } from './api';
import { unwrap } from './errors';

export type Me = components['schemas']['MeDto'];
export type MyOrg = components['schemas']['MyOrganizationDto'];
export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

interface SessionValue {
  status: SessionStatus;
  me: Me | undefined;
  /** Текущая организация (заголовок `X-Org-Id` для запросов уровня организации). */
  currentOrg: MyOrg | null;
  /** Профиль не загрузился (сеть, API) — можно повторить. */
  meFailed: boolean;
  reloadMe: () => void;
  selectOrg: (orgId: string) => void;
  login: (phone: string, code: string) => Promise<SessionResult<SessionLogin>>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);
const ORG_KEY = 'bb.web.orgId';
export const ME_QUERY_KEY = ['me'] as const;

/** Удобство на одном устройстве: последняя выбранная организация (не секрет, D-31). */
function readStoredOrg(): string | null {
  try {
    return window.localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

function storeOrg(orgId: string): void {
  try {
    window.localStorage.setItem(ORG_KEY, orgId);
  } catch {
    // Хранилище недоступно (приватный режим) — выбор живёт до перезагрузки.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const manager = useSessionManager();
  const api = useApi();
  const queryClient = useQueryClient();
  const state = useSyncExternalStore(
    (cb) => manager.subscribe(cb),
    () => manager.getState(),
    () => 'unknown' as const,
  );
  // На сервере организации нет (профиль грузится только в браузере), расхождения гидрации нет.
  const [orgId, setOrgId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : readStoredOrg(),
  );

  useEffect(() => {
    void manager.init();
  }, [manager]);

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => unwrap(api.GET('/api/v1/me')),
    enabled: state === 'authenticated',
    staleTime: 60_000,
  });

  const me = state === 'authenticated' ? meQuery.data : undefined;
  const currentOrg = useMemo(() => {
    const orgs = me?.organizations ?? [];
    return orgs.find((o) => o.id === orgId) ?? orgs[0] ?? null;
  }, [me, orgId]);

  const selectOrg = useCallback((id: string) => {
    storeOrg(id);
    setOrgId(id);
  }, []);

  const login = useCallback(
    async (phone: string, code: string) => {
      const result = await manager.login(phone, code);
      if (result.ok) await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      return result;
    },
    [manager, queryClient],
  );

  const logout = useCallback(async () => {
    await manager.logout();
    queryClient.clear();
  }, [manager, queryClient]);

  const status: SessionStatus =
    state === 'anonymous'
      ? 'anonymous'
      : state === 'authenticated' && me !== undefined
        ? 'authenticated'
        : 'loading';

  const meFailed = state === 'authenticated' && meQuery.isError;
  const { refetch } = meQuery;
  const reloadMe = useCallback(() => void refetch(), [refetch]);

  const value = useMemo(
    () => ({ status, me, currentOrg, meFailed, reloadMe, selectOrg, login, logout }),
    [status, me, currentOrg, meFailed, reloadMe, selectOrg, login, logout],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/** Текущая организация на защищённых страницах (их layout гарантирует, что она есть). */
export function useCurrentOrg(): MyOrg {
  const { currentOrg } = useSession();
  if (!currentOrg) throw new Error('No current organization');
  return currentOrg;
}

/** Заголовок организации для запросов уровня организации (SPEC 10.1). */
export const orgHeaders = (orgId: string) => ({ 'X-Org-Id': orgId });
