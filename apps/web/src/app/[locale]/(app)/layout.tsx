'use client';

import { Alert, Button } from '@baliqbozor/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect } from 'react';

import { Loading } from '@/components/page';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSession } from '@/lib/session';

/** Защищённые разделы: без сессии — на вход, без организации — на онбординг (SPEC 8.1). */
export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('web');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { status, me, meFailed, reloadMe } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const needsOnboarding =
    status === 'authenticated' && me?.organizations.length === 0 && pathname !== '/onboarding';

  useEffect(() => {
    if (status === 'anonymous') router.replace({ pathname: '/login', query: { next: pathname } });
    if (needsOnboarding) router.replace('/onboarding');
  }, [status, needsOnboarding, pathname, router]);

  if (meFailed) {
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-16">
        <Alert
          tone="danger"
          title={te('INTERNAL_ERROR')}
          action={<Button onClick={reloadMe}>{tc('retry')}</Button>}
        />
      </main>
    );
  }
  if (status !== 'authenticated' || needsOnboarding) return <Loading label={t('loadingSession')} />;
  return children;
}
