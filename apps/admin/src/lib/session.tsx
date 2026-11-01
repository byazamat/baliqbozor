'use client';

import type { components, SessionLogin, SessionResult } from '@baliqbozor/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { useApi, useSessionManager } from './api';
import { unwrap } from './errors';

export type Me = components['schemas']['MeDto'];
export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

interface SessionValue {
  status: SessionStatus;
  me: Me | undefined;
  /** Оператор или администратор — только им открыта админка (SPEC 12.3). */
  isStaff: boolean;
  isAdmin: boolean;
  meFailed: boolean;
  reloadMe: () => void;
  login: (phone: string, code: string) => Promise<SessionResult<SessionLogin>>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);
export const ME_QUERY_KEY = ['me'] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const manager = useSessionManager();
  const api = useApi();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const state = useSyncExternalStore(
    (cb) => manager.subscribe(cb),
    () => manager.getState(),
    () => 'unknown' as const,
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

  const login = useCallback(
    async (phone: string, code: string) => {
      const result = await manager.login(phone, code, locale);
      if (result.ok) await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      return result;
    },
    [manager, queryClient, locale],
  );
  const logout = useCallback(async () => {
    await manager.logout();
    queryClient.clear();
  }, [manager, queryClient]);
  const { refetch } = meQuery;
  const reloadMe = useCallback(() => void refetch(), [refetch]);

  const status: SessionStatus =
    state === 'anonymous'
      ? 'anonymous'
      : state === 'authenticated' && me !== undefined
        ? 'authenticated'
        : 'loading';
  const isAdmin = me?.platformRole === 'ADMIN';
  const isStaff = isAdmin || me?.platformRole === 'OPERATOR';
  const meFailed = state === 'authenticated' && meQuery.isError;

  const value = useMemo(
    () => ({ status, me, isStaff, isAdmin, meFailed, reloadMe, login, logout }),
    [status, me, isStaff, isAdmin, meFailed, reloadMe, login, logout],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
