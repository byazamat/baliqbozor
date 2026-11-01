'use client';

import { Alert, Badge, type BadgeTone, Button, Dialog, Input } from '@baliqbozor/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useApi } from '@/lib/api';
import { type Listing, listingsQueryKey, trimWeight, useIssueText } from '@/lib/listings';
import { unwrap } from '@/lib/errors';
import { orgHeaders, useCurrentOrg } from '@/lib/session';

export const LISTING_TONE: Record<Listing['status'], BadgeTone> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warning',
  SOLD_OUT: 'info',
  EXPIRED: 'danger',
  ARCHIVED: 'neutral',
};

export function ListingStatusBadge({
  listing,
}: {
  listing: Pick<Listing, 'status' | 'pauseReason'>;
}) {
  const t = useTranslations('listing');
  return (
    <Badge
      tone={LISTING_TONE[listing.status]}
      data-testid="listing-status"
      data-status={listing.status}
    >
      {t(`status.${listing.status}`)}
      {listing.pauseReason ? ` · ${t(`pauseReason.${listing.pauseReason}`)}` : ''}
    </Badge>
  );
}

type Action = 'PUBLISH' | 'RESUME' | 'PAUSE' | 'ARCHIVE' | 'CONFIRM';
const PATH = {
  PUBLISH: '/api/v1/listings/{id}/publish',
  RESUME: '/api/v1/listings/{id}/resume',
  PAUSE: '/api/v1/listings/{id}/pause',
  ARCHIVE: '/api/v1/listings/{id}/archive',
  CONFIRM: '/api/v1/listings/{id}/confirm',
} as const;

/** Быстрые действия по статусу (SPEC 12.2): подтвердить, изменить объём, пауза, возобновить, архив. */
export function ListingActions({
  listing,
  onChanged,
  compact,
}: {
  listing: Listing;
  onChanged?: (listing: Listing) => void;
  compact?: boolean;
}) {
  const t = useTranslations('web.listings');
  const tc = useTranslations('common');
  const issueText = useIssueText();
  const api = useApi();
  const org = useCurrentOrg();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [dialog, setDialog] = useState<'archive' | 'volume' | null>(null);
  const [volume, setVolume] = useState(() => trimWeight(listing.volumeKg));
  const manager = org.role !== 'STAFF';
  const s = listing.status;

  const run = async (action: Action, body?: { volumeKg?: string }) => {
    setBusy(true);
    setMessage(null);
    try {
      const params = { params: { path: { id: listing.id }, header: orgHeaders(org.id) } };
      const updated =
        action === 'CONFIRM'
          ? await unwrap(api.POST(PATH.CONFIRM, { ...params, body: body ?? {} }))
          : await unwrap(api.POST(PATH[action], params));
      await queryClient.invalidateQueries({ queryKey: listingsQueryKey(org.id) });
      setDialog(null);
      setMessage({ tone: 'success', text: t(`done.${action}`) });
      onChanged?.(updated);
    } catch (err) {
      setMessage({ tone: 'danger', text: issueText(err) });
    } finally {
      setBusy(false);
    }
  };

  const canConfirm =
    s === 'ACTIVE' || s === 'SOLD_OUT' || (s === 'PAUSED' && listing.pauseReason === 'FRESHNESS');
  const size = compact ? 'md' : 'lg';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canConfirm && (
          <Button size={size} onClick={() => void run('CONFIRM')} disabled={busy}>
            {t('confirm')}
          </Button>
        )}
        {manager && canConfirm && (
          <Button
            size={size}
            variant="secondary"
            onClick={() => setDialog('volume')}
            disabled={busy}
          >
            {t('changeVolume')}
          </Button>
        )}
        {manager && (s === 'DRAFT' || s === 'EXPIRED') && (
          <Button size={size} onClick={() => void run('PUBLISH')} disabled={busy}>
            {t('publish')}
          </Button>
        )}
        {manager && s === 'PAUSED' && listing.pauseReason !== 'FRESHNESS' && (
          <Button size={size} onClick={() => void run('RESUME')} disabled={busy}>
            {t('resume')}
          </Button>
        )}
        {manager && s === 'ACTIVE' && (
          <Button size={size} variant="secondary" onClick={() => void run('PAUSE')} disabled={busy}>
            {t('pause')}
          </Button>
        )}
        {manager && s !== 'ARCHIVED' && (
          <Button size={size} variant="ghost" onClick={() => setDialog('archive')} disabled={busy}>
            {t('archive')}
          </Button>
        )}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Dialog
        open={dialog === 'archive'}
        onClose={() => setDialog(null)}
        title={t('archiveTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {tc('cancel')}
            </Button>
            <Button variant="danger" onClick={() => void run('ARCHIVE')} disabled={busy}>
              {t('archive')}
            </Button>
          </>
        }
      >
        {t('archiveText')}
      </Dialog>
      <Dialog
        open={dialog === 'volume'}
        onClose={() => setDialog(null)}
        title={t('volumeTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={() => void run('CONFIRM', { volumeKg: volume.trim().replace(',', '.') })}
              disabled={busy}
            >
              {t('volumeSave')}
            </Button>
          </>
        }
      >
        <Input
          label={t('volume')}
          inputMode="decimal"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
        />
      </Dialog>
    </div>
  );
}
