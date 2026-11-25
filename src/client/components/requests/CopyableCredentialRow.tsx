import React, { useRef, useState } from 'react';
import { SecondaryButton } from '../ui/Primitives';

/** Copy synchronously in the click gesture, without requesting Clipboard API permission. */
export function CopyableCredentialRow({ label, value, hideLabel = false, copyButtonText }: { label: string; value?: string; hideLabel?: boolean; copyButtonText?: string }) {
  const valueRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');

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
    let copied = false;
    try {
      temporary.focus({ preventScroll: true });
      temporary.select();
      temporary.setSelectionRange(0, temporary.value.length);
      copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    } catch {
      copied = false;
    } finally {
      temporary.value = '';
      temporary.remove();
      if (previouslyFocused instanceof HTMLElement)
        previouslyFocused.focus({ preventScroll: true });
    }
    if (copied) {
      setMessage(`${label} کپی شد.`);
      return;
    }
    // A browser or its embedding page may block all programmatic copy. Select for manual copying.
    const element = valueRef.current;
    const selection = window.getSelection();
    if (element && selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    setMessage(`کپی خودکار ممکن نبود؛ مقدار انتخاب شد. از کپی مرورگر یا Ctrl+C استفاده کنید.`);
  };

  return (
    <div className="border rounded-control p-3 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {!hideLabel && <div className="text-xs text-brand-muted">{label}</div>}
          <div
            ref={valueRef}
            dir="ltr"
            className="font-bold break-all whitespace-pre-wrap select-text"
          >
            {value ?? 'ثبت نشده'}
          </div>
        </div>
        <SecondaryButton type="button" disabled={!value} onClick={copy}>
          {copyButtonText ?? `کپی ${label}`}
        </SecondaryButton>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
