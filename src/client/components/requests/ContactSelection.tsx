import React, { useEffect, useState } from 'react';
import { CreditCard, Smartphone } from 'lucide-react';
import { IRANIAN_BANKS, identifyBank } from '@shared/banks';
import { normalizeDigits } from '@shared/jalali';
import { cardSelectionSchema, mobileSelectionSchema } from '@shared/validation';
import { apiRequest } from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { Card } from '../ui/Primitives';
import { INPUT_CLASS } from '../ui/FormControls';

type SavedCard = { id: string; holderName: string; lastFour: string; bankId: string | null };
type SavedMobile = { id: string; mobile: string; ownerName: string; verified: boolean };
type ContactState = ReturnType<typeof useRequestContacts>;

export function useRequestContacts() {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [mobiles, setMobiles] = useState<SavedMobile[]>([]);
  const [cardMode, setCardMode] = useState<'existing' | 'new'>('new');
  const [mobileMode, setMobileMode] = useState<'existing' | 'new'>('new');
  const [cardId, setCardId] = useState('');
  const [mobileId, setMobileId] = useState('');
  const [number, setNumber] = useState('');
  const [cvv2, setCvv2] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [holderName, setHolderName] = useState('');
  const [mobile, setMobile] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    apiRequest<{ cards: SavedCard[]; mobiles: SavedMobile[] }>('/api/portal/saved-contacts')
      .then((result) => {
        if (!mounted) return;
        setCards(result.cards);
        setMobiles(result.mobiles);
        if (result.cards[0]) {
          setCardMode('existing');
          setCardId(result.cards[0].id);
        }
        if (result.mobiles[0]) {
          setMobileMode('existing');
          setMobileId(result.mobiles[0].id);
        }
      })
      .catch(() => {
        if (mounted)
          setLoadError('دریافت اطلاعات ذخیره‌شده ممکن نشد. صفحه را مجدداً بارگذاری کنید.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const cardSelection =
    cardMode === 'existing'
      ? { mode: 'existing' as const, id: cardId }
      : { mode: 'new' as const, card: { number, cvv2, expiryMonth, expiryYear, holderName } };
  const mobileSelection =
    mobileMode === 'existing'
      ? { mode: 'existing' as const, id: mobileId }
      : { mode: 'new' as const, mobile, ownerName };
  const validate = () => {
    if (loading) return 'لطفاً تا دریافت فهرست کارت‌ها و شماره‌ها صبر کنید.';
    if (loadError) return loadError;
    const c = cardSelectionSchema.safeParse(cardSelection);
    if (!c.success) return c.error.issues[0]?.message ?? 'اطلاعات کارت را بررسی کنید.';
    const m = mobileSelectionSchema.safeParse(mobileSelection);
    if (!m.success) return m.error.issues[0]?.message ?? 'اطلاعات شماره موبایل را بررسی کنید.';
    return null;
  };
  return {
    cards,
    mobiles,
    cardMode,
    setCardMode,
    mobileMode,
    setMobileMode,
    cardId,
    setCardId,
    mobileId,
    setMobileId,
    number,
    setNumber,
    cvv2,
    setCvv2,
    expiryMonth,
    setExpiryMonth,
    expiryYear,
    setExpiryYear,
    holderName,
    setHolderName,
    mobile,
    setMobile,
    ownerName,
    setOwnerName,
    loadError,
    cardSelection,
    mobileSelection,
    validate,
    clearSensitive: () => {
      setNumber('');
      setCvv2('');
      setExpiryMonth('');
      setExpiryYear('');
    },
  };
}

const labelClass = 'block text-sm font-medium text-brand-text space-y-1';
const modeClass = (active: boolean) =>
  `p-3 rounded-control border text-right text-sm font-semibold ${active ? 'bg-brand-subtle border-brand-navy text-brand-navy' : 'bg-white border-brand-border text-brand-muted'}`;
const digits = (v: string) => normalizeDigits(v).replace(/[^0-9]/g, '');

export function ContactSelection({ state }: { state: ContactState }) {
  const c = state;
  const { publicConfig } = useApp();
  const bank = identifyBank(digits(c.number));
  return (
    <>
      <Card className="p-6 space-y-5">
        <h2 className="font-bold text-brand-navy flex items-center gap-2">
          <CreditCard aria-hidden="true" /> انتخاب یا افزودن کارت بانکی
        </h2>
        {publicConfig.isDemo && (
          <p
            role="alert"
            className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-control p-3"
          >
            محیط آزمایشی است؛ اطلاعات واقعی کارت، CVV2 یا شماره واقعی را وارد نکنید.
          </p>
        )}
        {c.loadError && (
          <p role="alert" className="text-red-700">
            {c.loadError}
          </p>
        )}
        {c.cards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={c.cardMode === 'existing'}
              className={modeClass(c.cardMode === 'existing')}
              onClick={() => c.setCardMode('existing')}
            >
              انتخاب کارت ذخیره‌شده
            </button>
            <button
              type="button"
              aria-pressed={c.cardMode === 'new'}
              className={modeClass(c.cardMode === 'new')}
              onClick={() => c.setCardMode('new')}
            >
              + افزودن کارت جدید
            </button>
          </div>
        )}
        {c.cardMode === 'existing' ? (
          <label className={labelClass}>
            کارت مورد نظر
            <select
              className={INPUT_CLASS}
              value={c.cardId}
              onChange={(e) => c.setCardId(e.target.value)}
            >
              {c.cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {IRANIAN_BANKS.find((b) => b.id === card.bankId)?.name_fa ?? 'بانک ناشناخته'} —{' '}
                  {card.holderName} — {card.lastFour}
                </option>
              ))}
            </select>
            {(() => {
              const saved = c.cards.find((x) => x.id === c.cardId);
              const selectedBank = IRANIAN_BANKS.find((b) => b.id === saved?.bankId);
              return selectedBank ? (
                <span className="flex items-center gap-2 pt-2">
                  <img
                    src={`/bank-logos/${selectedBank.id}.svg`}
                    alt={`لوگوی ${selectedBank.name_fa}`}
                    className="w-8 h-8 object-contain"
                  />
                  {selectedBank.name_fa}
                </span>
              ) : null;
            })()}
          </label>
        ) : (
          <>
            <div
              className="rounded-xl p-5 text-white min-h-[175px] flex flex-col justify-between max-w-md shadow-sm"
              style={{ background: bank?.color ?? '#123B5D' }}
            >
              <div className="flex justify-between items-center gap-3">
                <span>{bank?.name_fa ?? 'بانک کارت'}</span>
                {bank && (
                  <img
                    alt={`لوگوی ${bank.name_fa}`}
                    className="w-10 h-10 object-contain bg-white rounded-full p-1"
                    src={`/bank-logos/${bank.id}.svg`}
                  />
                )}
              </div>
              <div dir="ltr" className="text-lg tracking-widest font-mono break-all">
                {(digits(c.number) || '••••••••••••••••').replace(/(.{4})/g, '$1 ').trim()}
              </div>
              <div dir="ltr" className="text-xs">
                CVV2: {c.cvv2 || '•••'}
              </div>
              <div className="flex justify-between text-sm">
                <span>{c.holderName || 'نام دارنده کارت'}</span>
                <span dir="ltr">
                  {c.expiryMonth || 'MM'} / {c.expiryYear || 'YY'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={labelClass}>
                شماره ۱۶ رقمی کارت
                <input
                  autoComplete="cc-number"
                  inputMode="numeric"
                  dir="ltr"
                  className={INPUT_CLASS}
                  value={c.number}
                  onChange={(e) => c.setNumber(digits(e.target.value).slice(0, 16))}
                />
              </label>
              <label className={labelClass}>
                نام دارنده کارت
                <input
                  autoComplete="cc-name"
                  className={INPUT_CLASS}
                  value={c.holderName}
                  onChange={(e) => c.setHolderName(e.target.value)}
                />
              </label>
              <label className={labelClass}>
                CVV2
                <input
                  autoComplete="off"
                  inputMode="numeric"
                  dir="ltr"
                  className={INPUT_CLASS}
                  value={c.cvv2}
                  onChange={(e) => c.setCvv2(digits(e.target.value).slice(0, 4))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  ماه انقضا
                  <input
                    autoComplete="cc-exp-month"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="01"
                    className={INPUT_CLASS}
                    value={c.expiryMonth}
                    onChange={(e) => c.setExpiryMonth(digits(e.target.value).slice(0, 2))}
                  />
                </label>
                <label className={labelClass}>
                  سال انقضا
                  <input
                    autoComplete="cc-exp-year"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="1406"
                    className={INPUT_CLASS}
                    value={c.expiryYear}
                    onChange={(e) => c.setExpiryYear(digits(e.target.value).slice(0, 4))}
                  />
                </label>
              </div>
            </div>
            <p className="text-xs text-brand-muted">
              اطلاعات کامل کارت در اختیار دفتر قرار می‌گیرد. رمز پویا را در سامانه وارد نکنید.
            </p>
          </>
        )}
      </Card>
      <Card className="p-6 space-y-5">
        <h2 className="font-bold text-brand-navy flex items-center gap-2">
          <Smartphone aria-hidden="true" /> انتخاب یا افزودن شماره موبایل
        </h2>
        {c.mobiles.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={c.mobileMode === 'existing'}
              className={modeClass(c.mobileMode === 'existing')}
              onClick={() => c.setMobileMode('existing')}
            >
              انتخاب شماره ذخیره‌شده
            </button>
            <button
              type="button"
              aria-pressed={c.mobileMode === 'new'}
              className={modeClass(c.mobileMode === 'new')}
              onClick={() => c.setMobileMode('new')}
            >
              + افزودن شماره جدید
            </button>
          </div>
        )}
        {c.mobileMode === 'existing' ? (
          <label className={labelClass}>
            شماره مورد نظر
            <select
              className={INPUT_CLASS}
              value={c.mobileId}
              onChange={(e) => c.setMobileId(e.target.value)}
            >
              {c.mobiles.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.ownerName} — {m.mobile} — {m.verified ? 'تأییدشده' : 'تأییدنشده'}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className={labelClass}>
              شماره موبایل ایران
              <input
                autoComplete="tel"
                inputMode="tel"
                dir="ltr"
                className={INPUT_CLASS}
                value={c.mobile}
                onChange={(e) => c.setMobile(digits(e.target.value).slice(0, 11))}
              />
            </label>
            <label className={labelClass}>
              نام صاحب شماره
              <input
                className={INPUT_CLASS}
                value={c.ownerName}
                onChange={(e) => c.setOwnerName(e.target.value)}
              />
            </label>
            <p className="sm:col-span-2 text-sm text-brand-muted">
              {c.ownerName || 'نام صاحب شماره'} — <span dir="ltr">{c.mobile || '۰۹xxxxxxxxx'}</span>{' '}
              — تأییدنشده
            </p>
          </div>
        )}
        <p className="text-xs text-brand-muted">
          اعتبار ساختار شماره به معنای تأیید مالکیت آن نیست.
        </p>
      </Card>
    </>
  );
}

export function ContactsReview({ state: c }: { state: ContactState }) {
  const card = c.cardMode === 'existing' ? c.cards.find((x) => x.id === c.cardId) : null;
  const mobile = c.mobileMode === 'existing' ? c.mobiles.find((x) => x.id === c.mobileId) : null;
  return (
    <div className="text-sm space-y-2 bg-brand-subtle/50 p-4 rounded-control border border-brand-border">
      <p>
        کارت:{' '}
        {card ? `${card.holderName} — ${card.lastFour}` : `${c.holderName} — ${c.number.slice(-4)}`}
      </p>
      <p>
        موبایل: {mobile ? `${mobile.ownerName} — ${mobile.mobile}` : `${c.ownerName} — ${c.mobile}`}
      </p>
      <p className="text-xs text-brand-muted">
        اطلاعات کامل کارت و شماره انتخاب‌شده برای دفتر ارسال می‌شود.
      </p>
    </div>
  );
}
