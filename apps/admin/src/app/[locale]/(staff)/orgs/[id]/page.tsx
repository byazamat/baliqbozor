'use client';

import type { components } from '@baliqbozor/api-client';
import { formatDate, formatDateTime, formatPhone } from '@baliqbozor/i18n';
import { Alert, type AlertTone, Badge, Button, Dialog, Textarea } from '@baliqbozor/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

import { Loading, Page, Section } from '@/components/page';
import { VerificationBadge } from '@/components/status-badge';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { unwrap, useErrorText } from '@/lib/errors';
import { mediaUrl } from '@/lib/media';
import { availableActions, type DecisionAction, NOTE_REQUIRED } from '@/lib/verification';

type Details = components['schemas']['AdminOrgDetailsDto'];
type Doc = Details['documents'][number];
const ACTION_VARIANT = {
  verify: 'primary',
  reject: 'danger',
  suspend: 'secondary',
  unsuspend: 'secondary',
} as const;

const orgDetailsKey = (id: string) => ['admin', 'org', id] as const;

/** Карточка организации (SPEC 12.3): данные, участники, документы, решение по верификации. */
export default function OrgCardPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('admin.org');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const api = useApi();
  const query = useQuery({
    queryKey: orgDetailsKey(id),
    queryFn: () => unwrap(api.GET('/api/v1/admin/orgs/{id}', { params: { path: { id } } })),
  });

  if (query.isPending) return <Loading label={tc('loading')} />;
  if (query.isError) {
    return (
      <Page title={t('back')}>
        <Alert
          tone="danger"
          action={<Button onClick={() => void query.refetch()}>{tc('retry')}</Button>}
        >
          {errorText(query.error)}
        </Alert>
      </Page>
    );
  }
  return <OrgCard details={query.data} />;
}

