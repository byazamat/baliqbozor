'use client';

import { Badge, type BadgeTone, Button } from '@baliqbozor/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useApi } from '@/lib/api';

type State = 'checking' | 'ok' | 'down';

const TONE: Record<State, BadgeTone> = { checking: 'neutral', ok: 'success', down: 'danger' };

/** Заглушка M0: состояние API через `api-client`. */
export function HealthStatus() {
  const t = useTranslations('health');
  const tc = useTranslations('common');
  const api = useApi();
  const query = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data, error } = await api.GET('/health');
      if (error !== undefined || !data) throw new Error('API unavailable');
      return data;
    },
    retry: false,
    refetchInterval: 30_000,
  });

  const state: State = query.isPending ? 'checking' : query.isSuccess ? 'ok' : 'down';

  return (
    <section
      aria-labelledby="health-title"
      className="rounded-control border border-border bg-surface p-6 shadow-sm"
    >
      <h2 id="health-title" className="text-lg font-semibold text-ink">
        {t('title')}
      </h2>
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-ink-muted">{t('api')}</span>
        <Badge tone={TONE[state]} data-testid="api-status" data-state={state}>
          {t(state)}
        </Badge>
      </div>
      {state === 'down' && (
        <Button variant="secondary" className="mt-4" onClick={() => void query.refetch()}>
          {tc('retry')}
        </Button>
      )}
    </section>
  );
}
