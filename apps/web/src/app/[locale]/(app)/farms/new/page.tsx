'use client';

import { useTranslations } from 'next-intl';

import { FarmEditor } from '@/components/farm-editor';
import { SellerOnly } from '@/components/seller-only';

export default function NewFarmPage() {
  const t = useTranslations('web.farms');
  return (
    <SellerOnly title={t('newTitle')}>
      <FarmEditor farm={null} />
    </SellerOnly>
  );
}
