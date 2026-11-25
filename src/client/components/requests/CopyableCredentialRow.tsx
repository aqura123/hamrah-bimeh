
import React, { useRef, useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { SecondaryButton } from '../ui/Primitives';

export function CopyableCredentialRow({
  label,
  value,
  hideLabel = false,
  copyButtonText,
}: {
  label: string;
  value?: string;
  hideLabel?: boolean;
  copyButtonText?: string;
}) {
  const valueRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => {
      setCopied(false);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    if (!value) return;

    const previouslyFocused = document.activeElement;
    const temporary = document.createElement('textarea');

    temporary.value = value;
    temporary.readOnly = true;
    temporary.setAttribute('aria-hidden', 'true');
    temporary.style.position = 'fixed';
    temporary.style.left = '-9999px';
    temporary.style.top = '0';

    document.body.appendChild(temporary);

    let success = false;

    try {
      temporary.focus({ preventScroll: true });
      temporary.select();
      temporary.setSelectionRange(0, temporary.value.length);
      success =
        typeof document.execCommand === 'function' &&
        document.execCommand('copy');
    } catch {
      success = false;
    } finally {
      temporary.value = '';
      temporary.remove();

      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true });
      }
    }

    if (success) {
      setMessage('');
      setCopied(true);
      return;
    }

    setCopied(false);

    const element = valueRef.current;
    const selection = window.getSelection();

    if (element && selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    setMessage(
      'کپی خودکار ممکن نبود؛ مقدار انتخاب شد. از Ctrl+C استفاده کنید.'
    );
  };

  return (
    <div className="border rounded-control p-3 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {!hideLabel && (
            <div className="text-xs text-brand-muted">{label}</div>
          )}

          <div
            ref={valueRef}
            dir="ltr"
            className="font-bold break-all whitespace-pre-wrap select-text"
          >
            {value ?? 'ثبت نشده'}
          </div>
        </div>

        <SecondaryButton
          type="button"
          disabled={!value}
          onClick={copy}
          className={`min-w-[170px] justify-center ${
            copied
              ? 'bg-status-success-bg text-status-success border-brand-turquoise/60 hover:bg-status-success-bg'
              : ''
          }`}
        >
          {copied ? (
            <span className="flex items-center justify-center gap-2 w-full">
              <Check className="w-4 h-4" />
              کپی شد
            </span>
          ) : (
            copyButtonText ?? `کپی ${label}`
          )}
        </SecondaryButton>
      </div>

      {message && (
        <p role="status" className="text-sm text-status-warning">
          {message}
        </p>
      )}
    </div>
  );
}
