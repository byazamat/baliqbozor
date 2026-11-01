import { cn } from '@baliqbozor/ui';
import type { ReactNode } from 'react';

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'BaliqBozor';

/** Страница кабинета; заголовок вкладки — через `<title>` (React 19 поднимает его в `<head>`). */
export function Page({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="main" className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <title>{`${title} · ${BRAND}`}</title>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
        {aside}
      </div>
      {children}
    </main>
  );
}

export function Section({
  title,
  children,
  className,
  ...props
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-control border border-border bg-surface p-4 shadow-sm sm:p-6',
        className,
      )}
      {...props}
    >
      {title && <h2 className="mb-4 text-lg font-semibold text-ink">{title}</h2>}
      {children}
    </section>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <main
      id="main"
      className="mx-auto max-w-5xl px-4 py-16 text-center text-ink-muted"
      aria-busy="true"
    >
      {label}
    </main>
  );
}
