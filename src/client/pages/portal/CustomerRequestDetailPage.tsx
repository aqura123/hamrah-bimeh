import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Ban,
  Clock,
  Download,
  FileText,
  MessageSquare,
  Send,
  UserPlus,
  Wallet,
} from 'lucide-react';
import {
  FILE_CLASSIFICATION_LABELS,
  formatMoney,
  REQUEST_STATUS_DESCRIPTIONS,
  REQUEST_TYPE_LABELS,
  TERMINAL_REQUEST_STATUSES,
  type CurrencyUnit,
  type FileClassification,
  type RequestStatus,
  type RequestType,
} from '@shared/domain';
import { formatJalaliDateTime, formatJalaliPeriod, toPersianDigits } from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { PaymentDialog } from '../../components/payments/PaymentDialog';
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
} from '../../components/ui/Primitives';
import {
  AwaitingInfoBadge,
  CancellationPendingBadge,
  StatusBadge,
} from '../../components/ui/StatusBadge';

export interface RequestDetailPayload {
  cardDetails?: {
    id: string;
    number: string;
    cvv2: string;
    expiryMonth: string;
    expiryYear: string;
    holderName: string;
    bankName: string;
  } | null;
  mobileDetails?: { id: string; mobile: string; ownerName: string; verified: boolean } | null;
  request: {
    id: string;
    referenceCode: string;
    requestType: RequestType;
    jalaliYear: number;
    jalaliMonth: number;
    status: RequestStatus;
    awaitingCustomerInfo: boolean;
    awaitingCustomerInfoNote: string | null;
    cancellationRequested: boolean;
    cancellationRequestReason: string | null;
    cancellationRequestedAt: string | null;
    cancellationDecision: 'pending' | 'accepted' | 'rejected' | null;
    cancellationDecisionNote: string | null;
    cancellationDecidedAt: string | null;
    finalAmount: number | null;
    paymentCardNumber?: string | null;
    currencyUnit: CurrencyUnit;
    initialExplanation: string | null;
    hasNewEmployeeSubmission: boolean;
    submittedAt: string;
    completedAt: string | null;
    rejectedAt: string | null;
    cancelledAt: string | null;
    lastActivityAt: string;
    allowedNextStatuses: RequestStatus[];
  };
  customer: {
    id: string;
    fullName: string;
    mobile: string;
    maskedNationalId: string;
    nationalId?: string | null;
    phone?: string | null;
  } | null;
  driver: {
    id: string;
    fullName: string;
    maskedNationalId: string;
    nationalId?: string;
    portalPassword?: string;
    reviewState: string;
  } | null;
  workshop: {
    id: string;
    workshopName: string;
    workshopCode: string;
    contactFullName: string;
    maskedContactNationalId: string;
    contactNationalId?: string;
    portalPassword?: string;
    reviewState: string;
  } | null;
  employeeSubmissions: Array<{
    id: string;
    employeeId: string;
    fullName: string;
    insuranceNumber: string;
    maskedNationalId: string;
    nationalId?: string;
    createdAt: string;
  }>;
  messages: Array<{
    id: string;
    authorRole: 'customer' | 'office_admin';
    authorName: string;
    messageKind: string;
    body: string;
    createdAt: string;
  }>;
  files: Array<{
    id: string;
    uploaderRole: 'customer' | 'office_admin';
    classification: FileClassification;
    displayFilename: string;
    detectedMimeType: string;
    byteSize: number;
    createdAt: string;
    downloadUrl: string;
  }>;
  timeline: Array<{
    id: string;
    actorRole: string;
    eventType: string;
    summaryFa: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export function CustomerRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const { publicConfig } = useApp();

  const [detail, setDetail] = useState<RequestDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reply state
  const [replyBody, setReplyBody] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyProgress, setReplyProgress] = useState<number | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState<string | null>(null);

