import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { FormField, INPUT_CLASS } from '../ui/FormControls';

export function PortalPasswordField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <FormField
      label="رمز عبور سامانه تأمین اجتماعی"
      required
      error={error}
      hint="این رمز برای انجام دستی درخواست در اختیار دفتر قرار می‌گیرد."
    >
      {(props) => (
        <div className="flex gap-2">
          <input
            {...props}
            type={show ? 'text' : 'password'}
            dir="ltr"
            autoComplete="new-password"
            maxLength={200}
            className={`${INPUT_CLASS} text-left`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'}
            aria-pressed={show}
            onClick={() => setShow(!show)}
            className="px-3 border rounded-control border-brand-border text-brand-navy"
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      )}
    </FormField>
  );
}
