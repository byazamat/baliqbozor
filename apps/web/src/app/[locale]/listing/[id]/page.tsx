import type { Locale } from '@baliqbozor/i18n';
import { setRequestLocale } from 'next-intl/server';

import { ListingView } from './listing-view';

export default async function PublicListingPage({ params }: PageProps<'/[locale]/listing/[id]'>) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  return <ListingView id={id} />;
}
