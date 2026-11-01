'use client';

import type { components } from '@baliqbozor/api-client';
import { LEGAL_ORG_FIELDS, LegalForm, orgProfileIssues } from '@baliqbozor/domain';
import { Input, PhoneInput, Select, Textarea } from '@baliqbozor/ui';
import { useTranslations } from 'next-intl';

import { useRegionOptions } from '@/lib/dict';

export type OrgFormValues = {
  legalForm: components['schemas']['LegalForm'] | '';
  name: string;
  tin: string;
  regionId: string;
  districtName: string;
  legalAddress: string;
  contactPhone: string;
  description: string;
};

export const EMPTY_ORG_FORM: OrgFormValues = {
  legalForm: '',
  name: '',
  tin: '',
  regionId: '',
  districtName: '',
  legalAddress: '',
  contactPhone: '',
  description: '',
};

/** Ошибки формы на клиенте: обязательные поля 8.1 и СТИР (те же правила, что в API). */
export function orgFormIssues(v: OrgFormValues): Set<keyof OrgFormValues> {
  const issues = new Set<keyof OrgFormValues>();
  if (!v.legalForm) issues.add('legalForm');
  if (v.name.trim().length < 2) issues.add('name');
  if (!v.regionId) issues.add('regionId');
  if (v.legalForm && orgProfileIssues({ legalForm: v.legalForm, tin: v.tin }).length > 0)
    issues.add('tin');
  if (v.contactPhone && !/^\+998\d{9}$/.test(v.contactPhone)) issues.add('contactPhone');
  return issues;
}

/** Тело запроса: пустые необязательные поля не отправляются. */
export function orgFormBody(v: OrgFormValues) {
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  return {
    legalForm: v.legalForm || undefined,
    name: v.name.trim(),
    tin: opt(v.tin),
    regionId: v.regionId ? Number(v.regionId) : undefined,
    districtName: opt(v.districtName),
    legalAddress: opt(v.legalAddress),
    contactPhone: opt(v.contactPhone),
    description: opt(v.description),
  };
}

export function OrgFields({
  values,
  onChange,
  errors,
  disabled = false,
  legalLocked = false,
}: {
  values: OrgFormValues;
  onChange: (patch: Partial<OrgFormValues>) => void;
  errors: ReadonlySet<string>;
  disabled?: boolean;
  /** Реквизиты заблокированы на проверке и после неё (D-30). */
  legalLocked?: boolean;
}) {
  const t = useTranslations('org');
  const tc = useTranslations('common');
  const regions = useRegionOptions();
  const locked = (field: (typeof LEGAL_ORG_FIELDS)[number]) =>
    disabled || (legalLocked && LEGAL_ORG_FIELDS.includes(field));
  const err = (field: keyof OrgFormValues, message?: string) =>
    errors.has(field) ? (message ?? tc('invalidValue')) : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Select
        label={t('fields.legalForm')}
        required
        name="legalForm"
        value={values.legalForm}
        onChange={(e) => onChange({ legalForm: e.target.value as OrgFormValues['legalForm'] })}
        placeholder="—"
        options={Object.values(LegalForm).map((f) => ({ value: f, label: t(`legalForm.${f}`) }))}
        disabled={locked('legalForm')}
        error={err('legalForm', tc('requiredField'))}
      />
      <Input
        label={t('fields.name')}
        required
        name="name"
        value={values.name}
        onChange={(e) => onChange({ name: e.target.value })}
        maxLength={200}
        disabled={locked('name')}
        error={err('name', tc('requiredField'))}
      />
      <Input
        label={t('fields.tin')}
        name="tin"
        value={values.tin}
        onChange={(e) => onChange({ tin: e.target.value.replace(/\D/g, '').slice(0, 9) })}
        inputMode="numeric"
        hint={t('fields.tinHint')}
        disabled={locked('tin')}
        error={err('tin')}
      />
      <Select
        label={t('fields.region')}
        required
        name="regionId"
        value={values.regionId}
        onChange={(e) => onChange({ regionId: e.target.value })}
        placeholder={t('fields.regionPlaceholder')}
        options={regions}
        disabled={disabled}
        error={err('regionId', tc('requiredField'))}
      />
      <Input
        label={t('fields.district')}
        name="districtName"
        value={values.districtName}
        onChange={(e) => onChange({ districtName: e.target.value })}
        maxLength={120}
        disabled={disabled}
      />
      <PhoneInput
        label={t('fields.contactPhone')}
        name="contactPhone"
        value={values.contactPhone}
        onChange={(contactPhone) => onChange({ contactPhone })}
        disabled={disabled}
        error={err('contactPhone')}
      />
      <div className="sm:col-span-2">
        <Input
          label={t('fields.legalAddress')}
          name="legalAddress"
          value={values.legalAddress}
          onChange={(e) => onChange({ legalAddress: e.target.value })}
          maxLength={500}
          disabled={disabled}
        />
      </div>
      <div className="sm:col-span-2">
        <Textarea
          label={t('fields.description')}
          name="description"
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          maxLength={2000}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
