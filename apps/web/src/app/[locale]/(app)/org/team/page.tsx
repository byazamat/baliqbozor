'use client';

import { formatDate, formatPhone } from '@baliqbozor/i18n';
import { MemberRole } from '@baliqbozor/domain';
import {
  Alert,
  type AlertTone,
  Badge,
  Button,
  Dialog,
  isCompletePhone,
  PhoneInput,
  Select,
} from '@baliqbozor/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import { Loading, Page, Section } from '@/components/page';
import { useApi } from '@/lib/api';
import { unwrap, useErrorText } from '@/lib/errors';
import { type MemberRole as Role, membersQueryKey } from '@/lib/org';
import { useCurrentOrg, useSession } from '@/lib/session';

/** Команда организации (SPEC 8.1, 9): управляет OWNER, остальные видят состав. */
export default function TeamPage() {
  const t = useTranslations('web.team');
  const tRole = useTranslations('org.role');
  const tRoleHint = useTranslations('org.roleHint');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const api = useApi();
  const queryClient = useQueryClient();
  const org = useCurrentOrg();
  const { me } = useSession();
  const isOwner = org.role === 'OWNER';
  const path = { params: { path: { id: org.id } } };

  const {
    data,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: membersQueryKey(org.id),
    queryFn: () => unwrap(api.GET('/api/v1/orgs/{id}/members', path)),
  });

  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: AlertTone; text: string } | null>(null);
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);

  const roleOptions = Object.values(MemberRole).map((r) => ({ value: r, label: tRole(r) }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: membersQueryKey(org.id) });

  /** Действие OWNER: результат или `null` при ошибке (текст ошибки — по `error.code`). */
  const run = async <T,>(action: () => Promise<T>, success: (result: T) => string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      setMessage({ tone: 'success', text: success(result) });
      await refresh();
      return result;
    } catch (err) {
      setMessage({ tone: 'danger', text: errorText(err) });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!isCompletePhone(phone)) {
      setPhoneError(tc('invalidValue'));
      return;
    }
    setPhoneError(null);
    const shown = formatPhone(phone);
    const res = await run(
      () => unwrap(api.POST('/api/v1/orgs/{id}/members', { ...path, body: { phone, role } })),
      (r) => (r.result === 'ADDED' ? t('added', { phone: shown }) : t('invited', { phone: shown })),
    );
    if (res) setPhone('');
  };

  if (loadError) {
    return (
      <Page title={t('title')}>
        <Alert tone="danger" action={<Button onClick={() => void refetch()}>{tc('retry')}</Button>}>
          {errorText(loadError)}
        </Alert>
      </Page>
    );
  }
  if (!data) return <Loading label={tc('loading')} />;

  return (
    <Page title={t('title')}>
      {!isOwner && <Alert tone="info">{t('onlyOwner')}</Alert>}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Section title={t('members')} data-testid="members">
        <ul className="flex flex-col divide-y divide-border">
          {data.members.map((m) => {
            const name = m.fullName ?? t('noName');
            const isMe = m.userId === me?.id;
            return (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {name}
                    {isMe && <span className="ml-2 text-ink-muted">{`(${t('you')})`}</span>}
                  </p>
                  <p className="text-ink-muted">{formatPhone(m.phone)}</p>
                </div>
                {isOwner ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <Select
                      label={<span className="sr-only">{t('roleOf', { name })}</span>}
                      value={m.role}
                      options={roleOptions}
                      disabled={busy}
                      onChange={(e) => {
                        const next = e.target.value as Role;
                        void run(
                          () =>
                            unwrap(
                              api.PATCH('/api/v1/orgs/{id}/members/{userId}', {
                                params: { path: { id: org.id, userId: m.userId } },
                                body: { role: next },
                              }),
                            ),
                          () => t('roleChanged'),
                        );
                      }}
                    />
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setRemoving({ userId: m.userId, name })}
                    >
                      {t('remove')}
                    </Button>
                  </div>
                ) : (
                  <Badge>{tRole(m.role)}</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {isOwner && data.invitations.length > 0 && (
        <Section title={t('invitations')} data-testid="invitations">
          <p className="-mt-2 mb-3 text-ink-muted">{t('invitationsHint')}</p>
          <ul className="flex flex-col divide-y divide-border">
            {data.invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{formatPhone(inv.phone)}</p>
                  <p className="text-ink-muted">
                    {`${tRole(inv.role)} · ${t('expires', { date: formatDate(inv.expiresAt) })}`}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        unwrap(
                          api.DELETE('/api/v1/orgs/{id}/invitations/{invitationId}', {
                            params: { path: { id: org.id, invitationId: inv.id } },
                          }),
                        ),
                      () => t('revoked'),
                    )
                  }
                >
                  {t('revoke')}
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {isOwner && (
        <Section title={t('invite')}>
          <form
            onSubmit={(e) => void invite(e)}
            noValidate
            className="grid items-end gap-4 sm:grid-cols-[1fr_14rem_auto]"
          >
            <PhoneInput
              label={t('phone')}
              value={phone}
              onChange={setPhone}
              error={phoneError}
              required
            />
            <Select
              label={t('role')}
              value={role}
              options={roleOptions}
              onChange={(e) => setRole(e.target.value as Role)}
              hint={tRoleHint(role)}
            />
            <Button type="submit" disabled={busy}>
              {t('inviteSubmit')}
            </Button>
          </form>
        </Section>
      )}

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('removeTitle', { name: removing?.name ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {tc('cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (!removing) return;
                const target = removing;
                setRemoving(null);
                void run(
                  () =>
                    unwrap(
                      api.DELETE('/api/v1/orgs/{id}/members/{userId}', {
                        params: { path: { id: org.id, userId: target.userId } },
                      }),
                    ),
                  () => t('removed'),
                );
              }}
            >
              {t('remove')}
            </Button>
          </>
        }
      >
        <p>{t('removeBody')}</p>
      </Dialog>
    </Page>
  );
}