  // Cancellation modal state
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<RequestDetailPayload>(`/api/requests/${requestId}`);
      setDetail(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت جزئیات درخواست.');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId) return;
    setReplyError(null);
    setReplySuccess(null);
    setSendingReply(true);
    setReplyProgress(replyFiles.length > 0 ? 0 : null);

    try {
      const fd = new FormData();
      fd.append('body', replyBody);
      for (const f of replyFiles) {
        fd.append('attachments', f);
      }

      await apiUploadFormData(`/api/requests/${requestId}/messages`, fd, (pct) => {
        if (replyFiles.length > 0) setReplyProgress(pct);
      });

      setReplyBody('');
      setReplyFiles([]);
      setReplySuccess('توضیحات شما با موفقیت ثبت شد.');
      await loadDetail();
    } catch (err) {
      setReplyError(err instanceof ApiError ? err.message : 'خطا در ارسال پیام.');
    } finally {
      setSendingReply(false);
      setReplyProgress(null);
    }
  };

  const handleSubmitCancellationRequest = async () => {
    if (!requestId) return;
    setCancelError(null);
    setSubmittingCancel(true);

    try {
      await apiRequest(`/api/requests/${requestId}/request-cancellation`, {
        method: 'POST',
        body: { reason: cancelReason },
      });
      setCancelModalOpen(false);
      setCancelReason('');
      await loadDetail();
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'خطا در ثبت درخواست لغو.');
    } finally {
      setSubmittingCancel(false);
    }
  };

  if (loading) return <LoadingState label="در حال بارگذاری پرونده درخواست..." />;
  if (error || !detail) {
    return <ErrorState message={error ?? 'پرونده یافت نشد.'} onRetry={loadDetail} />;
  }

  const { request: r } = detail;
  const isTerminal = TERMINAL_REQUEST_STATUSES.includes(r.status);
  const periodLabel = formatJalaliPeriod(r.jalaliYear, r.jalaliMonth);
  const officeFiles = detail.files.filter((f) => f.classification === 'office_output');
  const customerFiles = detail.files.filter((f) => f.classification !== 'office_output');

  return (
    <div className="space-y-6">
      {paymentOpen && <PaymentDialog onClose={() => setPaymentOpen(false)} />}
      <Breadcrumb
        items={[
          { label: 'پرتال من', to: '/portal' },
          detail.driver
            ? {
                label: `راننده: ${detail.driver.fullName}`,
                to: `/portal/drivers/${detail.driver.id}`,
              }
            : detail.workshop
              ? {
                  label: `کارگاه: ${detail.workshop.workshopName}`,
                  to: `/portal/workshops/${detail.workshop.id}`,
                }
              : { label: 'درخواست‌ها', to: '/portal' },
          { label: `درخواست ${r.referenceCode}` },
        ]}
      />

      <PageTitle
        title={`درخواست ${REQUEST_TYPE_LABELS[r.requestType]} — دوره ${periodLabel}`}
        subtitle={`کد پیگیری: ${r.referenceCode} · ثبت‌شده در ${formatJalaliDateTime(r.submittedAt, publicConfig.businessTimezone)}`}
        documentTitle={`درخواست ${r.referenceCode}`}
        actions={
          !isTerminal &&
          r.cancellationDecision !== 'pending' && (
            <DangerButton
              onClick={() => {
                setCancelError(null);
                setCancelModalOpen(true);
              }}
              icon={<Ban className="w-4 h-4" aria-hidden="true" />}
            >
              درخواست لغو
            </DangerButton>
          )
        }
      />

      {/* Status & Coexisting Pending-Info Banner */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            {r.awaitingCustomerInfo && <AwaitingInfoBadge primaryStatus={r.status} />}
            {r.cancellationDecision === 'pending' && <CancellationPendingBadge />}
          </div>
          <span className="text-xs text-brand-muted">
            آخرین بروزرسانی: {formatJalaliDateTime(r.lastActivityAt, publicConfig.businessTimezone)}
          </span>
        </div>

        <p className="text-sm text-brand-text">{REQUEST_STATUS_DESCRIPTIONS[r.status]}</p>

        {r.awaitingCustomerInfo && (
          <Alert variant="warning" title="نیاز به تکمیل اطلاعات یا مدرک از سوی شما">
            <p>
              {r.awaitingCustomerInfoNote ||
                'لطفاً پیام کارشناس دفتر را در پایین صفحه مطالعه و پاسخ خود را ثبت نمایید.'}
            </p>
            {r.status === 'in_progress' && (
              <p className="text-xs mt-1 font-medium">
                توجه: بخش‌های دیگر درخواست شما هم‌زمان در دفتر «در حال انجام» است و با ارسال پاسخ
                شما تکمیل می‌شود.
              </p>
            )}
          </Alert>
        )}

        {r.cancellationDecision === 'pending' && (
          <Alert variant="info" title="درخواست لغو شما در انتظار بررسی دفتر است">
            لغو نهایی درخواست نیازمند بررسی و تصمیم دفتر است. نتیجه تصمیم در همین صفحه اطلاع‌رسانی
            خواهد شد.
          </Alert>
        )}

        {r.cancellationDecision === 'rejected' && r.cancellationDecisionNote && (
          <Alert variant="warning" title="نتیجه بررسی درخواست لغو: عدم موافقت دفتر">
            توضیح دفتر: {r.cancellationDecisionNote}
          </Alert>
        )}

        {r.cancellationDecision === 'accepted' && r.cancellationDecisionNote && (
          <Alert variant="info" title="نتیجه بررسی درخواست لغو: موافقت دفتر و لغو پرونده">
            توضیح دفتر: {r.cancellationDecisionNote}
          </Alert>
        )}
      </Card>

      {/* Summary Grid + Final Amount (shown ONLY when office has entered it) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5 space-y-4">
          <h2 className="text-base font-bold text-brand-navy border-b border-brand-border pb-2.5">
            مشخصات پرونده و دوره بیمه‌ای
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-brand-muted">کد پیگیری:</dt>
              <dd className="font-bold ltr-code text-brand-navy mt-0.5">{r.referenceCode}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-muted">ماه بیمه‌ای (تقویم شمسی):</dt>
              <dd className="font-bold text-brand-navy mt-0.5">{periodLabel}</dd>
            </div>
            {detail.driver && (
              <>
                <div>
                  <dt className="text-xs text-brand-muted">نام راننده:</dt>
                  <dd className="font-semibold text-brand-text mt-0.5">{detail.driver.fullName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-brand-muted">کد ملی راننده:</dt>
                  <dd className="ltr-code font-medium mt-0.5">{detail.driver.maskedNationalId}</dd>
                </div>
              </>
            )}
            {detail.workshop && (
              <>
                <div>
                  <dt className="text-xs text-brand-muted">نام کارگاه:</dt>
                  <dd className="font-semibold text-brand-text mt-0.5">
                    {detail.workshop.workshopName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-brand-muted">کد کارگاه:</dt>
                  <dd className="ltr-code font-medium mt-0.5">
                    {toPersianDigits(detail.workshop.workshopCode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-brand-muted">کارفرما / رابط بیمه:</dt>
                  <dd className="text-brand-text mt-0.5">{detail.workshop.contactFullName}</dd>
                </div>
              </>
            )}
          </dl>

          {detail.employeeSubmissions.length > 0 && (
            <div className="pt-3 border-t border-brand-border space-y-2">
              <h3 className="text-xs font-bold text-brand-navy flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-brand-blue" aria-hidden="true" />
                <span>بیمه‌شده جدید معرفی‌شده در این درخواست ماهانه:</span>
              </h3>
              {detail.employeeSubmissions.map((emp) => (
                <div
                  key={emp.id}
                  className="p-3 rounded-control bg-brand-subtle/60 border border-brand-border text-xs flex flex-wrap gap-x-6 gap-y-1"
                >
                  <span>
                    نام: <strong>{emp.fullName}</strong>
                  </span>
                  <span>
                    کد ملی: <strong className="ltr-code">{emp.maskedNationalId}</strong>
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

        {/* Final Fee Card (Shown clearly only when office entered it; no fee breakdown) */}
        <Card className="p-5 flex flex-col justify-between bg-brand-subtle/40 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-navy">
              <Wallet className="w-5 h-5 text-brand-blue" aria-hidden="true" />
              <h2 className="text-base font-bold">مبلغ نهایی خدمات</h2>
            </div>

            {r.finalAmount !== null ? (
              <div className="pt-2 space-y-1">
                <p className="text-2xl font-extrabold text-brand-navy">
                  {formatMoney(r.finalAmount, r.currencyUnit)}
                </p>
                <p className="text-xs text-brand-muted">
                  مبلغ نهایی ثبت‌شده توسط دفتر (واحد پولی: {publicConfig.currencyLabel})
                </p>
              </div>
            ) : (
              <p className="text-sm text-brand-muted pt-2 leading-relaxed">
                مبلغ نهایی هنوز توسط دفتر ثبت نشده است و پس از انجام کار در این بخش درج می‌شود.
              </p>
            )}
          </div>

          <div className="border-t border-brand-border pt-3">
            <PrimaryButton onClick={() => setPaymentOpen(true)}>پرداخت</PrimaryButton>
          </div>
        </Card>
      </div>

      {/* Authorized Files Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-5 space-y-3">
          <h2 className="text-base font-bold text-brand-navy flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-blue" aria-hidden="true" />
            <span>فایل‌های خروجی دفتر ({toPersianDigits(officeFiles.length)})</span>
          </h2>
          {officeFiles.length === 0 ? (
            <p className="text-xs text-brand-muted py-3">
              هنوز فایل خروجی توسط دفتر بارگذاری نشده است.
            </p>
          ) : (
            <ul className="space-y-2">
              {officeFiles.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-control bg-status-success-bg/50 border border-brand-turquoise/50 text-xs"
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
                        setReplyError(
                          err instanceof ApiError ? err.message : 'خطا در دانلود فایل.',
                        ),
                      )
                    }
                    className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-control font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>دانلود</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-base font-bold text-brand-navy flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-blue" aria-hidden="true" />
            <span>مدارک ارسالی شما ({toPersianDigits(customerFiles.length)})</span>
          </h2>
          {customerFiles.length === 0 ? (
            <p className="text-xs text-brand-muted py-3">فایل پیوستی از سوی شما ارسال نشده است.</p>
          ) : (
            <ul className="space-y-2">
              {customerFiles.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-control bg-brand-subtle/60 border border-brand-border text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-text truncate">{f.displayFilename}</p>
                    <p className="text-brand-muted mt-0.5">
                      {FILE_CLASSIFICATION_LABELS[f.classification]} ·{' '}
                      {toPersianDigits(Math.max(1, Math.round(f.byteSize / 1024)))} کیلوبایت
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      downloadProtectedFile(f.downloadUrl, f.displayFilename).catch((err) =>
                        setReplyError(
                          err instanceof ApiError ? err.message : 'خطا در دانلود فایل.',
                        ),
                      )
                    }
                    className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-control font-semibold bg-brand-surface border border-brand-border text-brand-navy hover:bg-brand-subtle shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>دانلود</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Two-Way Explanation / Message Thread */}
      <Card className="p-6 space-y-5">
        <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-3">
          <MessageSquare className="w-5 h-5 text-brand-blue" aria-hidden="true" />
          <span>توضیحات و گفتگو با کارشناس دفتر ({toPersianDigits(detail.messages.length)})</span>
        </h2>

        {detail.messages.length === 0 ? (
          <p className="text-sm text-brand-muted py-2">
            هنوز توضیح یا پیامی در این درخواست ثبت نشده است.
          </p>
        ) : (
          <div className="space-y-3">
            {detail.messages.map((msg) => {
              const fromOffice = msg.authorRole === 'office_admin';
              return (
                <div
                  key={msg.id}
                  className={`p-4 rounded-card border text-sm space-y-1.5 ${
                    fromOffice
                      ? 'bg-status-info-bg/60 border-brand-blue/30 mr-0 sm:ml-8'
                      : 'bg-brand-subtle/60 border-brand-border mr-0 sm:mr-8'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-brand-navy">
                      {fromOffice ? `کارشناس دفتر (${msg.authorName})` : `شما (${msg.authorName})`}
                    </span>
                    <span className="text-brand-muted">
                      {formatJalaliDateTime(msg.createdAt, publicConfig.businessTimezone)}
                    </span>
                  </div>
                  <p className="text-brand-text whitespace-pre-line leading-relaxed">{msg.body}</p>
                </div>
              );
            })}
          </div>
        )}

        {!isTerminal ? (
          <form
            onSubmit={handleSendMessage}
            className="pt-4 border-t border-brand-border space-y-4"
          >
            {replyError && <Alert variant="error">{replyError}</Alert>}
            {replySuccess && <Alert variant="success">{replySuccess}</Alert>}

            <FormField
              label="ارسال توضیح جدید یا پاسخ به دفتر"
              required
              hint="پاسخ شما به همراه فایل پیوست احتمالی فوراً برای کارشناس دفتر قابل مشاهده خواهد بود."
            >
              {(props) => (
                <textarea
                  {...props}
                  rows={3}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="متن توضیح یا پاسخ خود را وارد کنید..."
                  className={`${INPUT_CLASS} py-2.5`}
                />
              )}
            </FormField>

            <FileUploadBox
              label="پیوست مدرک تکمیلی به همراه این پیام (اختیاری)"
              files={replyFiles}
              onChange={setReplyFiles}
              maxUploadMb={publicConfig.maxUploadMb}
              uploadProgress={replyProgress}
            />

            <div className="flex justify-end">
              <PrimaryButton
                type="submit"
                loading={sendingReply}
                icon={<Send className="w-4 h-4" aria-hidden="true" />}
              >
                ثبت پیام و ارسال به دفتر
              </PrimaryButton>
            </div>
          </form>
        ) : (
          <p className="text-xs text-brand-muted pt-3 border-t border-brand-border">
            این درخواست در وضعیت پایانی قرار دارد؛ کلیه پیام‌ها، فایل‌ها و تاریخچه جهت استناد شما
            حفظ شده‌اند.
          </p>
        )}
      </Card>

      {/* Chronological Event History Timeline */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-3">
          <Clock className="w-5 h-5 text-brand-blue" aria-hidden="true" />
          <span>تاریخچه زمانی رویدادهای درخواست</span>
        </h2>

        <ol className="relative border-r-2 border-brand-border mr-3 space-y-4 pr-5">
          {detail.timeline.map((ev, idx) => {
            const isLatest = idx === detail.timeline.length - 1;
            return (
              <li key={ev.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -right-[27px] top-1.5 w-3 h-3 rounded-full border-2 border-brand-surface ${
                    isLatest ? 'bg-brand-turquoise ring-2 ring-brand-blue' : 'bg-brand-blue'
                  }`}
                />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <span
                    className={`font-semibold ${isLatest ? 'text-brand-navy font-bold' : 'text-brand-text'}`}
                  >
                    {ev.summaryFa}
                    {isLatest && (
                      <span className="mr-2 px-1.5 py-0.5 rounded bg-brand-subtle text-brand-navy text-[11px]">
                        آخرین رویداد
                      </span>
                    )}
                  </span>
                  <span className="text-brand-muted shrink-0">
                    {formatJalaliDateTime(ev.createdAt, publicConfig.businessTimezone)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Customer Cancellation Request Dialog */}
      <ConfirmDialog
        open={cancelModalOpen}
        title="ثبت درخواست لغو پرونده"
        description="توجه داشته باشید که ثبت درخواست لغو به‌منزله لغو فوری نیست؛ کارشناس دفتر وضعیت پیشرفت کار را بررسی کرده و درباره موافقت یا عدم موافقت با لغو تصمیم‌گیری می‌کند."
        confirmLabel="ارسال درخواست لغو به دفتر"
        danger
        loading={submittingCancel}
        onConfirm={handleSubmitCancellationRequest}
        onClose={() => setCancelModalOpen(false)}
      >
        <div className="space-y-3">
          {cancelError && <Alert variant="error">{cancelError}</Alert>}
          <FormField label="علت درخواست لغو" required>
            {(props) => (
              <textarea
                {...props}
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="لطفاً علت درخواست لغو را برای اطلاع دفتر بنویسید..."
                className={`${INPUT_CLASS} py-2`}
              />
            )}
          </FormField>
        </div>
      </ConfirmDialog>
    </div>
  );
}
