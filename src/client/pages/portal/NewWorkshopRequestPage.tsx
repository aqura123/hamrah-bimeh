import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, Eye, Send, UserPlus } from 'lucide-react';
import { maskNationalId } from '@shared/iran-identifiers';
import { formatJalaliPeriod, toPersianDigits } from '@shared/jalali';
import { createWorkshopRequestSchema } from '@shared/validation';
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

interface SavedWorkshopOption {
  id: string;
  workshopName: string;
  workshopCode: string;
  contactFullName: string;
  maskedContactNationalId: string;
  hasPortalPassword: boolean;
}

export function NewWorkshopRequestPage() {
  const { publicConfig } = useApp();
  const contacts = useRequestContacts();
  const [searchParams] = useSearchParams();
  const preselectedWorkshopId = searchParams.get('workshopId') ?? '';
  const initialModeParam = searchParams.get('mode');

  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [savedWorkshops, setSavedWorkshops] = useState<SavedWorkshopOption[]>([]);

  const [workshopMode, setWorkshopMode] = useState<'existing' | 'new'>('existing');
  const [selectedWorkshopId, setSelectedWorkshopId] = useState(preselectedWorkshopId);

  // New Workshop Fixed Fields (only asked when introducing a new workshop)
  const [workshopName, setWorkshopName] = useState('');
  const [workshopCode, setWorkshopCode] = useState('');
  const [contactFullName, setContactFullName] = useState('');
  const [contactNationalId, setContactNationalId] = useState('');
  const [portalPassword, setPortalPassword] = useState('');

  // Monthly Period & General Attachments
  const [jalaliYear, setJalaliYear] = useState(publicConfig.currentJalaliPeriod.jalaliYear);
  const [jalaliMonth, setJalaliMonth] = useState(publicConfig.currentJalaliPeriod.jalaliMonth);
  const [explanation, setExplanation] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);

  // Optional New Insured Employee Toggle
  const [includeNewEmployee, setIncludeNewEmployee] = useState(false);
  const [empFullName, setEmpFullName] = useState('');
  const [empNationalId, setEmpNationalId] = useState('');
  const [empInsuranceNumber, setEmpInsuranceNumber] = useState('');
  const [employeeDocuments, setEmployeeDocuments] = useState<File[]>([]);

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
    apiRequest<{ workshops: SavedWorkshopOption[] }>('/api/portal/overview')
      .then((res) => {
        if (!active) return;
        setSavedWorkshops(res.workshops);
        if (initialModeParam === 'new' || res.workshops.length === 0) {
          setWorkshopMode('new');
        } else {
          setWorkshopMode('existing');
          if (preselectedWorkshopId && res.workshops.some((w) => w.id === preselectedWorkshopId)) {
            setSelectedWorkshopId(preselectedWorkshopId);
          } else if (res.workshops[0]) {
            setSelectedWorkshopId(res.workshops[0].id);
          }
        }
      })
      .catch(() => {
        if (active) setWorkshopMode('new');
      })
      .finally(() => {
        if (active) setLoadingProfiles(false);
      });
    return () => {
      active = false;
    };
  }, [initialModeParam, preselectedWorkshopId]);

  const buildPayload = () => ({
    cardSelection: contacts.cardSelection,
    mobileSelection: contacts.mobileSelection,
    workshopMode,
    workshopId: workshopMode === 'existing' ? selectedWorkshopId : undefined,
    initialPortalPassword:
      workshopMode === 'existing' &&
      !savedWorkshops.find((w) => w.id === selectedWorkshopId)?.hasPortalPassword
        ? portalPassword
        : undefined,
    newWorkshop:
      workshopMode === 'new'
        ? {
            workshopName,
            workshopCode,
            contactFullName,
            contactNationalId,
            portalPassword,
          }
        : undefined,
    jalaliYear,
    jalaliMonth,
    explanation,
    includeNewEmployee,
    newEmployee: includeNewEmployee
      ? {
          fullName: empFullName,
          nationalId: empNationalId,
          insuranceNumber: empInsuranceNumber,
        }
      : undefined,
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

    const parsed = createWorkshopRequestSchema.safeParse(buildPayload());
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path.join('.');
        if (!errs[k]) errs[k] = issue.message;
      }
      setFieldErrors(errs);
      setFormError(parsed.error.issues[0]?.message ?? 'لطفاً خطاهای فرم را بررسی کنید.');
      return;
    }

    if (workshopMode === 'existing' && selectedWorkshopId) {
      try {
        const dup = await apiRequest<{
          duplicateExists: boolean;
          existingRequests: Array<{ referenceCode: string }>;
        }>(
          `/api/portal/check-duplicate?requestType=workshop&profileId=${encodeURIComponent(selectedWorkshopId)}&jalaliYear=${jalaliYear}&jalaliMonth=${jalaliMonth}`,
        );
        if (dup.duplicateExists) {
          setDuplicateWarning(
            `برای این کارگاه در دوره ${formatJalaliPeriod(jalaliYear, jalaliMonth)} قبلاً درخواست فعال (کد ${dup.existingRequests[0]?.referenceCode ?? ''}) ثبت شده است. در صورت نیاز به ثبت مجدد می‌توانید ادامه دهید.`,
          );
        }
      } catch {
        // Non-blocking
      }
    }

    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinalSubmit = async () => {
    setFormError(null);
    setSubmitting(true);
    const hasFiles = attachments.length > 0 || (includeNewEmployee && employeeDocuments.length > 0);
    setUploadProgress(hasFiles ? 0 : null);

    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify(buildPayload()));
      for (const f of attachments) {
        fd.append('attachments', f);
      }
      if (includeNewEmployee) {
        for (const f of employeeDocuments) {
          fd.append('employeeDocuments', f);
        }
      }

      const res = await apiUploadFormData<{
        request: { id: string; referenceCode: string };
        duplicateWarning: string | null;
      }>('/api/portal/requests/workshop', fd, (pct) => {
        if (hasFiles) setUploadProgress(pct);
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
        setFormError('خطا در ارسال درخواست کارگاه. اطلاعات فرم شما حفظ شده است.');
      }
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  if (loadingProfiles) return <LoadingState label="در حال آماده‌سازی فرم ثبت درخواست کارگاه..." />;

  const chosenSavedWorkshop = savedWorkshops.find((w) => w.id === selectedWorkshopId);

  if (step === 'submitted' && createdResult) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="p-8 text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-status-success-bg text-status-success flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-brand-navy">درخواست کارگاه با موفقیت ثبت شد</h1>
          <p className="text-sm text-brand-muted leading-relaxed">
            درخواست لیست بیمه ماهانه کارگاه برای دوره{' '}
            <strong className="text-brand-text">
              {formatJalaliPeriod(jalaliYear, jalaliMonth)}
            </strong>{' '}
            در سامانه ثبت گردید.
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
            توجه: پرداخت آنلاین در این سامانه انجام نمی‌شود. پس از بررسی و تکمیل کار توسط دفتر، مبلغ
            نهایی خدمات و فایل‌های خروجی در صفحه درخواست قابل مشاهده خواهد بود.
          </Alert>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to={`/portal/requests/${createdResult.id}`}
              className="inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
            >
              مشاهده صفحه درخواست
            </Link>
            <Link
              to="/portal#workshops"
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-control text-sm font-medium bg-brand-surface border border-brand-border text-brand-text hover:bg-brand-subtle"
            >
              بازگشت به کارگاه‌های من
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
          { label: 'درخواست لیست بیمه کارگاه' },
        ]}
      />

      <PageTitle
        title="ثبت درخواست لیست بیمه ماهانه کارگاه"
        subtitle="انتخاب کارگاه، تعیین ماه بیمه‌ای شمسی و معرفی اختیاری بیمه‌شده جدید"
      />

      {publicConfig.isDemo && (
        <Alert variant="warning">
          این پیش‌نمایش آزمایشی است؛ رمز واقعی سامانه تأمین اجتماعی را وارد نکنید.
        </Alert>
      )}

      {formError && <Alert variant="error">{formError}</Alert>}

      {step === 'form' ? (
        <form onSubmit={handleProceedToReview} noValidate className="space-y-6">
          {/* 1. Workshop Selection */}
          <Card className="p-6 space-y-5">
            <h2 className="text-base font-bold text-brand-navy flex items-center gap-2">
              <Building2 className="w-5 h-5 text-brand-blue" aria-hidden="true" />
              <span>۱. انتخاب یا معرفی کارگاه</span>
            </h2>

            {savedWorkshops.length > 0 && (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="نحوه انتخاب کارگاه"
              >
                <button
                  type="button"
                  onClick={() => {
                    setPortalPassword('');
                    setWorkshopMode('existing');
                  }}
                  aria-pressed={workshopMode === 'existing'}
                  className={`p-3.5 rounded-control border text-right text-sm font-semibold transition-colors ${
                    workshopMode === 'existing'
                      ? 'bg-brand-subtle border-brand-navy text-brand-navy'
                      : 'bg-brand-surface border-brand-border text-brand-muted hover:bg-brand-subtle/40'
                  }`}
                >
                  انتخاب از کارگاه‌های ثبت‌شده ({toPersianDigits(savedWorkshops.length)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPortalPassword('');
                    setWorkshopMode('new');
                  }}
                  aria-pressed={workshopMode === 'new'}
                  className={`p-3.5 rounded-control border text-right text-sm font-semibold transition-colors ${
                    workshopMode === 'new'
                      ? 'bg-brand-subtle border-brand-navy text-brand-navy'
                      : 'bg-brand-surface border-brand-border text-brand-muted hover:bg-brand-subtle/40'
                  }`}
                >
                  + افزودن کارگاه جدید
                </button>
              </div>
            )}

            {workshopMode === 'existing' && savedWorkshops.length > 0 ? (
              <div className="space-y-3">
                <FormField label="کارگاه مورد نظر" required error={fieldErrors.workshopId}>
                  {(props) => (
                    <select
                      {...props}
                      value={selectedWorkshopId}
                      onChange={(e) => {
                        setPortalPassword('');
                        setSelectedWorkshopId(e.target.value);
                      }}
                      className={INPUT_CLASS}
                    >
                      {savedWorkshops.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.workshopName} — کد کارگاه: {toPersianDigits(w.workshopCode)}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>

                {chosenSavedWorkshop && (
                  <div className="p-3.5 rounded-control bg-brand-subtle/60 border border-brand-border text-xs space-y-1">
                    <p className="font-bold text-brand-navy">
                      مشخصات ذخیره‌شده کارگاه (بدون نیاز به ورود مجدد):
                    </p>
                    <p className="text-brand-text">
                      نام کارگاه: <strong>{chosenSavedWorkshop.workshopName}</strong> · کد کارگاه:{' '}
                      <strong className="ltr-code">
                        {toPersianDigits(chosenSavedWorkshop.workshopCode)}
                      </strong>
                    </p>
                    <p className="text-brand-muted">
                      کارفرما / رابط بیمه: {chosenSavedWorkshop.contactFullName} (کد ملی:{' '}
                      <span className="ltr-code">
                        {chosenSavedWorkshop.maskedContactNationalId}
                      </span>
                      )
                    </p>
                  </div>
                )}
                {chosenSavedWorkshop?.hasPortalPassword && (
                  <p className="text-sm text-brand-muted">
                    رمز پرونده ذخیره شده است؛ تغییر آن فقط از طریق دفتر انجام می‌شود.
                  </p>
                )}
                {chosenSavedWorkshop && !chosenSavedWorkshop.hasPortalPassword && (
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
                  label="نام کارگاه"
                  required
                  error={fieldErrors['newWorkshop.workshopName']}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      value={workshopName}
                      onChange={(e) => setWorkshopName(e.target.value)}
                      placeholder="مثلاً: کارگاه صنعتی سپهر"
                      className={INPUT_CLASS}
                    />
                  )}
                </FormField>

                <FormField
                  label="کد کارگاه تأمین اجتماعی"
                  required
                  error={fieldErrors['newWorkshop.workshopCode']}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      dir="ltr"
                      value={workshopCode}
                      onChange={(e) => setWorkshopCode(e.target.value)}
                      placeholder="0412345678"
                      className={`${INPUT_CLASS} text-left tracking-wider`}
                    />
                  )}
                </FormField>

                <FormField
                  label="نام و نام خانوادگی کارفرما / رابط بیمه"
                  required
                  error={fieldErrors['newWorkshop.contactFullName']}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      value={contactFullName}
                      onChange={(e) => setContactFullName(e.target.value)}
                      placeholder="نام کامل کارفرما یا رابط"
                      className={INPUT_CLASS}
                    />
                  )}
                </FormField>

                <FormField
                  label="کد ملی ۱۰ رقمی کارفرما / رابط"
                  required
                  error={fieldErrors['newWorkshop.contactNationalId']}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      maxLength={10}
                      value={contactNationalId}
                      onChange={(e) => setContactNationalId(e.target.value)}
                      placeholder="0012345678"
                      className={`${INPUT_CLASS} text-left tracking-wider`}
                    />
                  )}
                </FormField>
                <div className="sm:col-span-2">
                  <PortalPasswordField
                    value={portalPassword}
                    onChange={setPortalPassword}
                    error={fieldErrors['newWorkshop.portalPassword']}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* 2. Monthly Period & Files */}
          <Card className="p-6 space-y-5">
            <h2 className="text-base font-bold text-brand-navy">۲. دوره بیمه‌ای و توضیحات لیست</h2>

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
              label="توضیحات لیست ماهانه برای دفتر (اختیاری)"
              hint="مثلاً تغییرات روزهای کارکرد، ترک کار یا نکات مربوط به لیست این ماه."
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
              label="فایل‌های مربوط به لیست ماهانه (اختیاری)"
              hint="مانند فایل PDF یا تصویر لیست کارکرد ماهانه کارگاه"
              files={attachments}
              onChange={setAttachments}
              maxUploadMb={publicConfig.maxUploadMb}
            />
          </Card>

          {/* 3. Optional New Insured Employee Section */}
          <Card className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <UserPlus className="w-5 h-5 text-brand-blue shrink-0 mt-1" aria-hidden="true" />
                <div>
                  <h2 className="text-base font-bold text-brand-navy">
                    ۳. افزودن بیمه‌شده جدید به کارگاه (اختیاری)
                  </h2>
                  <p className="text-xs text-brand-muted mt-0.5">
                    در صورتی که در این ماه نیروی جدیدی جذب کرده‌اید، این گزینه را فعال نمایید.
                  </p>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer select-none min-h-[40px] px-3 py-1.5 rounded-control bg-brand-subtle border border-brand-border text-xs font-bold text-brand-navy">
                <input
                  type="checkbox"
                  checked={includeNewEmployee}
                  onChange={(e) => setIncludeNewEmployee(e.target.checked)}
                  className="w-4 h-4 accent-brand-navy rounded"
                />
                <span>افزودن بیمه‌شده جدید</span>
              </label>
            </div>

            {includeNewEmployee && (
              <div className="pt-4 border-t border-brand-border space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    label="نام و نام خانوادگی بیمه‌شده"
                    required
                    error={fieldErrors['newEmployee.fullName']}
                  >
                    {(props) => (
                      <input
                        {...props}
                        type="text"
                        value={empFullName}
                        onChange={(e) => setEmpFullName(e.target.value)}
                        placeholder="نام کامل بیمه‌شده"
                        className={INPUT_CLASS}
                      />
                    )}
                  </FormField>

                  <FormField
                    label="کد ملی ۱۰ رقمی بیمه‌شده"
                    required
                    error={fieldErrors['newEmployee.nationalId']}
                  >
                    {(props) => (
                      <input
                        {...props}
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        maxLength={10}
                        value={empNationalId}
                        onChange={(e) => setEmpNationalId(e.target.value)}
                        placeholder="0012345678"
                        className={`${INPUT_CLASS} text-left tracking-wider`}
                      />
                    )}
                  </FormField>

                  <FormField
                    label="شماره بیمه تأمین اجتماعی"
                    required
                    error={fieldErrors['newEmployee.insuranceNumber']}
                  >
                    {(props) => (
                      <input
                        {...props}
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        value={empInsuranceNumber}
                        onChange={(e) => setEmpInsuranceNumber(e.target.value)}
                        placeholder="00123456"
                        className={`${INPUT_CLASS} text-left tracking-wider`}
                      />
                    )}
                  </FormField>
                </div>

                <FileUploadBox
                  label="مدارک مرتبط با بیمه‌شده جدید (اختیاری)"
                  hint="مانند تصویر شناسنامه یا مدارک هویتی/بیمه‌ای نیروی جدید"
                  files={employeeDocuments}
                  onChange={setEmployeeDocuments}
                  maxUploadMb={publicConfig.maxUploadMb}
                />
              </div>
            )}
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
        /* Review Step */
        <Card className="p-6 sm:p-8 space-y-6">
          <h2 className="text-lg font-bold text-brand-navy border-b border-brand-border pb-3">
            بازبینی نهایی درخواست لیست بیمه کارگاه
          </h2>

          {duplicateWarning && (
            <Alert variant="warning" title="هشدار احتمال تکرار دوره بیمه‌ای">
              {duplicateWarning}
            </Alert>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-brand-subtle/50 p-4 rounded-control border border-brand-border">
            <div>
              <dt className="text-xs text-brand-muted">نوع خدمت:</dt>
              <dd className="font-bold text-brand-navy mt-0.5">لیست بیمه ماهانه کارگاه</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-muted">ماه بیمه‌ای:</dt>
              <dd className="font-bold text-brand-navy mt-0.5">
                {formatJalaliPeriod(jalaliYear, jalaliMonth)} (تک‌ماهه)
              </dd>
            </div>
            <div>
              <dt className="text-xs text-brand-muted">کارگاه:</dt>
              <dd className="font-bold text-brand-text mt-0.5">
                {workshopMode === 'existing' ? chosenSavedWorkshop?.workshopName : workshopName}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-brand-muted">کد کارگاه:</dt>
              <dd className="font-medium ltr-code mt-0.5">
                {toPersianDigits(
                  workshopMode === 'existing'
                    ? (chosenSavedWorkshop?.workshopCode ?? '')
                    : workshopCode,
                )}
              </dd>
            </div>

            {includeNewEmployee && (
              <div className="sm:col-span-2 p-3 rounded bg-brand-surface border border-brand-border">
                <dt className="text-xs font-bold text-brand-navy mb-1">
                  بیمه‌شده جدید معرفی‌شده در این درخواست:
                </dt>
                <dd className="text-xs text-brand-text">
                  نام: <strong>{empFullName}</strong> · کد ملی:{' '}
                  <span className="ltr-code">{maskNationalId(empNationalId)}</span> · شماره بیمه:{' '}
                  <span className="ltr-code">{toPersianDigits(empInsuranceNumber)}</span> · مدارک:{' '}
                  {toPersianDigits(employeeDocuments.length)} فایل
                </dd>
              </div>
            )}

            <div className="sm:col-span-2">
              <dt className="text-xs text-brand-muted">توضیحات شما:</dt>
              <dd className="text-brand-text mt-0.5">
                {explanation.trim() || 'بدون توضیح تکمیلی'}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs text-brand-muted">فایل‌های پیوست لیست:</dt>
              <dd className="text-brand-text mt-0.5">
                {attachments.length === 0
                  ? 'بدون فایل پیوست'
                  : `${toPersianDigits(attachments.length)} فایل (${attachments.map((f) => f.name).join('، ')})`}
              </dd>
            </div>
          </dl>

          <ContactsReview state={contacts} />

          {uploadProgress !== null && (
            <div className="space-y-1" role="status" aria-live="polite">
              <div className="flex justify-between text-xs font-medium text-brand-navy">
                <span>در حال بارگذاری امن اطلاعات و فایل‌ها...</span>
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
              ثبت قطعی درخواست کارگاه
            </PrimaryButton>
          </div>
        </Card>
      )}
    </div>
  );
}
