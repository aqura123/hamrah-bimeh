import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, KeyRound, Search, UserPlus, Users } from 'lucide-react';
import { formatMobileDisplay } from '@shared/iran-identifiers';
import { formatJalaliDate, toPersianDigits } from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { ApiError, apiRequest } from '../../lib/api';
import { ConfirmDialog, FormField, INPUT_CLASS } from '../../components/ui/FormControls';
import {
  Alert,
  Breadcrumb,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';

interface CustomerListItem {
  id: string;
  userId: string;
  fullName: string;
  mobile: string;
  maskedNationalId: string;
  phone: string | null;
  isActive: boolean;
  forcePasswordChange: boolean;
  lastLoginAt: string | null;
  driversCount: number;
  workshopsCount: number;
  requestsCount: number;
  createdAt: string;
}

export function AdminCustomersPage() {
  const { publicConfig } = useApp();

  const [q, setQ] = useState('');
  const [items, setItems] = useState<CustomerListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Customer Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [officeNotes, setOfficeNotes] = useState('');
  const [passwordMode, setPasswordMode] = useState<'national_id' | 'generated'>(
    publicConfig.initialPasswordMode,
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // One-time onboarding summary modal
  const [onboardingResult, setOnboardingResult] = useState<{
    customerId: string;
    fullName: string;
    mobile: string;
    mode: 'national_id' | 'generated';
    oneTimePassword: string | null;
  } | null>(null);

  const loadCustomers = useCallback(async (searchQuery = '') => {
    setLoading(true);
    setError(null);
    try {
      const qs = searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : '';
      const res = await apiRequest<{
        totalCount: number;
        defaultInitialPasswordMode: 'national_id' | 'generated';
        items: CustomerListItem[];
      }>(`/api/admin/customers${qs}`);
      setItems(res.items);
      setTotalCount(res.totalCount);
      setPasswordMode(res.defaultInitialPasswordMode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت فهرست مشتریان.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void loadCustomers(q);
  };

  const handleCreateCustomer = async () => {
    setCreateError(null);
    setFieldErrors({});
    setCreating(true);
    try {
      const res = await apiRequest<{
        customer: { id: string; fullName: string; mobile: string };
        onboarding: {
          mode: 'national_id' | 'generated';
          oneTimeTemporaryPassword: string | null;
        };
      }>('/api/admin/customers', {
        method: 'POST',
        body: {
          fullName,
          mobile,
          nationalId,
          phone,
          officeNotes,
          isActive: true,
          initialPasswordMode: passwordMode,
        },
      });

      setCreateOpen(false);
      setFullName('');
      setMobile('');
      setNationalId('');
      setPhone('');
      setOfficeNotes('');

      setOnboardingResult({
        customerId: res.customer.id,
        fullName: res.customer.fullName,
        mobile: res.customer.mobile,
        mode: res.onboarding.mode,
        oneTimePassword: res.onboarding.oneTimeTemporaryPassword,
      });

      await loadCustomers(q);
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(err.message);
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
      } else {
        setCreateError('خطا در ایجاد حساب مشتری.');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[{ label: 'همه درخواست‌ها', to: '/admin' }, { label: 'مدیریت مشتریان' }]}
      />

      <PageTitle
        title={`مدیریت مشتریان (${toPersianDigits(totalCount)})`}
        subtitle="ایجاد حساب کاربری جدید برای مشتریان، مشاهده پرونده‌ها و مدیریت دسترسی"
        documentTitle="مدیریت مشتریان"
        actions={
          <PrimaryButton
            onClick={() => {
              setCreateError(null);
              setFieldErrors({});
              setCreateOpen(true);
            }}
            icon={<UserPlus className="w-4 h-4" aria-hidden="true" />}
          >
            ایجاد حساب مشتری جدید
          </PrimaryButton>
        }
      />

      <Card className="p-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجو بر اساس نام مشتری، شماره همراه یا کد ملی..."
              aria-label="جستجوی مشتری"
              className={`${INPUT_CLASS} pl-9`}
            />
            <Search
              className="w-4 h-4 text-brand-muted absolute left-3 top-3.5 pointer-events-none"
              aria-hidden="true"
            />
          </div>
          <div className="flex gap-2">
            <PrimaryButton type="submit">جستجو</PrimaryButton>
            {q && (
              <SecondaryButton
                type="button"
                onClick={() => {
                  setQ('');
                  void loadCustomers('');
                }}
              >
                پاک‌سازی
              </SecondaryButton>
            )}
          </div>
        </form>
      </Card>

      {loading ? (
        <LoadingState label="در حال بارگذاری مشتریان..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadCustomers(q)} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" aria-hidden="true" />}
          title="مشتری با این مشخصات یافت نشد"
          description="می‌توانید از دکمه «ایجاد حساب مشتری جدید» در بالای صفحه استفاده کنید."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-brand-subtle text-brand-navy border-b border-brand-border text-xs font-bold">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    نام کامل مشتری
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    شماره همراه (نام کاربری)
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    کد ملی
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    پرونده‌ها و درخواست‌ها
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    وضعیت حساب
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-brand-subtle/40">
                    <td className="px-4 py-3.5 font-bold text-brand-navy">{c.fullName}</td>
                    <td className="px-4 py-3.5 ltr-code font-medium">
                      {formatMobileDisplay(c.mobile)}
                    </td>
                    <td className="px-4 py-3.5 ltr-code text-xs text-brand-muted">
                      {c.maskedNationalId}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-brand-text">
                      راننده: {toPersianDigits(c.driversCount)} · کارگاه:{' '}
                      {toPersianDigits(c.workshopsCount)} · درخواست:{' '}
                      {toPersianDigits(c.requestsCount)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${
                            c.isActive
                              ? 'bg-status-success-bg text-status-success'
                              : 'bg-status-danger-bg text-status-danger'
                          }`}
                        >
                          {c.isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                        {c.forcePasswordChange && (
                          <span className="px-2 py-0.5 rounded bg-status-warning-bg text-status-warning font-medium">
                            منتظر تغییر رمز اولیه
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        to={`/admin/customers/${c.id}`}
                        className="inline-flex items-center gap-1 min-h-[34px] px-3 py-1 rounded-control text-xs font-bold bg-brand-navy text-white hover:bg-brand-navy-dark"
                      >
                        <span>مشاهده و مدیریت</span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-brand-border">
            {items.map((c) => (
              <Link
                key={c.id}
                to={`/admin/customers/${c.id}`}
                className="block p-4 space-y-2 hover:bg-brand-subtle/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-brand-navy">{c.fullName}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-semibold ${
                      c.isActive
                        ? 'bg-status-success-bg text-status-success'
                        : 'bg-status-danger-bg text-status-danger'
                    }`}
                  >
                    {c.isActive ? 'فعال' : 'غیرفعال'}
                  </span>
                </div>
                <p className="text-xs text-brand-muted ltr-code text-right">
                  همراه: {formatMobileDisplay(c.mobile)} · کد ملی: {c.maskedNationalId}
                </p>
                <p className="text-xs text-brand-muted">
                  ایجاد: {formatJalaliDate(c.createdAt, publicConfig.businessTimezone)} ·
                  درخواست‌ها: {toPersianDigits(c.requestsCount)}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Create Customer Modal */}
      <ConfirmDialog
        open={createOpen}
        title="افتتاح حساب کاربری مشتری جدید"
        description="ثبت‌نام عمومی در سایت غیرفعال است. نام کاربری مشتری شماره تلفن همراه او خواهد بود و در اولین ورود ملزم به تغییر رمز عبور است."
        confirmLabel="ایجاد حساب مشتری"
        loading={creating}
        onConfirm={handleCreateCustomer}
        onClose={() => setCreateOpen(false)}
      >
        <div className="space-y-3 max-h-[65vh] overflow-y-auto px-0.5">
          {createError && <Alert variant="error">{createError}</Alert>}

          <FormField label="نام و نام خانوادگی مشتری" required error={fieldErrors.fullName}>
            {(props) => (
              <input
                {...props}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={INPUT_CLASS}
              />
            )}
          </FormField>

          <FormField label="شماره تلفن همراه (نام کاربری یکتا)" required error={fieldErrors.mobile}>
            {(props) => (
              <input
                {...props}
                type="tel"
                dir="ltr"
                placeholder="09123456789"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className={`${INPUT_CLASS} text-left`}
              />
            )}
          </FormField>

          <FormField
            label="روش تنظیم رمز عبور اولیه"
            required
            hint="در هر دو روش، مشتری در اولین ورود ملزم به انتخاب رمز شخصی جدید خواهد بود."
          >
            {(props) => (
              <select
                {...props}
                value={passwordMode}
                onChange={(e) => setPasswordMode(e.target.value as 'national_id' | 'generated')}
                className={INPUT_CLASS}
              >
                <option value="national_id">
                  کد ملی مشتری به‌عنوان رمز اولیه (با الزام تغییر فوری در اولین ورود)
                </option>
                <option value="generated">
                  صدور رمز موقت تصادفی یک‌بارمصرف ۱۲ کاراکتری (توصیه امنیتی بالاتر)
                </option>
              </select>
            )}
          </FormField>

          <FormField
            label="کد ملی ۱۰ رقمی مشتری"
            required={passwordMode === 'national_id'}
            error={fieldErrors.nationalId}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="numeric"
                dir="ltr"
                maxLength={10}
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="0012345678"
                className={`${INPUT_CLASS} text-left`}
              />
            )}
          </FormField>

          <FormField label="تلفن ثابت / تماس تکمیلی (اختیاری)">
            {(props) => (
              <input
                {...props}
                type="text"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${INPUT_CLASS} text-left`}
              />
            )}
          </FormField>

          <FormField label="یادداشت داخلی دفتر (فقط قابل مشاهده توسط دفتر)">
            {(props) => (
              <textarea
                {...props}
                rows={2}
                value={officeNotes}
                onChange={(e) => setOfficeNotes(e.target.value)}
                className={`${INPUT_CLASS} py-2`}
              />
            )}
          </FormField>
        </div>
      </ConfirmDialog>

      {/* Post-Creation Onboarding Notice Modal */}
      <ConfirmDialog
        open={onboardingResult !== null}
        title="حساب مشتری با موفقیت ایجاد شد"
        confirmLabel="متوجه شدم"
        cancelLabel="بستن"
        onConfirm={() => setOnboardingResult(null)}
        onClose={() => setOnboardingResult(null)}
      >
        {onboardingResult && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-status-success font-bold">
              <CheckCircle2 className="w-5 h-5" />
              <span>حساب کاربری «{onboardingResult.fullName}» فعال گردید.</span>
            </div>
            <p className="text-xs text-brand-text">
              نام کاربری (شماره همراه):{' '}
              <strong className="ltr-code">{onboardingResult.mobile}</strong>
            </p>
            {onboardingResult.mode === 'generated' && onboardingResult.oneTimePassword ? (
              <div className="p-4 rounded-control bg-status-warning-bg border border-status-warning/40 space-y-1.5">
                <p className="text-xs font-bold text-status-warning flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4" />
                  <span>رمز عبور موقت یک‌بارمصرف (فقط همین یک‌بار نمایش داده می‌شود):</span>
                </p>
                <p className="text-lg font-extrabold ltr-code text-brand-navy select-all">
                  {onboardingResult.oneTimePassword}
                </p>
                <p className="text-[11px] text-brand-muted">
                  این رمز به‌صورت هش‌شده ذخیره شده و قابل بازیابی مجدد نیست.
                </p>
              </div>
            ) : (
              <Alert variant="info">
                رمز عبور اولیه بر اساس کد ملی ثبت‌شده مشتری تنظیم و هش گردید (متن رمز نمایش داده
                نمی‌شود). مشتری در اولین ورود ملزم به تغییر رمز عبور خواهد بود.
              </Alert>
            )}
            <Link
              to={`/admin/customers/${onboardingResult.customerId}`}
              className="inline-block text-xs font-bold text-brand-blue hover:underline"
            >
              باز کردن پرونده مشتری
            </Link>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
