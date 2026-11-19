import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, Send, Truck } from 'lucide-react';
import { maskNationalId } from '@shared/iran-identifiers';
import { formatJalaliPeriod, toPersianDigits } from '@shared/jalali';
import { createDriverRequestSchema } from '@shared/validation';
import { useApp } from '../../context/AppContext';
import { PortalPasswordField } from '../../components/requests/PortalPasswordField';
import {
  ContactSelection,
  ContactsReview,
  useRequestContacts,
} from '../../components/requests/ContactSelection';
import { ApiError, apiRequest, apiUploadFormData } from '../../lib/api';
import {
  FileUploadBox,
  FormField,
  INPUT_CLASS,
  JalaliMonthPicker,
} from '../../components/ui/FormControls';
import {
  Alert,
  Breadcrumb,
  Card,
  LoadingState,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';

interface SavedDriverOption {
  id: string;
  fullName: string;
  maskedNationalId: string;
  hasPortalPassword: boolean;
}

export function NewDriverRequestPage() {
  const { publicConfig } = useApp();
  const contacts = useRequestContacts();
  const [searchParams] = useSearchParams();
  const preselectedDriverId = searchParams.get('driverId') ?? '';
  const initialModeParam = searchParams.get('mode');

  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [savedDrivers, setSavedDrivers] = useState<SavedDriverOption[]>([]);

  const [driverMode, setDriverMode] = useState<'existing' | 'new'>('existing');
  const [selectedDriverId, setSelectedDriverId] = useState(preselectedDriverId);
  const [newFullName, setNewFullName] = useState('');
  const [newNationalId, setNewNationalId] = useState('');
  const [portalPassword, setPortalPassword] = useState('');

  const [jalaliYear, setJalaliYear] = useState(publicConfig.currentJalaliPeriod.jalaliYear);
  const [jalaliMonth, setJalaliMonth] = useState(publicConfig.currentJalaliPeriod.jalaliMonth);
  const [explanation, setExplanation] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);

  const [step, setStep] = useState<'form' | 'review' | 'submitted'>('form');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [createdResult, setCreatedResult] = useState<{
    id: string;
    referenceCode: string;
    duplicateWarning: string | null;
  } | null>(null);

  useEffect(() => {
    setJalaliYear(publicConfig.currentJalaliPeriod.jalaliYear);
    setJalaliMonth(publicConfig.currentJalaliPeriod.jalaliMonth);
  }, [publicConfig.currentJalaliPeriod]);

  useEffect(() => {
    let active = true;
    apiRequest<{ drivers: SavedDriverOption[] }>('/api/portal/overview')
      .then((res) => {
        if (!active) return;
        setSavedDrivers(res.drivers);
        if (initialModeParam === 'new' || res.drivers.length === 0) {
          setDriverMode('new');
        } else {
          setDriverMode('existing');
          if (preselectedDriverId && res.drivers.some((d) => d.id === preselectedDriverId)) {
            setSelectedDriverId(preselectedDriverId);
          } else if (res.drivers[0]) {
            setSelectedDriverId(res.drivers[0].id);
          }
        }
      })
      .catch(() => {
        if (active) setDriverMode('new');
      })
      .finally(() => {
        if (active) setLoadingProfiles(false);
      });
    return () => {
      active = false;
    };
  }, [initialModeParam, preselectedDriverId]);

  const buildPayload = () => ({
    cardSelection: contacts.cardSelection,
    mobileSelection: contacts.mobileSelection,
    driverMode,
    driverId: driverMode === 'existing' ? selectedDriverId : undefined,
    initialPortalPassword:
      driverMode === 'existing' &&
      !savedDrivers.find((d) => d.id === selectedDriverId)?.hasPortalPassword
        ? portalPassword
        : undefined,
    newDriver:
      driverMode === 'new'
        ? { fullName: newFullName, nationalId: newNationalId, portalPassword }
        : undefined,
    jalaliYear,
    jalaliMonth,
    explanation,
  });

  const handleProceedToReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setDuplicateWarning(null);

    const contactError = contacts.validate();
    if (contactError) {
      setFormError(contactError);
      return;
    }

    const parsed = createDriverRequestSchema.safeParse(buildPayload());
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path.join('.');
        if (!errs[k]) errs[k] = issue.message;
      }
      setFieldErrors(errs);
      setFormError(parsed.error.issues[0]?.message ?? 'لطفاً خطاهای فرم را برطرف کنید.');
      return;
    }

    if (driverMode === 'existing' && selectedDriverId) {
      try {
        const dup = await apiRequest<{
          duplicateExists: boolean;
          existingRequests: Array<{ referenceCode: string }>;
        }>(
          `/api/portal/check-duplicate?requestType=driver&profileId=${encodeURIComponent(selectedDriverId)}&jalaliYear=${jalaliYear}&jalaliMonth=${jalaliMonth}`,
        );
        if (dup.duplicateExists) {
          setDuplicateWarning(
            `برای این راننده در دوره ${formatJalaliPeriod(jalaliYear, jalaliMonth)} قبلاً درخواست فعال (کد ${dup.existingRequests[0]?.referenceCode ?? ''}) ثبت شده است. در صورت اطمینان می‌توانید ادامه دهید.`,
          );
        }
      } catch {
        // Non-blocking check
      }
    }

    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinalSubmit = async () => {
    setFormError(null);
    setSubmitting(true);
    setUploadProgress(attachments.length > 0 ? 0 : null);

    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify(buildPayload()));
      for (const f of attachments) {
        fd.append('attachments', f);
      }

      const res = await apiUploadFormData<{
        request: { id: string; referenceCode: string };
        duplicateWarning: string | null;
      }>('/api/portal/requests/driver', fd, (pct) => {
        if (attachments.length > 0) setUploadProgress(pct);
      });

      contacts.clearSensitive();
      setPortalPassword('');
      setCreatedResult({
        id: res.request.id,
        referenceCode: res.request.referenceCode,
        duplicateWarning: res.duplicateWarning,
      });
      setStep('submitted');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.fieldErrors) {
          setFieldErrors(err.fieldErrors);
          setStep('form');
        }
      } else {
        setFormError('خطا در ارسال درخواست. اطلاعات فرم شما حفظ شده است؛ مجدداً تلاش کنید.');
      }
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  if (loadingProfiles) return <LoadingState label="در حال آماده‌سازی فرم ثبت درخواست راننده..." />;

  const chosenSavedDriver = savedDrivers.find((d) => d.id === selectedDriverId);

  if (step === 'submitted' && createdResult) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="p-8 text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-status-success-bg text-status-success flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-brand-navy">درخواست شما با موفقیت ثبت شد</h1>
          <p className="text-sm text-brand-muted leading-relaxed">
            درخواست حق بیمه راننده برای دوره{' '}
            <strong className="text-brand-text">
              {formatJalaliPeriod(jalaliYear, jalaliMonth)}
            </strong>{' '}
            در سامانه ثبت گردید و در نوبت بررسی دفتر قرار گرفت.
          </p>

          <div className="p-4 rounded-control bg-brand-subtle border border-brand-border inline-block">
            <span className="text-xs text-brand-muted block mb-1">کد پیگیری اختصاصی درخواست:</span>
            <span className="text-lg font-extrabold text-brand-navy ltr-code">
              {createdResult.referenceCode}
            </span>
          </div>

          {createdResult.duplicateWarning && (
            <Alert variant="warning">{createdResult.duplicateWarning}</Alert>
          )}

          <Alert variant="info">
            توجه: ثبت این درخواست به منزله پرداخت آنلاین یا تأیید نهایی سازمان بیمه نیست. پس از
            بررسی و اقدام دفتر، وضعیت و مبلغ نهایی در صفحه درخواست اطلاع‌رسانی می‌شود.
          </Alert>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to={`/portal/requests/${createdResult.id}`}
              className="inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
            >
              مشاهده صفحه درخواست
            </Link>
            <Link
              to="/portal"
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-control text-sm font-medium bg-brand-surface border border-brand-border text-brand-text hover:bg-brand-subtle"
            >
              بازگشت به پرتال من
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Breadcrumb
        items={[
          { label: 'پرتال من', to: '/portal' },
          { label: 'ثبت درخواست جدید', to: '/portal/requests/new' },
          { label: 'درخواست حق بیمه راننده' },
        ]}
      />

      <PageTitle
        title="ثبت درخواست ماهانه حق بیمه راننده"
        subtitle="انتخاب راننده، تعیین یک ماه بیمه‌ای شمسی و ارسال توضیحات یا پیوست‌های مرتبط"
      />

      {publicConfig.isDemo && (
        <Alert variant="warning">
          این پیش‌نمایش آزمایشی است؛ رمز واقعی سامانه تأمین اجتماعی را وارد نکنید.
        </Alert>
      )}
      {formError && <Alert variant="error">{formError}</Alert>}

      {step === 'form' ? (
        <form onSubmit={handleProceedToReview} noValidate className="space-y-6">
          <Card className="p-6 space-y-5">
            <h2 className="text-base font-bold text-brand-navy flex items-center gap-2">
              <Truck className="w-5 h-5 text-brand-blue" aria-hidden="true" />
              <span>۱. انتخاب یا معرفی راننده</span>
            </h2>

            {savedDrivers.length > 0 && (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="نحوه انتخاب راننده"
              >
                <button
                  type="button"
                  onClick={() => {
                    setPortalPassword('');
                    setDriverMode('existing');
                  }}
                  aria-pressed={driverMode === 'existing'}
                  className={`p-3.5 rounded-control border text-right text-sm font-semibold transition-colors ${
                    driverMode === 'existing'
                      ? 'bg-brand-subtle border-brand-navy text-brand-navy'
                      : 'bg-brand-surface border-brand-border text-brand-muted hover:bg-brand-subtle/40'
                  }`}
                >
                  انتخاب از رانندگان ثبت‌شده ({toPersianDigits(savedDrivers.length)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPortalPassword('');
                    setDriverMode('new');
                  }}
                  aria-pressed={driverMode === 'new'}
                  className={`p-3.5 rounded-control border text-right text-sm font-semibold transition-colors ${
                    driverMode === 'new'
                      ? 'bg-brand-subtle border-brand-navy text-brand-navy'
                      : 'bg-brand-surface border-brand-border text-brand-muted hover:bg-brand-subtle/40'
                  }`}
                >
                  + افزودن راننده جدید
                </button>
              </div>
            )}

            {driverMode === 'existing' && savedDrivers.length > 0 ? (
              <div className="space-y-3">
                <FormField label="راننده مورد نظر" required error={fieldErrors.driverId}>
                  {(props) => (
                    <select
                      {...props}
                      value={selectedDriverId}
                      onChange={(e) => {
                        setPortalPassword('');
                        setSelectedDriverId(e.target.value);
                      }}
                      className={INPUT_CLASS}
                    >
                      {savedDrivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.fullName} (کد ملی: {d.maskedNationalId})
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                {chosenSavedDriver && (
                  <p className="text-xs text-brand-muted bg-brand-subtle/50 p-3 rounded-control border border-brand-border">
                    مشخصات ثابت این راننده در پرونده شما ذخیره شده است و نیازی به ورود مجدد کد ملی
                    نیست.
                  </p>
                )}
                {chosenSavedDriver?.hasPortalPassword && (
                  <p className="text-sm text-brand-muted">
                    رمز پرونده ذخیره شده است؛ تغییر آن فقط از طریق دفتر انجام می‌شود.
                  </p>
                )}
                {chosenSavedDriver && !chosenSavedDriver.hasPortalPassword && (
                  <PortalPasswordField
                    value={portalPassword}
                    onChange={setPortalPassword}
                    error={fieldErrors.initialPortalPassword}
                  />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <FormField
                  label="نام و نام خانوادگی راننده"
                  required
                  error={fieldErrors['newDriver.fullName']}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      placeholder="مثلاً: محمد حسینی"
                      className={INPUT_CLASS}
                    />
                  )}
                </FormField>

                <FormField
                  label="کد ملی ۱۰ رقمی راننده"
                  required
                  error={fieldErrors['newDriver.nationalId']}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      maxLength={10}
                      value={newNationalId}
                      onChange={(e) => setNewNationalId(e.target.value)}
                      placeholder="0012345678"
                      className={`${INPUT_CLASS} text-left tracking-wider`}
                    />
                  )}
                </FormField>
                <div className="sm:col-span-2">
                  <PortalPasswordField
                    value={portalPassword}
                    onChange={setPortalPassword}
                    error={fieldErrors['newDriver.portalPassword']}
                  />
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6 space-y-5">
            <h2 className="text-base font-bold text-brand-navy">۲. دوره بیمه‌ای و توضیحات</h2>

            <JalaliMonthPicker
              year={jalaliYear}
              month={jalaliMonth}
              baseYear={publicConfig.currentJalaliPeriod.jalaliYear}
              onChange={({ jalaliYear: y, jalaliMonth: m }) => {
                setJalaliYear(y);
                setJalaliMonth(m);
              }}
              error={fieldErrors.jalaliYear ?? fieldErrors.jalaliMonth}
            />

            <FormField
              label="توضیحات برای کارشناس دفتر (اختیاری)"
              hint="اگر نکته‌ای درباره کارکرد یا وضعیت ماه انتخاب‌شده وجود دارد بنویسید."
              error={fieldErrors.explanation}
            >
              {(props) => (
                <textarea
                  {...props}
                  rows={3}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="توضیحات اختیاری..."
                  className={`${INPUT_CLASS} py-2.5 min-h-[96px]`}
                />
              )}
            </FormField>

            <FileUploadBox
              label="فایل‌های پیوست مرتبط (اختیاری)"
              hint="بارگذاری تصویر کارت ملی الزامی نیست؛ فقط در صورت وجود مدرک یا تصویر مرتبط بارگذاری کنید."
              files={attachments}
              onChange={setAttachments}
              maxUploadMb={publicConfig.maxUploadMb}
            />
          </Card>

          <ContactSelection state={contacts} />

          <div className="flex items-center justify-end gap-3">
            <Link
              to="/portal"
              className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-control text-sm font-medium bg-brand-surface border border-brand-border text-brand-text hover:bg-brand-subtle"
            >
              انصراف
            </Link>
            <PrimaryButton type="submit" icon={<Eye className="w-4 h-4" aria-hidden="true" />}>
              بازبینی و تأیید اطلاعات
            </PrimaryButton>
          </div>
        </form>
      ) : (
        /* Review / Confirmation Step */
        <Card className="p-6 sm:p-8 space-y-6">
          <h2 className="text-lg font-bold text-brand-navy border-b border-brand-border pb-3">
            بازبینی نهایی پیش از ارسال درخواست
          </h2>

          {duplicateWarning && (
            <Alert variant="warning" title="هشدار احتمال تکرار دوره بیمه‌ای">
              {duplicateWarning}
            </Alert>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-brand-subtle/50 p-4 rounded-control border border-brand-border">
            <div>
              <dt className="text-xs text-brand-muted">نوع خدمت:</dt>
              <dd className="font-bold text-brand-navy mt-0.5">حق بیمه رانندگان</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-muted">ماه بیمه‌ای انتخاب‌شده:</dt>
              <dd className="font-bold text-brand-navy mt-0.5">
                {formatJalaliPeriod(jalaliYear, jalaliMonth)} (تک‌ماهه)
              </dd>
            </div>
            <div>
              <dt className="text-xs text-brand-muted">راننده:</dt>
              <dd className="font-bold text-brand-text mt-0.5">
                {driverMode === 'existing' ? chosenSavedDriver?.fullName : newFullName}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-brand-muted">کد ملی راننده:</dt>
              <dd className="font-medium ltr-code mt-0.5">
                {driverMode === 'existing'
                  ? chosenSavedDriver?.maskedNationalId
                  : maskNationalId(newNationalId)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-brand-muted">توضیحات شما:</dt>
              <dd className="text-brand-text mt-0.5">
                {explanation.trim() || 'بدون توضیح تکمیلی'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-brand-muted">فایل‌های پیوست:</dt>
              <dd className="text-brand-text mt-0.5">
                {attachments.length === 0
                  ? 'بدون فایل پیوست'
                  : `${toPersianDigits(attachments.length)} فایل انتخاب شده (${attachments.map((f) => f.name).join('، ')})`}
              </dd>
            </div>
          </dl>

          <ContactsReview state={contacts} />

          {uploadProgress !== null && (
            <div className="space-y-1" role="status" aria-live="polite">
              <div className="flex justify-between text-xs font-medium text-brand-navy">
                <span>در حال ارسال امن اطلاعات و فایل‌ها...</span>
                <span>{toPersianDigits(uploadProgress)}٪</span>
              </div>
              <div className="w-full h-2 bg-brand-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-blue transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-brand-border">
            <SecondaryButton onClick={() => setStep('form')} disabled={submitting}>
              بازگشت و ویرایش
            </SecondaryButton>
            <PrimaryButton
              onClick={handleFinalSubmit}
              loading={submitting}
              icon={<Send className="w-4 h-4" aria-hidden="true" />}
            >
              ثبت قطعی درخواست در دفتر
            </PrimaryButton>
          </div>
        </Card>
      )}
    </div>
  );
}
