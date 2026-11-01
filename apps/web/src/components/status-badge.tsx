import type { components } from '@baliqbozor/api-client';
import { Badge, type BadgeTone } from '@baliqbozor/ui';
import { useTranslations } from 'next-intl';

type VerificationStatus = components['schemas']['VerificationStatus'];

export const VERIFICATION_TONE: Record<VerificationStatus, BadgeTone> = {
  UNVERIFIED: 'neutral',
  PENDING: 'info',
  VERIFIED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'warning',
};

/** Статус верификации: цвет дополняет текст (SPEC 12.1). */
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const t = useTranslations('org.status');
  return (
    <Badge tone={VERIFICATION_TONE[status]} data-testid="verification-status" data-status={status}>
      {t(status)}
    </Badge>
  );
}
