'use client';

import { Alert, Button } from '@baliqbozor/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import {
  EMPTY_ORG_FORM,
  OrgFields,
  orgFormBody,
  orgFormIssues,
  type OrgFormValues,
} from '@/components/org-form';
import { Loading, Page, Section } from '@/components/page';
import { VerificationBadge } from '@/components/status-badge';
import { useApi } from '@/lib/api';
import { invalidFields, unwrap, useErrorText } from '@/lib/errors';
import { type Org, orgQueryKey } from '@/lib/org';
import { ME_QUERY_KEY, useCurrentOrg } from '@/lib/session';

import { VerificationSection } from './verification-section';

const toForm = (org: Org): OrgFormValues => ({
  ...EMPTY_ORG_FORM,
  legalForm: org.legalForm,
  name: org.name,
  tin: org.private?.tin ?? '',
  regionId: org.region ? String(org.region.id) : '',
  districtName: org.private?.districtName ?? '',
  legalAddress: org.private?.legalAddress ?? '',
  contactPhone: org.private?.contactPhone ?? '',
  description: org.description ?? '',
});

export default function OrgPage() {
  const t = useTranslations('web.org');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const api = useApi();
  const current = useCurrentOrg();

  const {
    data: org,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: orgQueryKey(current.id),
    queryFn: () => unwrap(api.GET('/api/v1/orgs/{id}', { params: { path: { id: current.id } } })),
  });

  if (loadError) {
    return (
      <Page title={t('title')}>
        <Alert tone="danger" action={<Button onClick={() => void refetch()}>{tc('retry')}</Button>}>
          {errorText(loadError)}
        </Alert>
      </Page>
    );
  }
  if (!org) return <Loading label={tc('loading')} />;
  // key: при переключении организации форма начинается заново с её данных.
  return <OrgProfile key={org.id} org={org} />;
}

function OrgProfile({ org }: { org: Org }) {
  const t = useTranslations('web.org');
  const tOrg = useTranslations('org');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const api = useApi();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<OrgFormValues>(() => toForm(org));
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = org.private?.myRole === 'OWNER';
  const status = org.verificationStatus;
  const suspended = status === 'SUSPENDED';
  const legalLocked = status === 'PENDING' || status === 'VERIFIED';

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const issues = orgFormIssues(values);
    setErrors(issues);
    if (issues.size > 0) return;
    setBusy(true);
    setMessage(null);
    const body = orgFormBody(values);
    // Заблокированные реквизиты не отправляем: их правка на проверке и после неё — 409 (D-30).
    const patch = legalLocked
      ? { ...body, legalForm: undefined, name: undefined, tin: undefined }
      : { ...body, tin: values.tin.trim() };
    try {
      const updated = await unwrap(
        api.PATCH('/api/v1/orgs/{id}', { params: { path: { id: org.id } }, body: patch }),
      );
      queryClient.setQueryData(orgQueryKey(org.id), updated);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      setMessage({ tone: 'success', text: tc('saved') });
    } catch (err) {
      setErrors(invalidFields(err));
      setMessage({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title={org.name}
      aside={
        <div className="flex items-center gap-2">
          <span className="text-ink-muted">{tOrg(`type.${org.type}`)}</span>
          <VerificationBadge status={status} />
        </div>
      }
    >
      <VerificationSection org={org} canSubmit={isOwner} />

      <Section title={t('data')} data-testid="org-data">
        <form onSubmit={(e) => void save(e)} noValidate className="flex flex-col gap-4">
          {!isOwner && <Alert tone="info">{t('readOnly')}</Alert>}
          {isOwner && suspended && <Alert tone="warning">{t('suspended')}</Alert>}
          {isOwner && legalLocked && <Alert tone="info">{t('legalLocked')}</Alert>}
          <OrgFields
            values={values}
            onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
            errors={errors}
            disabled={!isOwner || suspended}
            legalLocked={legalLocked}
          />
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          {isOwner && !suspended && (
            <Button type="submit" disabled={busy} className="self-start">
              {tc('save')}
            </Button>
          )}
        </form>
      </Section>
    </Page>
  );
}
