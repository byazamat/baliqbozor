'use client';

import { formatDate, formatKg, formatPricePerKg } from '@baliqbozor/i18n';
import { Badge } from '@baliqbozor/ui';
import { useLocale, useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { regionName } from '@/lib/dict';
import { type PublicListing, sizeLabel, speciesName } from '@/lib/listings';

/** Окно вылова, цена и рейтинг — общие для карточки в списке и страницы позиции. */
export function useListingFacts(l: PublicListing) {
  const t = useTranslations('web.catalog');
  const tl = useTranslations('listing');
  const locale = useLocale();
  return {
    title: `${speciesName(l.species, locale)}, ${sizeLabel(l.sizeClass, locale)}`,
    price: l.pricePerKg ? formatPricePerKg(l.pricePerKg, locale) : tl('negotiable'),
    available: t('available', { volume: formatKg(l.availableKg, locale) }),
    minOrder: t('minOrder', { volume: formatKg(l.minOrderKg, locale) }),
    window: l.availableTo
      ? t('window', { from: formatDate(l.availableFrom), to: formatDate(l.availableTo) })
      : t('windowOpen', { from: formatDate(l.availableFrom) }),
    region: regionName(l.region, locale) ?? '',
    rating:
      l.seller.ratingAvg && l.seller.ratingCount > 0
        ? t('rating', { value: l.seller.ratingAvg.replace('.', ',') })
        : t('noRating'),
    distance: l.distanceKm === null ? null : t('distance', { km: l.distanceKm }),
  };
}

export function PublicListingCard({ listing, near }: { listing: PublicListing; near?: string }) {
  const tl = useTranslations('listing');
  const t = useTranslations('web.catalog');
  const f = useListingFacts(listing);
  const cover = listing.media[0];
  const href = near
    ? { pathname: `/listing/${listing.id}`, query: { near } }
    : `/listing/${listing.id}`;
  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-control border border-border bg-surface shadow-sm"
      data-testid="catalog-item"
    >
      <Link href={href} className="block aspect-[3/2] bg-surface-muted">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- подписанная ссылка на 10 минут
          <img
            src={cover.thumbUrl ?? cover.url}
            alt={f.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex flex-wrap gap-1">
          <Badge tone="info">{tl(`form.${listing.form}`)}</Badge>
          <Badge tone={listing.kind === 'AVAILABLE_NOW' ? 'success' : 'neutral'}>
            {tl(`kind.${listing.kind}`)}
          </Badge>
          {listing.status === 'SOLD_OUT' && <Badge tone="warning">{t('soldOut')}</Badge>}
        </div>
        <h3 className="mt-1 text-lg font-semibold">
          <Link href={href} className="text-brand-700 hover:underline">
            {f.title}
          </Link>
        </h3>
        <p className="text-xl font-bold text-ink">{f.price}</p>
        <p className="text-ink">
          {f.available} · {f.minOrder}
        </p>
        <p className="text-ink-muted">{f.window}</p>
        <p className="mt-auto pt-2 text-ink-muted">
          {[f.region, f.distance, f.rating].filter(Boolean).join(' · ')}
        </p>
        {listing.hasVideo && <p className="text-sm text-brand-700">▶ {tl('hasVideo')}</p>}
      </div>
    </article>
  );
}
