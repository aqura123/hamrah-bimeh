import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Download,
  FileUp,
  HelpCircle,
  MessageSquare,
  Send,
  User,
  Wallet,
} from 'lucide-react';
import {
  FILE_CLASSIFICATION_LABELS,
  formatMoney,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  TERMINAL_REQUEST_STATUSES,
  type RequestStatus,
} from '@shared/domain';
import { formatMobileDisplay } from '@shared/iran-identifiers';
import { formatJalaliDateTime, formatJalaliPeriod, toPersianDigits } from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { ApiError, apiRequest, apiUploadFormData, downloadProtectedFile } from '../../lib/api';
import {
  ConfirmDialog,
  FileUploadBox,
  FormField,
  INPUT_CLASS,
} from '../../components/ui/FormControls';
import {
  Alert,
  Breadcrumb,
  Card,
  DangerButton,
  ErrorState,
  LoadingState,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';
import {
  AwaitingInfoBadge,
  CancellationPendingBadge,
  StatusBadge,
} from '../../components/ui/StatusBadge';
import type { RequestDetailPayload } from '../portal/CustomerRequestDetailPage';

export function AdminRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const { publicConfig } = useApp();

  const [detail, setDetail] = useState<RequestDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Status Transition Controls
  const [selectedNextStatus, setSelectedNextStatus] = useState<RequestStatus | ''>('');
  const [statusExplanation, setStatusExplanation] = useState('');
  const [confirmTerminalOpen, setConfirmTerminalOpen] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Independent Awaiting-Customer-Info Controls
  const [awaitingNote, setAwaitingNote] = useState('');
  const [submittingAwaiting, setSubmittingAwaiting] = useState(false);

  // Final Amount Controls
  const [amountInput, setAmountInput] = useState('');
  const [amountNote, setAmountNote] = useState('');
  const [submittingAmount, setSubmittingAmount] = useState(false);

  // Office Output File Upload Controls
  const [outputFiles, setOutputFiles] = useState<File[]>([]);
  const [outputNote, setOutputNote] = useState('');
  const [uploadingOutput, setUploadingOutput] = useState(false);
  const [outputProgress, setOutputProgress] = useState<number | null>(null);

  // Cancellation Decision Controls
  const [cancelDecisionNote, setCancelDecisionNote] = useState('');
  const [pendingCancelDecision, setPendingCancelDecision] = useState<
    'accepted' | 'rejected' | null
  >(null);
  const [submittingCancelDecision, setSubmittingCancelDecision] = useState(false);

  // General Reply Message
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<RequestDetailPayload>(`/api/requests/${requestId}`);
      setDetail(res);
      setSelectedNextStatus(res.request.allowedNextStatuses[0] ?? '');
      setAmountInput(res.request.finalAmount !== null ? String(res.request.finalAmount) : '');
      setAwaitingNote(res.request.awaitingCustomerInfoNote ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در بارگذاری پرونده درخواست.');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const executeStatusChange = async () => {
    if (!requestId || !selectedNextStatus) return;
    setActionBanner(null);
    setSubmittingStatus(true);
    try {
      await apiRequest(`/api/admin/requests/${requestId}/status`, {
        method: 'POST',
        body: {
          newStatus: selectedNextStatus,
          explanation: statusExplanation,
          awaitingCustomerInfoNote:
            selectedNextStatus === 'needs_customer_info' ? statusExplanation : undefined,
        },
      });
      setConfirmTerminalOpen(false);
      setStatusExplanation('');
      setActionBanner({
        type: 'success',
        text: `وضعیت درخواست با موفقیت به «${REQUEST_STATUS_LABELS[selectedNextStatus]}» تغییر یافت.`,
      });
      await loadDetail();
    } catch (err) {
      setConfirmTerminalOpen(false);
      setActionBanner({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'خطا در تغییر وضعیت.',
      });
    } finally {
      setSubmittingStatus(false);
    }
  };

  const handleStatusSubmitClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNextStatus) return;
    if (TERMINAL_REQUEST_STATUSES.includes(selectedNextStatus)) {
      setConfirmTerminalOpen(true);
    } else {
      void executeStatusChange();
    }
  };

  const handleToggleAwaitingInfo = async (nextState: boolean) => {
    if (!requestId) return;
    setActionBanner(null);
    setSubmittingAwaiting(true);
    try {
      await apiRequest(`/api/admin/requests/${requestId}/awaiting-info`, {
        method: 'POST',
        body: {
          awaitingCustomerInfo: nextState,
          note: awaitingNote,
        },
      });
      setActionBanner({
        type: 'success',
        text: nextState
          ? 'پرچم «نیاز به تکمیل اطلاعات مشتری» فعال شد (امکان ادامه هم‌زمان کار برقرار است).'
          : 'مورد انتظار اطلاعات مشتری برطرف شد.',
      });
      await loadDetail();
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'خطا در تغییر وضعیت انتظار اطلاعات.',
      });
    } finally {
      setSubmittingAwaiting(false);
    }
  };

  const handleSaveAmount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId) return;
    setActionBanner(null);
    setSubmittingAmount(true);
    try {
      await apiRequest(`/api/admin/requests/${requestId}/amount`, {
        method: 'POST',
        body: {
          finalAmount: amountInput,
          note: amountNote,
        },
      });
      setAmountNote('');
      setActionBanner({
        type: 'success',
        text: 'مبلغ نهایی خدمات با موفقیت ثبت و به مشتری اطلاع‌رسانی شد.',
      });
      await loadDetail();
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'خطا در ثبت مبلغ نهایی.',
      });
    } finally {
      setSubmittingAmount(false);
    }
  };

  const handleUploadOfficeFiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || outputFiles.length === 0) return;
    setActionBanner(null);
    setUploadingOutput(true);
    setOutputProgress(0);

    try {
      const fd = new FormData();
      if (outputNote.trim()) fd.append('note', outputNote.trim());
      for (const f of outputFiles) {
        fd.append('files', f);
      }

      await apiUploadFormData(`/api/admin/requests/${requestId}/files`, fd, (pct) => {
        setOutputProgress(pct);
      });

      setOutputFiles([]);
      setOutputNote('');
      setActionBanner({
        type: 'success',
        text: 'فایل خروجی دفتر بارگذاری شد و اعلان آن برای مشتری ارسال گردید.',
      });
      await loadDetail();
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'خطا در بارگذاری فایل خروجی.',
      });
    } finally {
      setUploadingOutput(false);
      setOutputProgress(null);
    }
  };

  const handleConfirmCancellationDecision = async () => {
    if (!requestId || !pendingCancelDecision) return;
    setActionBanner(null);
    setSubmittingCancelDecision(true);
    try {
      await apiRequest(`/api/admin/requests/${requestId}/cancellation-decision`, {
        method: 'POST',
        body: {
          decision: pendingCancelDecision,
          explanation: cancelDecisionNote,
        },
      });
      setPendingCancelDecision(null);
      setCancelDecisionNote('');
      setActionBanner({
        type: 'success',
        text: 'تصمیم دفتر درباره درخواست لغو ثبت شد.',
      });
      await loadDetail();
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'خطا در ثبت تصمیم لغو.',
      });
    } finally {
      setSubmittingCancelDecision(false);
    }
  };

  const handleSendOfficeReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || !replyText.trim()) return;
    setActionBanner(null);
    setSendingReply(true);
    try {
      const fd = new FormData();
      fd.append('body', replyText);
      await apiUploadFormData(`/api/requests/${requestId}/messages`, fd);
      setReplyText('');
      setActionBanner({ type: 'success', text: 'توضیح دفتر در پرونده ثبت شد.' });
      await loadDetail();
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'خطا در ارسال پیام.',
      });
    } finally {
      setSendingReply(false);
    }
  };

  if (loading) return <LoadingState label="در حال بارگذاری جزئیات مدیریتی درخواست..." />;
  if (error || !detail) {
    return <ErrorState message={error ?? 'درخواست یافت نشد.'} onRetry={loadDetail} />;
  }

  const { request: r } = detail;
  const periodLabel = formatJalaliPeriod(r.jalaliYear, r.jalaliMonth);
  const isTerminal = TERMINAL_REQUEST_STATUSES.includes(r.status);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'همه درخواست‌ها', to: '/admin' },
          { label: `مدیریت درخواست ${r.referenceCode}` },
        ]}
      />

      <PageTitle
        title={`مدیریت پرونده ${r.referenceCode} — ${REQUEST_TYPE_LABELS[r.requestType]}`}
        subtitle={`دوره بیمه‌ای: ${periodLabel} · تاریخ ثبت: ${formatJalaliDateTime(r.submittedAt, publicConfig.businessTimezone)}`}
        documentTitle={`پنل دفتر | ${r.referenceCode}`}
        actions={
          detail.customer ? (
            <Link
              to={`/admin/customers/${detail.customer.id}`}
              className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-control text-xs font-semibold bg-brand-surface border border-brand-border text-brand-navy hover:bg-brand-subtle"
            >
              <User className="w-4 h-4" aria-hidden="true" />
              <span>پرونده مشتری ({detail.customer.fullName})</span>
            </Link>
          ) : undefined
        }
      />

      {actionBanner && (
        <Alert variant={actionBanner.type === 'success' ? 'success' : 'error'}>
          {actionBanner.text}
        </Alert>
      )}

      {/* Pending Customer Cancellation Decision Banner */}
      {r.cancellationDecision === 'pending' && (
        <Card className="p-5 border-status-danger bg-status-danger-bg/40 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CancellationPendingBadge />
            <span className="text-xs text-brand-muted">
              ثبت‌شده در:{' '}
              {formatJalaliDateTime(r.cancellationRequestedAt, publicConfig.businessTimezone)}
            </span>
          </div>
          <p className="text-sm text-brand-text">
            <strong>علت اعلام‌شده توسط مشتری:</strong> {r.cancellationRequestReason}
          </p>
          <div className="space-y-3 pt-2 border-t border-status-danger/20">
            <FormField label="توضیح تصمیم دفتر برای مشتری (الزامی)" required>
              {(props) => (
                <textarea
                  {...props}
                  rows={2}
                  value={cancelDecisionNote}
                  onChange={(e) => setCancelDecisionNote(e.target.value)}
                  placeholder="توضیح موافقت با لغو یا علت ادامه کار را بنویسید..."
                  className={`${INPUT_CLASS} py-2`}
                />
              )}
            </FormField>
            <div className="flex flex-wrap gap-2">
              <DangerButton onClick={() => setPendingCancelDecision('accepted')}>
                موافقت با لغو (تغییر وضعیت به لغوشده)
              </DangerButton>
              <SecondaryButton onClick={() => setPendingCancelDecision('rejected')}>
                عدم موافقت با لغو و ادامه رسیدگی
              </SecondaryButton>
            </div>
          </div>
        </Card>
      )}

      {/* Top Row: Identity Data + Workflow & Amount Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Right Column: Customer & Driver/Workshop Authorized Details */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-border pb-3">
              <h2 className="text-base font-bold text-brand-navy">اطلاعات هویتی و اجرایی پرونده</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={r.status} />
                {r.awaitingCustomerInfo && <AwaitingInfoBadge primaryStatus={r.status} />}
              </div>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {detail.customer && (
                <>
                  <div>
                    <dt className="text-xs text-brand-muted">نام مشتری:</dt>
                    <dd className="font-bold text-brand-navy mt-0.5">{detail.customer.fullName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-brand-muted">شماره همراه مشتری:</dt>
                    <dd className="ltr-code font-medium mt-0.5">
                      {formatMobileDisplay(detail.customer.mobile)}
                    </dd>
                  </div>
                </>
              )}

              {detail.driver && (
                <>
                  <div>
                    <dt className="text-xs text-brand-muted">نام کامل راننده:</dt>
                    <dd className="font-bold text-brand-text mt-0.5">{detail.driver.fullName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-brand-muted">کد ملی راننده (ویژه اقدام دفتر):</dt>
                    <dd className="ltr-code font-bold text-brand-navy mt-0.5">
                      {toPersianDigits(detail.driver.nationalId ?? detail.driver.maskedNationalId)}
                    </dd>
                  </div>
                </>
              )}

              {detail.workshop && (
                <>
                  <div>
                    <dt className="text-xs text-brand-muted">نام کارگاه:</dt>
                    <dd className="font-bold text-brand-text mt-0.5">
                      {detail.workshop.workshopName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-brand-muted">کد کارگاه:</dt>
                    <dd className="ltr-code font-bold text-brand-navy mt-0.5">
                      {toPersianDigits(detail.workshop.workshopCode)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-brand-muted">کارفرما / رابط بیمه:</dt>
                    <dd className="text-brand-text mt-0.5">{detail.workshop.contactFullName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-brand-muted">کد ملی رابط:</dt>
                    <dd className="ltr-code font-bold text-brand-navy mt-0.5">
                      {toPersianDigits(
                        detail.workshop.contactNationalId ??
                          detail.workshop.maskedContactNationalId,
                      )}
                    </dd>
                  </div>
                </>
              )}
            </dl>

            {detail.employeeSubmissions.length > 0 && (
              <div className="pt-3 border-t border-brand-border space-y-2">
                <h3 className="text-xs font-bold text-brand-navy">
                  بیمه‌شده جدید معرفی‌شده در این درخواست ماهانه:
                </h3>
                {detail.employeeSubmissions.map((emp) => (
                  <div
                    key={emp.id}
                    className="p-3 rounded-control bg-brand-subtle border border-brand-border text-xs grid grid-cols-1 sm:grid-cols-3 gap-2"
                  >
                    <span>
                      نام: <strong>{emp.fullName}</strong>
                    </span>
                    <span>
                      کد ملی:{' '}
                      <strong className="ltr-code">
                        {toPersianDigits(emp.nationalId ?? emp.maskedNationalId)}
                      </strong>
                    </span>
                    <span>
                      شماره بیمه:{' '}
                      <strong className="ltr-code">{toPersianDigits(emp.insuranceNumber)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Files Panel (Both Customer Attachments & Office Outputs) */}
          <Card className="p-5 space-y-4">
            <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-3">
              <FileUp className="w-5 h-5 text-brand-blue" aria-hidden="true" />
              <span>
                فایل‌های پرونده و بارگذاری خروجی دفتر ({toPersianDigits(detail.files.length)})
              </span>
            </h2>

            {detail.files.length === 0 ? (
              <p className="text-xs text-brand-muted">هنوز فایلی در این پرونده ثبت نشده است.</p>
            ) : (
              <ul className="space-y-2">
                {detail.files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-control border border-brand-border bg-brand-bg text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-brand-navy truncate">{f.displayFilename}</p>
                      <p className="text-brand-muted mt-0.5">
                        {FILE_CLASSIFICATION_LABELS[f.classification]} ·{' '}
                        {toPersianDigits(Math.max(1, Math.round(f.byteSize / 1024)))} کیلوبایت
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        downloadProtectedFile(f.downloadUrl, f.displayFilename).catch((err) =>
                          setActionBanner({
                            type: 'error',
                            text: err instanceof ApiError ? err.message : 'خطا در دانلود فایل.',
                          }),
                        )
                      }
                      className="inline-flex items-center gap-1 min-h-[34px] px-3 py-1 rounded-control font-semibold bg-brand-surface border border-brand-border text-brand-navy hover:bg-brand-subtle shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>دانلود</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              onSubmit={handleUploadOfficeFiles}
              className="pt-4 border-t border-brand-border space-y-3"
            >
              <FileUploadBox
                label="بارگذاری فایل خروجی دفتر (رسید / لیست نهایی)"
                hint="فایل خروجی پس از بارگذاری برای مشتری قابل دانلود خواهد بود."
                files={outputFiles}
                onChange={setOutputFiles}
                maxUploadMb={publicConfig.maxUploadMb}
                allowedMimeTypes={publicConfig.allowedUploadMimes}
                uploadProgress={outputProgress}
              />
              <FormField label="توضیح همراه فایل خروجی (اختیاری)">
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    value={outputNote}
                    onChange={(e) => setOutputNote(e.target.value)}
                    placeholder="مثلاً: رسید ثبت نهایی مهرماه پیوست شد."
                    className={INPUT_CLASS}
                  />
                )}
              </FormField>
              <PrimaryButton
                type="submit"
                disabled={outputFiles.length === 0}
                loading={uploadingOutput}
              >
                ثبت فایل خروجی برای مشتری
              </PrimaryButton>
            </form>
          </Card>
        </div>

        {/* Administrative Operations Column */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Workflow Status Transition */}
          <Card className="p-5 space-y-4">
            <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-2.5">
              <CheckCircle2 className="w-5 h-5 text-brand-blue" aria-hidden="true" />
              <span>تغییر وضعیت درخواست</span>
            </h2>

            {isTerminal ? (
              <p className="text-xs text-brand-muted leading-relaxed">
                این درخواست در وضعیت پایانی ({REQUEST_STATUS_LABELS[r.status]}) قرار دارد و تاریخچه
                آن قفل شده است.
              </p>
            ) : (
              <form onSubmit={handleStatusSubmitClick} className="space-y-3">
                <FormField label="انتخاب وضعیت بعدی" required>
                  {(props) => (
                    <select
                      {...props}
                      value={selectedNextStatus}
                      onChange={(e) => setSelectedNextStatus(e.target.value as RequestStatus)}
                      className={INPUT_CLASS}
                    >
                      {r.allowedNextStatuses.map((st) => (
                        <option key={st} value={st}>
                          {REQUEST_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>

                <FormField
                  label="توضیح تغییر وضعیت برای مشتری"
                  required={
                    selectedNextStatus === 'rejected' ||
                    selectedNextStatus === 'cancelled' ||
                    selectedNextStatus === 'needs_customer_info'
                  }
                  hint="برای رد، لغو یا اعلام کسری اطلاعات، ثبت توضیح الزامی است."
                >
                  {(props) => (
                    <textarea
                      {...props}
                      rows={2}
                      value={statusExplanation}
                      onChange={(e) => setStatusExplanation(e.target.value)}
                      placeholder="توضیح قابل مشاهده برای مشتری..."
                      className={`${INPUT_CLASS} py-2`}
                    />
                  )}
                </FormField>

                <PrimaryButton type="submit" loading={submittingStatus} className="w-full">
                  ثبت تغییر وضعیت
                </PrimaryButton>
              </form>
            )}
          </Card>

          {/* 2. Independent Coexisting `awaitingCustomerInfo` Control */}
          {!isTerminal && (
            <Card className="p-5 space-y-3">
              <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-2.5">
                <HelpCircle className="w-5 h-5 text-brand-blue" aria-hidden="true" />
                <span>پیگیری نقص مدرک هم‌زمان با ادامه کار</span>
              </h2>
              <p className="text-xs text-brand-muted leading-relaxed">
                می‌توانید بدون متوقف کردن وضعیت «در حال انجام»، کسری مدرک یا سؤال خود را به مشتری
                اعلام کنید و پس از دریافت پاسخ آن را ببندید:
              </p>

              <FormField label="مورد موردنیاز از مشتری">
                {(props) => (
                  <textarea
                    {...props}
                    rows={2}
                    value={awaitingNote}
                    onChange={(e) => setAwaitingNote(e.target.value)}
                    placeholder="مثلاً: تصویر خوانای صفحه اول شناسنامه را ارسال کنید..."
                    className={`${INPUT_CLASS} py-2`}
                  />
                )}
              </FormField>

              <div className="flex flex-wrap gap-2">
                {!r.awaitingCustomerInfo ? (
                  <SecondaryButton
                    onClick={() => handleToggleAwaitingInfo(true)}
                    loading={submittingAwaiting}
                    className="w-full"
                  >
                    اعلام نیاز به تکمیل اطلاعات مشتری
                  </SecondaryButton>
                ) : (
                  <PrimaryButton
                    onClick={() => handleToggleAwaitingInfo(false)}
                    loading={submittingAwaiting}
                    className="w-full"
                  >
                    تأیید دریافت اطلاعات و رفع علامت انتظار
                  </PrimaryButton>
                )}
              </div>
            </Card>
          )}

          {/* 3. Final Service Amount */}
          <Card className="p-5 space-y-4">
            <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-2.5">
              <Wallet className="w-5 h-5 text-brand-blue" aria-hidden="true" />
              <span>مبلغ نهایی خدمات ({publicConfig.currencyLabel})</span>
            </h2>

            <p className="text-xs text-brand-muted">
              مبلغ فعلی ثبت‌شده:{' '}
              <strong className="text-brand-navy">
                {r.finalAmount !== null ? formatMoney(r.finalAmount, r.currencyUnit) : 'ثبت‌نشده'}
              </strong>
            </p>

            {r.status !== 'cancelled' && r.status !== 'rejected' && (
              <form onSubmit={handleSaveAmount} className="space-y-3">
                <FormField
                  label={`مبلغ کل نهایی به ${publicConfig.currencyLabel}`}
                  required
                  hint="پیش از تغییر وضعیت به «انجام‌شده»، ثبت مبلغ الزامی است."
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      placeholder="380000"
                      className={`${INPUT_CLASS} text-left font-bold`}
                    />
                  )}
                </FormField>
                <FormField label="توضیح مبلغ (اختیاری)">
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      value={amountNote}
                      onChange={(e) => setAmountNote(e.target.value)}
                      placeholder="یادداشت اختیاری برای مشتری..."
                      className={INPUT_CLASS}
                    />
                  )}
                </FormField>
                <PrimaryButton type="submit" loading={submittingAmount} className="w-full">
                  ثبت / به‌روزرسانی مبلغ نهایی
                </PrimaryButton>
              </form>
            )}
          </Card>
        </div>
      </div>

      {/* Shared Message Thread */}
      <Card className="p-6 space-y-5">
        <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-3">
          <MessageSquare className="w-5 h-5 text-brand-blue" aria-hidden="true" />
          <span>گفتگو و توضیحات مشترک با مشتری ({toPersianDigits(detail.messages.length)})</span>
        </h2>

        {detail.messages.length === 0 ? (
          <p className="text-xs text-brand-muted">هنوز پیامی ثبت نشده است.</p>
        ) : (
          <div className="space-y-3">
            {detail.messages.map((m) => {
              const fromOffice = m.authorRole === 'office_admin';
              return (
                <div
                  key={m.id}
                  className={`p-4 rounded-card border text-sm space-y-1 ${
                    fromOffice
                      ? 'bg-status-info-bg/50 border-brand-blue/30'
                      : 'bg-brand-subtle/60 border-brand-border'
                  }`}
                >
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-brand-navy">
                      {fromOffice ? `دفتر (${m.authorName})` : `مشتری (${m.authorName})`}
                    </span>
                    <span className="text-brand-muted">
                      {formatJalaliDateTime(m.createdAt, publicConfig.businessTimezone)}
                    </span>
                  </div>
                  <p className="whitespace-pre-line leading-relaxed">{m.body}</p>
                </div>
              );
            })}
          </div>
        )}

        <form
          onSubmit={handleSendOfficeReply}
          className="pt-4 border-t border-brand-border space-y-3"
        >
          <FormField label="ثبت توضیح جدید دفتر برای مشتری" required>
            {(props) => (
              <textarea
                {...props}
                rows={3}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="توضیح یا پاسخ خود را برای مشتری بنویسید..."
                className={`${INPUT_CLASS} py-2`}
              />
            )}
          </FormField>
          <div className="flex justify-end">
            <PrimaryButton
              type="submit"
              loading={sendingReply}
              icon={<Send className="w-4 h-4" aria-hidden="true" />}
            >
              ارسال توضیح به مشتری
            </PrimaryButton>
          </div>
        </form>
      </Card>

      {/* Complete Request Audit & Event Timeline */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-3">
          <Clock className="w-5 h-5 text-brand-blue" aria-hidden="true" />
          <span>تاریخچه کامل رویدادها و تغییرات (Audit Trail)</span>
        </h2>

        <ol className="relative border-r-2 border-brand-border mr-3 space-y-3.5 pr-5">
          {detail.timeline.map((ev, idx) => {
            const isLatest = idx === detail.timeline.length - 1;
            return (
              <li key={ev.id} className="relative text-xs">
                <span
                  aria-hidden="true"
                  className={`absolute -right-[27px] top-1 w-3 h-3 rounded-full border-2 border-brand-surface ${
                    isLatest ? 'bg-brand-turquoise ring-2 ring-brand-navy' : 'bg-brand-navy'
                  }`}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-brand-text">
                    {ev.summaryFa}{' '}
                    <span className="text-brand-muted font-normal">({ev.eventType})</span>
                  </span>
                  <span className="text-brand-muted">
                    {formatJalaliDateTime(ev.createdAt, publicConfig.businessTimezone)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Confirmation Dialog for Terminal Status Changes */}
      <ConfirmDialog
        open={confirmTerminalOpen}
        title={`تأیید تغییر وضعیت نهایی به «${selectedNextStatus ? REQUEST_STATUS_LABELS[selectedNextStatus] : ''}»`}
        description="تغییر وضعیت به حالت‌های پایانی (انجام‌شده، ردشده یا لغوشده) قطعی است و برای مشتری اعلان ارسال خواهد شد. آیا از ثبت این وضعیت اطمینان دارید؟"
        confirmLabel="بله، ثبت قطعی وضعیت"
        danger={selectedNextStatus === 'rejected' || selectedNextStatus === 'cancelled'}
        loading={submittingStatus}
        onConfirm={executeStatusChange}
        onClose={() => setConfirmTerminalOpen(false)}
      />

      {/* Confirmation Dialog for Cancellation Decision */}
      <ConfirmDialog
        open={pendingCancelDecision !== null}
        title={
          pendingCancelDecision === 'accepted'
            ? 'تأیید موافقت با لغو درخواست'
            : 'تأیید عدم موافقت با لغو درخواست'
        }
        description={
          pendingCancelDecision === 'accepted'
            ? 'با پذیرش درخواست لغو، وضعیت پرونده به «لغوشده» تغییر می‌یابد و تمام سوابق حفظ می‌گردد.'
            : 'با عدم موافقت، پرونده در وضعیت فعلی باقی می‌ماند و توضیح شما به مشتری نمایش داده می‌شود.'
        }
        confirmLabel="ثبت نهایی تصمیم دفتر"
        danger={pendingCancelDecision === 'accepted'}
        loading={submittingCancelDecision}
        onConfirm={handleConfirmCancellationDecision}
        onClose={() => setPendingCancelDecision(null)}
      />
    </div>
  );
}
