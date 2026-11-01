import type { ReactNode } from 'react';

import { cn } from '../cn.js';

export interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** id подсказки и ошибки для `aria-describedby` поля. */
export function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/** Обёртка поля: подпись над полем, подсказка и ошибка под ним (SPEC 12.1 — подписи у полей). */
export function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger-600">
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Общий вид полей ввода: высота ≥ 44 px, рамка с контрастом ≥ 3:1, видимый фокус. */
export const controlClass = (invalid: boolean) =>
  cn(
    'min-h-11 w-full rounded-control border bg-surface px-3 text-base text-ink',
    'placeholder:text-ink-muted',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
    'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted',
    invalid ? 'border-danger-600' : 'border-border-strong',
  );
