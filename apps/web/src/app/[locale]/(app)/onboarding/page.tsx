'use client';

import type { components } from '@baliqbozor/api-client';
import { OrgType } from '@baliqbozor/domain';
import { Alert, Button, cn } from '@baliqbozor/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import {
  EMPTY_ORG_FORM,
  OrgFields,
  orgFormBody,
  orgFormIssues,
  type OrgFormValues,
} from '@/components/org-form';
import { Page, Section } from '@/components/page';
import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { invalidFields, unwrap, useErrorText } from '@/lib/errors';
import { ME_QUERY_KEY, useSession } from '@/lib/session';

type OrgTypeValue = components['schemas']['OrgType'];

/** Онбординг (SPEC 8.1 п. 2): тип → форма, название, регион, СТИР, телефон. Создатель — OWNER. */
export default function OnboardingPage() {
  const t = useTranslations('web.onboarding');
  const tOrg = useTranslations('org');
  const errorText = useErrorText();
  const api = useApi();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { me, selectOrg } = useSession();

  const [type, setType] = useState<OrgTypeValue | null>(null);
  const [values, setValues] = useState<OrgFormValues>({
    ...EMPTY_ORG_FORM,
    contactPhone: me?.phone ?? '',
  });
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!type) return;
    const issues = orgFormIssues(values);
    setErrors(issues);
    if (issues.size > 0) return;
    setBusy(true);
    setError(null);
    try {
      const body = orgFormBody(values);
      const org = await unwrap(
        api.POST('/api/v1/orgs', {
          body: {
            ...body,
            type,
            legalForm: values.legalForm as NonNullable<typeof body.legalForm>,
          },
        }),
      );
      selectOrg(org.id);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      router.replace('/org');
    } catch (err) {
      setErrors(invalidFields(err));
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Page title={t('title')}>
      <p className="-mt-3 text-ink-muted">{t('subtitle')}</p>
      {!type ? (
        <Section title={t('chooseType')}>
          <ul className="grid gap-3 sm:grid-cols-3">
            {Object.values(OrgType).map((value) => (
              <li key={value}>
                <button
                  type="button"
                  data-testid={`org-type-${value}`}
                  onClick={() => setType(value)}
                  className={cn(
                    'flex h-full min-h-28 w-full flex-col items-start gap-1 rounded-control border-2 border-border-strong bg-surface p-4 text-left',
                    'hover:border-brand-600 hover:bg-brand-50',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  )}
                >
                  <span className="text-lg font-semibold text-ink">{tOrg(`type.${value}`)}</span>
                  <span className="text-ink-muted">{tOrg(`typeHint.${value}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Section>
          <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg">
                <span className="text-ink-muted">{`${tOrg('fields.type')}: `}</span>
                <strong data-testid="chosen-type">{tOrg(`type.${type}`)}</strong>
              </p>
              <Button variant="ghost" onClick={() => setType(null)}>
                {t('changeType')}
              </Button>
            </div>
            <Alert tone="info">{t('typeLocked')}</Alert>
            <OrgFields
              values={values}
              onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
              errors={errors}
            />
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" size="lg" disabled={busy} className="self-start">
              {t('submit')}
            </Button>
          </form>
        </Section>
      )}
    </Page>
  );
}
