import { type ReactNode, useEffect, useId, useRef } from 'react';

import { cn } from '../cn.js';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  /** Кнопки действий (главная — последней). */
  footer?: ReactNode;
  className?: string;
}

/**
 * Модальное окно на нативном `<dialog>`: фокус внутри окна, Esc закрывает, фон недоступен.
 * Используется для подтверждения необратимых действий (SPEC 12.1).
 */
export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-lg rounded-control border border-border bg-surface p-0 text-ink shadow-xl',
        'backdrop:bg-black/50',
        className,
      )}
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <h2 id={titleId} className="text-xl font-semibold">
            {title}
          </h2>
          {children}
          {footer && <div className="flex flex-wrap justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
