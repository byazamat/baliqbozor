'use client';

import { useTranslations } from 'next-intl';

import { ListingEditor } from '@/components/listing-editor';
import { SellerOnly } from '@/components/seller-only';

export default function NewListingPage() {
  const t = useTranslations('web.listings');
  return (
    <SellerOnly title={t('newTitle')}>
      <ListingEditor listing={null} />
    </SellerOnly>
  );
}
