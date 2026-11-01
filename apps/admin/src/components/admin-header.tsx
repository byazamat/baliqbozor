'use client';

import { formatPhone } from '@baliqbozor/i18n';
import { Button, cn } from '@baliqbozor/ui';
import { useTranslations } from 'next-intl';

import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useSession } from '@/lib/session';

import { LanguageSwitcher } from './language-switcher';

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'BaliqBozor';

export function AdminHeader() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const { status, me, isStaff, isAdmin, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const nav = [
    { href: '/', label: t('nav.queue') },
    ...(isAdmin ? [{ href: '/settings', label: t('nav.settings') }] : []),
  ];
  const active = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/orgs') : pathname.startsWith(href);

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-xl font-bold text-brand-700">
          {`${BRAND} · ${t('home.title')}`}
        </Link>
        <LanguageSwitcher />
      </div>
      {status === 'authenticated' && me && (
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
            {isStaff ? (
              <nav aria-label={t('nav.main')}>
                <ul className="flex flex-wrap gap-1">
                  {nav.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active(item.href) ? 'page' : undefined}
                        className={cn(
                          'inline-flex min-h-11 items-center rounded-control px-3 font-medium',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                          active(item.href)
                            ? 'bg-brand-50 text-brand-800'
                            : 'text-ink-muted hover:text-ink',
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              <span className="text-ink-muted" data-testid="staff-user">
                {`${me.fullName ?? formatPhone(me.phone)} · ${t(`platformRole.${me.platformRole}`)}`}
              </span>
              <Button
                variant="ghost"
                onClick={() => void logout().then(() => router.replace('/login'))}
              >
                {tc('logout')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
