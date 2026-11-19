import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  formatMoney,
  REQUEST_TYPE_LABELS,
  type CurrencyUnit,
  type RequestType,
} from '@shared/domain';
import { formatJalaliPeriod } from '@shared/jalali';
import { apiRequest, ApiError } from '../../lib/api';
import { CopyableCredentialRow } from '../requests/CopyableCredentialRow';
import { Alert, PrimaryButton, SecondaryButton } from '../ui/Primitives';

interface PaymentItem {
  id: string;
  referenceCode: string;
  requestType: RequestType;
  jalaliYear: number;
  jalaliMonth: number;
  finalAmount: number | null;
  currencyUnit: CurrencyUnit;
  paymentCardNumber: string | null;
  driverName: string | null;
  workshopName: string | null;
}
interface Total {
  currencyUnit: CurrencyUnit;
  amount: string;
}
interface Receipt {
  groups: Array<{ cardNumber: string; items: PaymentItem[]; totals: Total[] }>;
  totals: Total[];
}

export function PaymentDialog({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSelected([]);
    setReceipt(null);
    try {
      const res = await apiRequest<{ items: PaymentItem[] }>('/api/portal/pending-payments');
      setItems(res.items);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'خطا در دریافت درخواست‌های در انتظار پرداخت.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    void load();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0]!,
        last = focusable[focusable.length - 1]!;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [load]);

  const showReceipt = async () => {
    if (!selected.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<Receipt>('/api/portal/payment-preview', {
        method: 'POST',
        body: { requestIds: selected },
      });
      setReceipt(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در آماده‌سازی رسید.');
    } finally {
      setBusy(false);
    }
  };
  const label = (item: PaymentItem) =>
    `${REQUEST_TYPE_LABELS[item.requestType]} — ${item.driverName ?? item.workshopName ?? 'پرونده'} — ${formatJalaliPeriod(item.jalaliYear, item.jalaliMonth)}`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-brand-navy-dark/60"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-brand-surface border border-brand-border rounded-card shadow-elevated p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="payment-dialog-title" className="text-lg font-bold text-brand-navy">
            {receipt ? 'رسید راهنمای واریز' : 'انتخاب درخواست‌های در انتظار پرداخت'}
          </h2>
          <button
            type="button"
            aria-label="بستن پنجره"
            className="p-2 rounded hover:bg-brand-subtle"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {error && (
          <Alert variant="error">
            {error}{' '}
            <button type="button" onClick={() => void load()} className="underline font-bold">
              بارگذاری دوباره
            </button>
          </Alert>
        )}
        {!receipt ? (
          <>
            <p className="text-sm text-brand-muted">
              درخواست‌هایی را که می‌خواهید برای واریز در رسید باشند انتخاب کنید.
            </p>
            {busy && <p role="status">در حال دریافت اطلاعات…</p>}
            {!busy && !error && items.length === 0 && (
              <p>در حال حاضر درخواستی در انتظار پرداخت ندارید.</p>
            )}
            <div className="space-y-2">
              {items.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-3 p-3 border border-brand-border rounded-control cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={busy || item.finalAmount === null || !item.paymentCardNumber}
                    checked={selected.includes(item.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span className="flex-1 text-sm space-y-1">
                    <span className="block font-bold">{label(item)}</span>
                    <span className="block">
                      کد درخواست: <b dir="ltr">{item.referenceCode}</b>
                    </span>
                    <span className="block">
                      {item.finalAmount === null
                        ? 'مبلغ ثبت نشده'
                        : formatMoney(item.finalAmount, item.currencyUnit)}
                      {!item.paymentCardNumber && ' — کارت واریز ثبت نشده'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t pt-3">
              <SecondaryButton onClick={onClose}>انصراف</SecondaryButton>
              <PrimaryButton
                onClick={() => void showReceipt()}
                loading={busy}
                disabled={!selected.length}
              >
                پرداخت
              </PrimaryButton>
            </div>
          </>
        ) : (
          <>
            <Alert variant="warning">
              این صفحه فقط راهنمای واریز است؛ پرداخت آنلاین یا تأیید واریز انجام نمی‌شود. پیش از
              واریز، مبلغ و شماره کارت را با دفتر بررسی کنید.
            </Alert>
            {receipt.groups.map((group, index) => (
              <section
                key={group.cardNumber}
                className="border border-brand-border rounded-control p-4 space-y-3 bg-brand-subtle/30"
              >
                <h3 className="font-bold">گروه واریز {index + 1}</h3>
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap justify-between gap-2 text-sm border-b border-brand-border pb-2"
                  >
                    <span>
                      {label(item)} <span dir="ltr">({item.referenceCode})</span>
                    </span>
                    <strong>{formatMoney(item.finalAmount, item.currencyUnit)}</strong>
                  </div>
                ))}
                {group.totals.map((total) => (
                  <div key={total.currencyUnit} className="flex justify-between font-bold text-sm">
                    <span>جمع این گروه</span>
                    <span>{formatMoney(total.amount, total.currencyUnit)}</span>
                  </div>
                ))}
              </section>
            ))}
            <div className="border-t-2 border-brand-navy pt-3 space-y-2">
              {receipt.totals.map((total) => (
                <div key={total.currencyUnit} className="flex justify-between font-bold">
                  <span>مجموع کل</span>
                  <span>{formatMoney(total.amount, total.currencyUnit)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <h3 className="font-bold">شماره کارت جهت واریز</h3>
              {receipt.groups.map((group, index) => (
                <div key={group.cardNumber}>
                  <p className="text-sm text-brand-muted">
                    گروه واریز {index + 1} —{' '}
                    {group.totals.map((t) => formatMoney(t.amount, t.currencyUnit)).join('، ')}
                  </p>
                  <CopyableCredentialRow
                    label={`شماره کارت گروه ${index + 1}`}
                    value={group.cardNumber}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t pt-3">
              <SecondaryButton onClick={() => setReceipt(null)}>بازگشت به انتخاب</SecondaryButton>
              <PrimaryButton onClick={onClose}>تأیید</PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
