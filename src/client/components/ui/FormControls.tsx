import React, { useEffect, useId, useRef } from 'react';
import { FileText, Paperclip, Trash2, X } from 'lucide-react';
import { JALALI_MONTH_NAMES, toPersianDigits } from '@shared/jalali';
import { DangerButton, PrimaryButton, SecondaryButton } from './Primitives';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
}: FormFieldProps) {
  const autoId = useId();
  const fieldId = htmlFor ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-err` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-semibold text-brand-text">
        {label}
        {required && (
          <span className="text-status-danger mr-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({
        id: fieldId,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-brand-muted leading-relaxed">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-status-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const INPUT_CLASS =
  'w-full min-h-[44px] px-3.5 py-2 rounded-control border border-brand-border bg-brand-surface text-brand-text text-sm placeholder:text-brand-muted/70 focus:border-brand-blue transition-colors aria-[invalid=true]:border-status-danger';

/**
 * Single-month Persian/Jalali insurance period selector.
 * Enforces selecting exactly ONE Jalali year + ONE Jalali month (no date range or multi-month).
 */
export function JalaliMonthPicker({
  year,
  month,
  baseYear = 1405,
  onChange,
  error,
}: {
  year: number;
  month: number;
  baseYear?: number;
  onChange: (next: { jalaliYear: number; jalaliMonth: number }) => void;
  error?: string;
}) {
  const yearOptions = [baseYear - 2, baseYear - 1, baseYear, baseYear + 1];

  return (
    <fieldset className="p-4 rounded-card border border-brand-border bg-brand-subtle/40 space-y-3">
      <legend className="px-2 text-sm font-bold text-brand-navy">
        انتخاب ماه بیمه‌ای (فقط یک ماه در هر درخواست) *
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="jalali-year-select"
            className="block text-xs font-semibold text-brand-muted mb-1"
          >
            سال شمسی
          </label>
          <select
            id="jalali-year-select"
            value={year}
            onChange={(e) => onChange({ jalaliYear: Number(e.target.value), jalaliMonth: month })}
            className={INPUT_CLASS}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                سال {toPersianDigits(y)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="jalali-month-select"
            className="block text-xs font-semibold text-brand-muted mb-1"
          >
            ماه شمسی
          </label>
          <select
            id="jalali-month-select"
            value={month}
            onChange={(e) => onChange({ jalaliYear: year, jalaliMonth: Number(e.target.value) })}
            className={INPUT_CLASS}
          >
            {JALALI_MONTH_NAMES.map((mName, idx) => {
              const mNum = idx + 1;
              return (
                <option key={mNum} value={mNum}>
                  {toPersianDigits(mNum)} — {mName}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Quick visual month pills for intuitive Persian selection */}
      <div
        className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1"
        role="group"
        aria-label="انتخاب سریع ماه"
      >
        {JALALI_MONTH_NAMES.map((mName, idx) => {
          const mNum = idx + 1;
          const selected = mNum === month;
          return (
            <button
              key={mNum}
              type="button"
              onClick={() => onChange({ jalaliYear: year, jalaliMonth: mNum })}
              aria-pressed={selected}
              className={`min-h-[36px] px-2 py-1 rounded-control text-xs font-medium border transition-colors ${
                selected
                  ? 'bg-brand-navy text-white border-brand-navy font-bold'
                  : 'bg-brand-surface text-brand-text border-brand-border hover:bg-brand-subtle'
              }`}
            >
              {mName}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-status-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Accessible file picker showing permitted MIME types, size limit, client-side check,
 * and upload progress bar when submitting.
 */
const FILE_TYPE_OPTIONS = {
  'application/pdf': { label: 'PDF', extensions: ['pdf'], accept: ['.pdf', 'application/pdf'] },
  'image/jpeg': {
    label: 'JPG / JPEG',
    extensions: ['jpg', 'jpeg'],
    accept: ['.jpg', '.jpeg', 'image/jpeg'],
  },
  'image/png': { label: 'PNG', extensions: ['png'], accept: ['.png', 'image/png'] },
  'image/webp': { label: 'WebP', extensions: ['webp'], accept: ['.webp', 'image/webp'] },
} as const;

const DEFAULT_ALLOWED_FILE_MIMES = Object.keys(FILE_TYPE_OPTIONS);

export function FileUploadBox({
  label,
  hint,
  files,
  onChange,
  maxFiles = 5,
  maxUploadMb = 10,
  allowedMimeTypes = DEFAULT_ALLOWED_FILE_MIMES,
  uploadProgress = null,
}: {
  label: string;
  hint?: string;
  files: File[];
  onChange: (next: File[]) => void;
  maxFiles?: number;
  maxUploadMb?: number;
  allowedMimeTypes?: readonly string[];
  uploadProgress?: number | null;
}) {
  const inputId = useId();
  const [localError, setLocalError] = React.useState<string | null>(null);
  const supportedTypes = allowedMimeTypes
    .map((mime) => FILE_TYPE_OPTIONS[mime as keyof typeof FILE_TYPE_OPTIONS])
    .filter((type): type is (typeof FILE_TYPE_OPTIONS)[keyof typeof FILE_TYPE_OPTIONS] => Boolean(type));
  const allowedExtensions = new Set<string>(supportedTypes.flatMap((type) => [...type.extensions]));
  const acceptedTypes = [...new Set(supportedTypes.flatMap((type) => [...type.accept]))];
  const fileTypeLabel = supportedTypes.map((type) => type.label).join('، ');

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalError(null);
    const chosen = Array.from(e.target.files ?? []);
    if (chosen.length === 0) return;

    const combined = [...files, ...chosen];
    if (combined.length > maxFiles) {
      setLocalError(`حداکثر می‌توانید ${toPersianDigits(maxFiles)} فایل را در هر فرم پیوست کنید.`);
      e.target.value = '';
      return;
    }

    const maxBytes = maxUploadMb * 1024 * 1024;
    for (const f of chosen) {
      if (f.size > maxBytes) {
        setLocalError(
          `حجم فایل «${f.name}» بیش از حد مجاز (${toPersianDigits(maxUploadMb)} مگابایت) است.`,
        );
        e.target.value = '';
        return;
      }
      const ext = f.name.toLowerCase();
      const extension = ext.includes('.') ? ext.split('.').pop() ?? '' : '';
      if (!allowedExtensions.has(extension)) {
        setLocalError(
          fileTypeLabel
            ? `فرمت فایل «${f.name}» مجاز نیست. فرمت‌های قابل پذیرش: ${fileTypeLabel}.`
            : 'در حال حاضر نوع فایل مجازی برای بارگذاری پیکربندی نشده است.',
        );
        e.target.value = '';
        return;
      }
    }

    onChange(combined);
    e.target.value = '';
  };

  const removeIndex = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-semibold text-brand-text">
        {label}
      </label>
      <div className="p-4 rounded-card border border-dashed border-brand-border bg-brand-subtle/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-brand-muted space-y-0.5">
            <p className="font-medium text-brand-text">
              {hint ?? 'افزودن فایل پیوست مرتبط (اختیاری)'}
            </p>
            <p>
              {fileTypeLabel
                ? `فرمت‌های مجاز: ${fileTypeLabel}`
                : 'فرمت مجاز بارگذاری هنوز پیکربندی نشده است'}{' '}
              — حداکثر حجم هر فایل: {toPersianDigits(maxUploadMb)} مگابایت
            </p>
          </div>
          <label
            htmlFor={inputId}
            className="inline-flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 rounded-control text-xs font-semibold bg-brand-surface border border-brand-border text-brand-navy hover:bg-brand-subtle cursor-pointer shrink-0"
          >
            <Paperclip className="w-4 h-4" aria-hidden="true" />
            <span>انتخاب فایل</span>
          </label>
          <input
            id={inputId}
            type="file"
            multiple
            accept={acceptedTypes.join(',')}
            disabled={supportedTypes.length === 0}
            onChange={handleSelect}
            className="sr-only"
          />
        </div>

        {localError && (
          <p role="alert" className="text-xs font-medium text-status-danger mt-2">
            {localError}
          </p>
        )}

        {files.length > 0 && (
          <ul className="mt-3 space-y-2 border-t border-brand-border pt-3">
            {files.map((f, idx) => (
              <li
                key={`${f.name}-${idx}`}
                className="flex items-center justify-between gap-2 text-xs bg-brand-surface px-3 py-2 rounded-control border border-brand-border"
              >
                <span className="inline-flex items-center gap-2 truncate font-medium">
                  <FileText className="w-4 h-4 text-brand-blue shrink-0" aria-hidden="true" />
                  <span className="truncate">{f.name}</span>
                  <span className="text-brand-muted shrink-0">
                    ({toPersianDigits(Math.max(1, Math.round(f.size / 1024)))} کیلوبایت)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeIndex(idx)}
                  aria-label={`حذف فایل ${f.name}`}
                  className="p-1.5 text-status-danger hover:bg-status-danger-bg rounded"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {uploadProgress !== null && uploadProgress !== undefined && (
          <div className="mt-3 space-y-1" role="status" aria-live="polite">
            <div className="flex justify-between text-xs font-medium text-brand-navy">
              <span>در حال بارگذاری امن فایل‌ها...</span>
              <span>{toPersianDigits(uploadProgress)}٪</span>
            </div>
            <div className="w-full h-2 bg-brand-border rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-blue transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Accessible modal confirmation dialog with Escape handling and focus restoration.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'تأیید و ادامه',
  cancelLabel = 'انصراف',
  danger = false,
  loading = false,
  children,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      prevFocus?.focus?.();
    };
  }, [open, loading, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy-dark/50 backdrop-blur-[1px]"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-brand-surface border border-brand-border rounded-card shadow-elevated p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-brand-navy">
            {title}
          </h2>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            aria-label="بستن پنجره"
            className="p-1.5 rounded text-brand-muted hover:bg-brand-subtle"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {description && <p className="text-sm text-brand-muted leading-relaxed">{description}</p>}
        {children && <div>{children}</div>}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-brand-border">
          <SecondaryButton onClick={onClose} disabled={loading}>
            {cancelLabel}
          </SecondaryButton>
          {danger ? (
            <DangerButton onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </DangerButton>
          ) : (
            <PrimaryButton onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}
