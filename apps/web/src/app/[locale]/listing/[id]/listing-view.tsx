'use client';

import { Alert, Badge } from '@baliqbozor/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Loading } from '@/components/page';
import { useListingFacts } from '@/components/public-listing';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { unwrap } from '@/lib/errors';
import type { PublicListing } from '@/lib/listings';
import { useSession } from '@/lib/session';

/** Публичная карточка наличия (SPEC 12.2, D-53): галерея, видео облова, условия, регион, рейтинг. */
export function ListingView({ id }: { id: string }) {
  const t = useTranslations('web.catalog');
  const tc = useTranslations('common');
  const api = useApi();
  const near = useSearchParams().get('near');
  const { data, error } = useQuery({
    queryKey: ['catalog', 'listing', id, near],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/listings/{id}', {
          params: { path: { id }, query: near ? { near } : {} },
        }),
      ),
    staleTime: 60_000,
  });
  if (error) {
    return (
      <main id="main" className="mx-auto max-w-5xl px-4 py-10">
        <Alert tone="warning">{t('notFound')}</Alert>
        <Link href="/catalog" className="mt-4 inline-block text-brand-700 underline">
          {t('back')}
        </Link>
      </main>
    );
  }
  if (!data) return <Loading label={tc('loading')} />;
  return <Card listing={data} />;
}

function Card({ listing }: { listing: PublicListing }) {
  const t = useTranslations('web.catalog');
  const tl = useTranslations('listing');
  const f = useListingFacts(listing);
  const { status } = useSession();
  const [active, setActive] = useState(0);
  const current = listing.media[active];

  return (
    <main id="main" className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <title>{f.title}</title>
      <Link href="/catalog" className="text-brand-700 hover:underline">
        ← {t('back')}
      </Link>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="aspect-[3/2] overflow-hidden rounded-control bg-surface-muted">
            {current?.kind === 'VIDEO' ? (
              <video
                src={current.url}
                controls
                playsInline
                className="h-full w-full"
                aria-label={t('video')}
              />
            ) : current ? (
              // eslint-disable-next-line @next/next/no-img-element -- подписанная ссылка на 10 минут
              <img src={current.url} alt={f.title} className="h-full w-full object-cover" />
            ) : null}
          </div>
          {listing.media.length > 1 && (
            <ul className="flex flex-wrap gap-2">
              {listing.media.map((m, i) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-pressed={i === active}
                    aria-label={m.kind === 'VIDEO' ? t('video') : t('photo', { n: i + 1 })}
                    className="size-16 overflow-hidden rounded border-2 border-border aria-pressed:border-brand-600"
                  >
                    {m.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- подписанная ссылка на 10 минут
                      <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span aria-hidden>▶</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1">
            <Badge tone="info">{tl(`form.${listing.form}`)}</Badge>
            <Badge tone={listing.kind === 'AVAILABLE_NOW' ? 'success' : 'neutral'}>
              {tl(`kind.${listing.kind}`)}
            </Badge>
            {listing.status === 'SOLD_OUT' && <Badge tone="warning">{t('soldOut')}</Badge>}
            {listing.hasVideo && <Badge tone="info">{tl('hasVideo')}</Badge>}
          </div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{f.title}</h1>
          <p className="text-2xl font-bold text-ink">{f.price}</p>
          <p className="text-ink">
            {f.available} · {f.minOrder}
          </p>
          <p className="text-ink-muted">{f.window}</p>
          <p className="text-ink">
            {t('region2', { name: f.region })}
            {f.distance ? ` · ${f.distance}` : ''}
          </p>
          <p className="text-ink-muted">
            {t('seller')}: {f.rating}
          </p>
          {listing.description && (
            <p className="whitespace-pre-line text-ink">{listing.description}</p>
          )}
          <Alert tone="info">{t('privacy')}</Alert>
          {status !== 'authenticated' ? (
            <Link
              href={{ pathname: '/login', query: { next: `/listing/${listing.id}` } }}
              className="inline-flex min-h-11 items-center justify-center self-start rounded-control bg-brand-700 px-5 text-lg font-medium text-white hover:bg-brand-800"
            >
              {t('order')}
            </Link>
          ) : (
            <p className="text-ink-muted">{t('orderHint')}</p>
          )}
        </div>
      </div>
    </main>
  );
}
