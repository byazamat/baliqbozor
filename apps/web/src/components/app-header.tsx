'use client';

import { Button, cn } from '@baliqbozor/ui';
import { useTranslations } from 'next-intl';

import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useSession } from '@/lib/session';

import { LanguageSwitcher } from './language-switcher';
import { NotificationBell } from './notification-bell';
import { OrgSwitcher } from './org-switcher';

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'BaliqBozor';

const NAV = [
  { href: '/farms', key: 'farms', seller: true },
  { href: '/listings', key: 'listings', seller: true },
  { href: '/org', key: 'org', seller: false },
  { href: '/org/team', key: 'team', seller: false },
  { href: '/notifications', key: 'notifications', seller: false },
  { href: '/account', key: 'account', seller: false },
] as const;

/** Раздел подсвечивается и на вложенных страницах (`/listings/…`), кроме `/org` для `/org/team`. */
const isCurrent = (pathname: string, href: string) =>
  pathname === href || (href !== '/org' && pathname.startsWith(`${href}/`));

export function AppHeader() {
  const t = useTranslations('web.nav');
  const tc = useTranslations('common');
  const { status, currentOrg, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = status === 'authenticated';

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-xl font-bold text-brand-700">
          {BRAND}
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/catalog"
            className="inline-flex min-h-11 items-center rounded-control px-3 font-medium text-ink-muted hover:text-ink"
          >
            {t('catalog')}
          </Link>
          {signedIn && <NotificationBell />}
          <LanguageSwitcher />
          {status === 'anonymous' && pathname !== '/login' && (
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-control bg-brand-700 px-4 font-medium text-white hover:bg-brand-800"
            >
              {tc('login')}
            </Link>
          )}
        </div>
      </div>
      {signedIn && (
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2">
            {currentOrg ? (
              <nav aria-label={t('main')} className="min-w-0">
                <ul className="flex flex-wrap gap-1">
                  {NAV.filter((item) => !item.seller || currentOrg.type === 'SELLER').map(
                    (item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                          className={cn(
                            'inline-flex min-h-11 items-center rounded-control px-3 font-medium',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                            isCurrent(pathname, item.href)
                              ? 'bg-brand-50 text-brand-800'
                              : 'text-ink-muted hover:text-ink',
                          )}
                        >
                          {t(item.key)}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </nav>
            ) : (
              <span />
            )}
            <div className="flex min-w-0 items-center gap-2">
              <OrgSwitcher />
              <Button
                variant="ghost"
                onClick={() => {
                  void logout().then(() => router.replace('/login'));
                }}
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
