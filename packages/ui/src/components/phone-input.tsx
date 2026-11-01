import { type InputHTMLAttributes, type ReactNode, useId } from 'react';

import { cn } from '../cn.js';
import { controlClass, describedBy, Field } from './field.js';

const PREFIX = '+998';

/** 9 цифр номера после кода страны из любого ввода (вставка `+998 90 …`, `90-123…`). */
export function phoneDigits(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.length > 9 && digits.startsWith('998')) digits = digits.slice(3);
  return digits.slice(0, 9);
}

/** Маска `90 123 45 67` для части номера после `+998` (D-32). */
export function maskPhoneDigits(digits: string): string {
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)];
  return parts.filter(Boolean).join(' ');
}

export function isCompletePhone(value: string): boolean {
  return /^\+998\d{9}$/.test(value);
}

export interface PhoneInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'children'
> {
  label: ReactNode;
  /** Номер в формате хранения `+998XXXXXXXXX` (может быть неполным) или `''`. */
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
}

/** Телефон Узбекистана: код `+998` фиксирован, ввод 9 цифр с маской `90 123 45 67`. */
export function PhoneInput({
  label,
  value,
  onChange,
  hint,
  error,
  id,
  className,
  required,
  ...props
}: PhoneInputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const digits = phoneDigits(value.startsWith(PREFIX) ? value.slice(PREFIX.length) : value);
  return (
    <Field id={inputId} label={label} hint={hint} error={error} required={required}>
      <div className="flex items-stretch">
        <span
          aria-hidden="true"
          className="inline-flex items-center rounded-l-control border border-r-0 border-border-strong bg-surface-muted px-3 text-base text-ink"
        >
          {PREFIX}
        </span>
        <input
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="90 123 45 67"
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, hint, error)}
          value={maskPhoneDigits(digits)}
          onChange={(e) => {
            const next = phoneDigits(e.target.value);
            onChange(next ? `${PREFIX}${next}` : '');
          }}
          className={cn(controlClass(!!error), 'rounded-l-none', className)}
          {...props}
        />
      </div>
    </Field>
  );
}
