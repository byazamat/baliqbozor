import { type DragEvent, type ReactNode, useId, useState } from 'react';

import { cn } from '../cn.js';

export interface FileUploadProps {
  /** Заголовок над зоной; можно опустить, если он уже есть рядом. */
  label?: ReactNode;
  /** Текст на кнопке выбора файла. */
  buttonLabel: ReactNode;
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
}

/** Выбор файлов кнопкой или перетаскиванием; само поле `input[type=file]` доступно с клавиатуры. */
export function FileUpload({
  label,
  buttonLabel,
  onFiles,
  accept,
  multiple,
  disabled,
  hint,
  error,
  className,
}: FileUploadProps) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <span className="font-medium text-ink">{label}</span>}
      <div
        data-dragging={dragging || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-control border-2 border-dashed px-4 py-6 text-center',
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-600',
          dragging ? 'border-brand-600 bg-brand-50' : 'border-border-strong bg-surface',
          error && 'border-danger-600',
          disabled && 'opacity-60',
        )}
      >
        <label
          htmlFor={id}
          className={cn(
            'inline-flex min-h-11 cursor-pointer items-center rounded-control bg-brand-700 px-4 font-medium text-white hover:bg-brand-800',
            disabled && 'cursor-not-allowed',
          )}
        >
          {buttonLabel}
        </label>
        <input
          id={id}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length > 0) onFiles(files);
          }}
        />
        {hint && (
          <p id={`${id}-hint`} className="text-sm text-ink-muted">
            {hint}
          </p>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
