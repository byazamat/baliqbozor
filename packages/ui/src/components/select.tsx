import { type ReactNode, type SelectHTMLAttributes, useId } from 'react';

import { cn } from '../cn.js';
import { controlClass, describedBy, Field } from './field.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: ReactNode;
  options: readonly SelectOption[];
  /** Пустой первый пункт «выберите…» (значение `''`). */
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
}

/** Нативный select: работает с клавиатуры и на телефоне без дополнительного кода. */
export function Select({
  label,
  options,
  placeholder,
  hint,
  error,
  id,
  className,
  required,
  ...props
}: SelectProps) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <Field id={selectId} label={label} hint={hint} error={error} required={required}>
      <select
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(selectId, hint, error)}
        className={cn(controlClass(!!error), 'pr-8', className)}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
