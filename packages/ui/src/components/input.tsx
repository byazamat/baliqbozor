import {
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

import { cn } from '../cn.js';
import { controlClass, describedBy, Field } from './field.js';

interface FieldOwnProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export interface InputProps
  extends FieldOwnProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {}

export function Input({ label, hint, error, id, className, required, ...props }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field id={inputId} label={label} hint={hint} error={error} required={required}>
      <input
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={cn(controlClass(!!error), className)}
        {...props}
      />
    </Field>
  );
}

export interface TextareaProps
  extends FieldOwnProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'children'> {}

export function Textarea({ label, hint, error, id, className, required, ...props }: TextareaProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field id={inputId} label={label} hint={hint} error={error} required={required}>
      <textarea
        id={inputId}
        required={required}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={cn(controlClass(!!error), 'py-2', className)}
        {...props}
      />
    </Field>
  );
}
