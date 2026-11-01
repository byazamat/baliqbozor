'use client';

import { formatDate } from '@baliqbozor/i18n';
import { Alert, type AlertTone, Button, EmptyState, FileUpload, Textarea } from '@baliqbozor/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Section } from '@/components/page';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { unwrap, useErrorText } from '@/lib/errors';
import { documentsQueryKey, openMedia, type Org, orgQueryKey } from '@/lib/org';
import { farmsQueryKey } from '@/lib/listings';
import { ME_QUERY_KEY, orgHeaders } from '@/lib/session';
import { formatMegabytes, uploadOrgDocument } from '@/lib/upload';

const STATUS_TONE: Record<Org['verificationStatus'], AlertTone> = {
  UNVERIFIED: 'info',
  PENDING: 'info',
  VERIFIED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'warning',
};

/** Статус верификации, документы и отправка на проверку (SPEC 8.1 п. 3–5, D-29, D-30). */
export function VerificationSection({ org, canSubmit }: { org: Org; canSubmit: boolean }) {
  const t = useTranslations('web.org');
  const tOrg = useTranslations('org');
  const tc = useTranslations('common');
  const tf = useTranslations('web.farms');
  const errorText = useErrorText();
  const api = useApi();
  const queryClient = useQueryClient();
  const status = org.verificationStatus;
  const editable = canSubmit && (status === 'UNVERIFIED' || status === 'REJECTED');

  // D-28: продавцу до проверки нужно хотя бы одно активное хозяйство.
  const { data: farms } = useQuery({
    queryKey: farmsQueryKey(org.id),
    enabled: org.type === 'SELLER',
    queryFn: () => unwrap(api.GET('/api/v1/farms', { params: { header: orgHeaders(org.id) } })),
  });
  const needFarm = org.type === 'SELLER' && !!farms && !farms.some((f) => f.isActive);

  const { data: documents = [] } = useQuery({
    queryKey: documentsQueryKey(org.id),
    queryFn: () =>
      unwrap(api.GET('/api/v1/orgs/{id}/documents', { params: { path: { id: org.id } } })),
  });

  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [uploading, setUploading] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: AlertTone; text: string } | null>(null);

  const selected = documents.filter((d) => !excluded.has(d.id)).map((d) => d.id);

  const onFiles = async (files: File[]) => {
    setMessage(null);
    for (const file of files) {
      setUploading(file.name);
      try {
        await uploadOrgDocument(api, org.id, file);
      } catch (err) {
        setMessage({
          tone: 'danger',
          text: t('uploadFailed', { name: file.name, reason: errorText(err) }),
        });
      }
    }
    setUploading(null);
    await queryClient.invalidateQueries({ queryKey: documentsQueryKey(org.id) });
  };

  const submit = async () => {
    if (selected.length === 0) {
      setMessage({ tone: 'danger', text: t('selectOne') });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await unwrap(
        api.POST('/api/v1/orgs/{id}/verification', {
          params: { path: { id: org.id } },
          body: { mediaIds: selected, ...(note.trim() ? { note: note.trim() } : {}) },
        }),
      );
      setNote('');
      setMessage({ tone: 'success', text: t('submitted') });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orgQueryKey(org.id) }),
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      ]);
    } catch (err) {
      setMessage({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const view = (id: string) => {
    openMedia(api, id).catch((err: unknown) => {
      setMessage({ tone: 'danger', text: errorText(err) });
    });
  };

  return (
    <Section title={t('verification')} data-testid="verification">
      <div className="flex flex-col gap-4">
        <Alert tone={STATUS_TONE[status]} title={tOrg(`status.${status}`)}>
          <p>{t(`statusText.${status}`)}</p>
          {status === 'REJECTED' && org.private?.verificationNote && (
            <p className="mt-1 font-medium" data-testid="reject-reason">
              {t('rejectReason', { note: org.private.verificationNote })}
            </p>
          )}
        </Alert>
        {needFarm && editable && (
          <Alert
            tone="warning"
            action={
              <Link href="/farms/new" className="font-medium text-brand-700 underline">
                {tf('goFarms')}
              </Link>
            }
          >
            {tf('needFarm')}
          </Alert>
        )}
        {org.type === 'BUYER' && status === 'UNVERIFIED' && (
          <p className="text-ink-muted">{t('buyerOptional')}</p>
        )}

        <h3 className="font-semibold text-ink">{t('documents')}</h3>
        {documents.length === 0 ? (
          <EmptyState
            title={t('noDocuments')}
            description={editable ? t('noDocumentsHint') : undefined}
          />
        ) : (
          <ul
            className="flex flex-col divide-y divide-border rounded-control border border-border"
            data-testid="documents"
          >
            {documents.map((d) => {
              const label = t('document', {
                kind: tOrg(`mediaKind.${d.kind}`),
                size: tc('megabytes', { value: formatMegabytes(d.sizeBytes) }),
                date: formatDate(d.createdAt),
              });
              return (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  {editable ? (
                    <label className="flex min-h-11 items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-5 accent-brand-700"
                        checked={!excluded.has(d.id)}
                        aria-label={t('include', { name: label })}
                        onChange={(e) => {
                          const next = new Set(excluded);
                          if (e.target.checked) next.delete(d.id);
                          else next.add(d.id);
                          setExcluded(next);
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  ) : (
                    <span className="py-2">{label}</span>
                  )}
                  <Button variant="ghost" onClick={() => view(d.id)}>
                    {tc('open')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {editable && (
          <>
            <FileUpload
              buttonLabel={t('upload')}
              hint={uploading ? t('uploading', { name: uploading }) : t('documentsHint')}
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              multiple
              disabled={uploading !== null}
              onFiles={(files) => void onFiles(files)}
            />
            <Textarea
              label={t('note')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </>
        )}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {editable && (
          <Button
            size="lg"
            onClick={() => void submit()}
            disabled={busy || uploading !== null || documents.length === 0}
            className="self-start"
          >
            {t('submit')}
          </Button>
        )}
      </div>
    </Section>
  );
}
