'use client';

import { formatPhone } from '@baliqbozor/i18n';
import { Alert, Button } from '@baliqbozor/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect } from 'react';

import { Loading } from '@/components/page';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSession } from '@/lib/session';

/** Админка только для OPERATOR и ADMIN (SPEC 12.3); остальным — экран «нет доступа». */
export default function StaffLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('admin.login');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const { status, me, isStaff, meFailed, reloadMe, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace({ pathname: '/login', query: { next: pathname } });
  }, [status, pathname, router]);

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
  if (status !== 'authenticated' || !me) return <Loading label={tc('loading')} />;
  if (!isStaff) {
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-16" data-testid="no-access">
        <Alert
          tone="warning"
          title={t('noAccess')}
          action={
            <Button onClick={() => void logout().then(() => router.replace('/login'))}>
              {t('switchAccount')}
            </Button>
          }
        >
          {t('noAccessBody', { phone: formatPhone(me.phone) })}
        </Alert>
      </main>
    );
  }
  return children;
}
