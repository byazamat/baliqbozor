import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../cn.js';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<AlertTone, string> = {
  info: 'border-status-info-fg/30 bg-status-info-bg text-status-info-fg',
  success: 'border-status-success-fg/30 bg-status-success-bg text-status-success-fg',
  warning: 'border-status-warning-fg/30 bg-status-warning-bg text-status-warning-fg',
  danger: 'border-status-danger-fg/30 bg-status-danger-bg text-status-danger-fg',
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  title?: ReactNode;
  action?: ReactNode;
}

/** Сообщение на странице; ошибки объявляются скринридером сразу (`role="alert"`). */
export function Alert({ tone = 'info', title, action, className, children, ...props }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      data-tone={tone}
      className={cn('rounded-control border px-4 py-3', TONES[tone], className)}
      {...props}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-1')}>{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
