import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../cn.js';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800',
  secondary: 'border border-border-strong bg-surface text-ink hover:bg-surface-muted',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50',
};

/** Крупные элементы по SPEC 12.1: минимум 44 px по высоте. */
const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-14 px-6 text-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  );
}