function OrgCard({ details }: { details: Details }) {
  const { org, members, documents, tasks } = details;
  const t = useTranslations('admin.org');
  const tOrg = useTranslations('org');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();

  const [action, setAction] = useState<DecisionAction | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: AlertTone; text: string } | null>(null);

  const open = (a: DecisionAction) => {
    setAction(a);
    setNote('');
    setNoteError(null);
  };

  const decide = async () => {
    if (!action) return;
    const trimmed = note.trim();
    if (NOTE_REQUIRED.has(action) && trimmed.length < 3) {
      setNoteError(t('noteRequired'));
      return;
    }
    setBusy(true);
    setMessage(null);
    const path = { params: { path: { id: org.id } } };
    const body = trimmed ? { note: trimmed } : {};
    try {
      if (action === 'verify')
        await unwrap(api.POST('/api/v1/admin/orgs/{id}/verify', { ...path, body }));
      if (action === 'unsuspend')
        await unwrap(api.POST('/api/v1/admin/orgs/{id}/unsuspend', { ...path, body }));
      if (action === 'reject')
        await unwrap(
          api.POST('/api/v1/admin/orgs/{id}/reject', { ...path, body: { note: trimmed } }),
        );
      if (action === 'suspend')
        await unwrap(
          api.POST('/api/v1/admin/orgs/{id}/suspend', { ...path, body: { note: trimmed } }),
        );
      setMessage({ tone: 'success', text: t(`done.${action}`) });
      setAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orgDetailsKey(org.id) }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'orgs'] }),
      ]);
    } catch (err) {
      setMessage({ tone: 'danger', text: errorText(err) });
      setAction(null);
    } finally {
      setBusy(false);
    }
  };

  const region = org.region ? (locale === 'ru' ? org.region.nameRu : org.region.nameUz) : null;
  const rows: [string, ReactNode][] = [
    [tOrg('fields.type'), tOrg(`type.${org.type}`)],
    [tOrg('fields.legalForm'), tOrg(`legalForm.${org.legalForm}`)],
    [tOrg('fields.tin'), org.private?.tin ?? tc('notSet')],
    [tOrg('fields.region'), region ?? tc('notSet')],
    [tOrg('fields.district'), org.private?.districtName ?? tc('notSet')],
    [tOrg('fields.legalAddress'), org.private?.legalAddress ?? tc('notSet')],
    [
      tOrg('fields.contactPhone'),
      org.private?.contactPhone ? formatPhone(org.private.contactPhone) : tc('notSet'),
    ],
    [tOrg('fields.description'), org.description ?? tc('notSet')],
    [t('verifiedAt'), org.verifiedAt ? formatDateTime(org.verifiedAt) : tc('notSet')],
    [t('note'), org.private?.verificationNote ?? tc('notSet')],
  ];
  const actions = availableActions(org);

  return (
    <Page
      title={org.name}
      aside={
        <div className="flex items-center gap-3">
          <VerificationBadge status={org.verificationStatus} />
          <Link href="/" className="font-medium text-brand-700 underline-offset-2 hover:underline">
            {t('back')}
          </Link>
        </div>
      }
    >
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Section title={t('actions')} data-testid="org-actions">
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a} variant={ACTION_VARIANT[a]} onClick={() => open(a)} disabled={busy}>
              {t(a)}
            </Button>
          ))}
        </div>
        {tasks.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold text-ink">{t('tasks')}</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {tasks.map((task) => (
                <li key={task.id} className="rounded-control bg-surface-muted px-3 py-2">
                  <p className="text-sm text-ink-muted">{formatDateTime(task.createdAt)}</p>
                  {task.description && (
                    <p>
                      <span className="text-ink-muted">{`${t('submitterNote')}: `}</span>
                      {task.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('data')}>
          <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="break-words text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={t('members')}>
          <ul className="flex flex-col divide-y divide-border">
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium text-ink">{m.fullName ?? tc('notSet')}</p>
                  <p className="text-ink-muted tabular-nums">{formatPhone(m.phone)}</p>
                </div>
                <Badge>{tOrg(`role.${m.role}`)}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title={t('documents')} data-testid="documents">
        {documents.length === 0 ? (
          <p className="text-ink-muted">{t('noDocuments')}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((d) => (
              <DocumentCard key={d.id} doc={d} />
            ))}
          </ul>
        )}
      </Section>

      <Dialog
        open={action !== null}
        onClose={() => setAction(null)}
        title={action ? t(`confirm.${action}`, { org: org.name }) : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)}>
              {tc('cancel')}
            </Button>
            {action && (
              <Button
                variant={ACTION_VARIANT[action]}
                disabled={busy}
                onClick={() => void decide()}
              >
                {t(action)}
              </Button>
            )}
          </>
        }
      >
        {action && (
          <>
            <p>{t(`confirmBody.${action}`)}</p>
            <Textarea
              label={`${t('noteLabel')}${NOTE_REQUIRED.has(action) ? '' : ` (${tc('optional')})`}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required={NOTE_REQUIRED.has(action)}
              error={noteError}
              maxLength={1000}
            />
          </>
        )}
      </Dialog>
    </Page>
  );
}

/** Документ: изображение — превью по подписанной ссылке, любой файл — открыть в новой вкладке. */
function DocumentCard({ doc }: { doc: Doc }) {
  const tOrg = useTranslations('org');
  const tc = useTranslations('common');
  const api = useApi();
  const url = useQuery({
    queryKey: ['admin', 'media', doc.id],
    queryFn: () => mediaUrl(api, doc.id),
    // Ссылка живёт 10 минут; обновляем заранее.
    staleTime: 5 * 60_000,
    refetchInterval: 8 * 60_000,
  });
  const label = `${tOrg(`mediaKind.${doc.kind}`)} · ${formatDate(doc.createdAt)}`;
  return (
    <li className="flex flex-col gap-2 rounded-control border border-border p-3">
      {doc.kind === 'IMAGE' && url.data && (
        // Превью с подписанной ссылки хранилища; next/image здесь не нужен.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url.data}
          alt={label}
          className="aspect-video w-full rounded-control bg-surface-muted object-contain"
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">{label}</span>
        {url.data && (
          <a
            href={url.data}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-control px-3 font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            {tc('open')}
          </a>
        )}
      </div>
    </li>
  );
}
