import type { HTMLAttributes } from 'react';

import { cn } from '../cn.js';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
  info: 'bg-status-info-bg text-status-info-fg',
  success: 'bg-status-success-bg text-status-success-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Цвет — дополнение к тексту, а не замена (SPEC 12.1): текст статуса обязателен. */
  tone?: BadgeTone;
  children: NonNullable<HTMLAttributes<HTMLSpanElement>['children']>;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
