import type { ReactNode } from 'react';

import { cn } from '../cn.js';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Пустое состояние с подсказкой, что делать дальше (SPEC 12.1). */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-control border border-dashed border-border-strong bg-surface px-6 py-10 text-center',
        className,
      )}
    >
      <p className="text-lg font-semibold text-ink">{title}</p>
      {description && <p className="max-w-md text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
