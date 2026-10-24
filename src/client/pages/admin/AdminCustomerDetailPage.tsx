import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, Edit3, ExternalLink, KeyRound, Save, Truck, UserCheck } from 'lucide-react';
import { PROFILE_REVIEW_LABELS, type ProfileReviewState, type RequestStatus } from '@shared/domain';
import {
  formatJalaliDate,
  formatJalaliDateTime,
  formatJalaliPeriod,
  toPersianDigits,
} from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { ApiError, apiRequest } from '../../lib/api';
import { ConfirmDialog, FormField, INPUT_CLASS } from '../../components/ui/FormControls';
import {
  Alert,
  Breadcrumb,
  Card,
  ErrorState,
  LoadingState,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';
import { StatusBadge } from '../../components/ui/StatusBadge';

interface CustomerDetailResponse {
  customer: {
    id: string;
    userId: string;
    fullName: string;
    mobile: string;
    nationalId: string | null;
    maskedNationalId: string;
    phone: string | null;
    officeNotes: string | null;
    isActive: boolean;
    createdAt: string;
  };
  authStatus: {
    forcePasswordChange: boolean;
    initialPasswordMode: string;
    isActive: boolean;
    failedLoginCount: number;
    lastLoginAt: string | null;
  };
  drivers: Array<{
    id: string;
    fullName: string;
    nationalId: string;
    reviewState: ProfileReviewState;
    isArchived: boolean;
  }>;
  workshops: Array<{
    id: string;
    workshopName: string;
    workshopCode: string;
    contactFullName: string;
    contactNationalId: string;
    reviewState: ProfileReviewState;
    isArchived: boolean;
  }>;
  requests: Array<{
    id: string;
    referenceCode: string;
    requestType: 'driver' | 'workshop';
    jalaliYear: number;
    jalaliMonth: number;
    status: RequestStatus;
    submittedAt: string;
  }>;
  auditHistory: Array<{
    id: string;
    eventType: string;
    summaryFa: string;
    createdAt: string;
  }>;
}

export function AdminCustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { publicConfig } = useApp();

  const [data, setData] = useState<CustomerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Customer Profile Edit State
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [officeNotes, setOfficeNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Reset Password Modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetMode, setResetMode] = useState<'generated' | 'national_id'>('generated');
  const [resetting, setResetting] = useState(false);
  const [issuedTempPassword, setIssuedTempPassword] = useState<string | null>(null);

  // Edit Driver Modal
  const [editingDriver, setEditingDriver] = useState<CustomerDetailResponse['drivers'][0] | null>(
    null,
  );
  const [savingDriver, setSavingDriver] = useState(false);

  // Edit Workshop Modal
  const [editingWorkshop, setEditingWorkshop] = useState<
    CustomerDetailResponse['workshops'][0] | null
  >(null);
  const [savingWorkshop, setSavingWorkshop] = useState(false);

  const loadCustomer = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<CustomerDetailResponse>(`/api/admin/customers/${customerId}`);
      setData(res);
      setFullName(res.customer.fullName);
      setMobile(res.customer.mobile);
      setNationalId(res.customer.nationalId ?? '');
      setPhone(res.customer.phone ?? '');
      setOfficeNotes(res.customer.officeNotes ?? '');
      setIsActive(res.customer.isActive);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت پرونده مشتری.');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) return;
    setBanner(null);
    setSavingCustomer(true);
    try {
      await apiRequest(`/api/admin/customers/${customerId}`, {
        method: 'PATCH',
        body: { fullName, mobile, nationalId, phone, officeNotes, isActive },
      });
      setBanner({ type: 'success', text: 'مشخصات پرونده مشتری به‌روزرسانی شد.' });
      await loadCustomer();
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'خطا در ذخیره مشخصات مشتری.',
      });
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleResetPassword = async () => {
    if (!customerId) return;
    setBanner(null);
    setResetting(true);
    try {
      const res = await apiRequest<{
        mode: string;
        oneTimeTemporaryPassword: string | null;
      }>(`/api/admin/customers/${customerId}/reset-password`, {
        method: 'POST',
        body: { mode: resetMode },
      });
      setResetModalOpen(false);
      if (res.oneTimeTemporaryPassword) {
        setIssuedTempPassword(res.oneTimeTemporaryPassword);
      } else {
        setBanner({
          type: 'success',
          text: 'رمز عبور مشتری به کد ملی بازنشانی شد و تغییر رمز در اولین ورود الزامی گردید.',
        });
      }
      await loadCustomer();
    } catch (err) {
      setResetModalOpen(false);
      setBanner({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'خطا در بازنشانی رمز عبور.',
      });
    } finally {
      setResetting(false);
    }
  };

  const handleSaveDriver = async () => {
    if (!editingDriver) return;
    setSavingDriver(true);
    setBanner(null);
    try {
      await apiRequest(`/api/admin/drivers/${editingDriver.id}`, {
        method: 'PATCH',
        body: {
          fullName: editingDriver.fullName,
          nationalId: editingDriver.nationalId,
          reviewState: editingDriver.reviewState,
          isArchived: editingDriver.isArchived,
        },
      });
      setEditingDriver(null);
      setBanner({ type: 'success', text: 'پرونده راننده ویرایش و در گزارش رویدادها ثبت شد.' });
      await loadCustomer();
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'خطا در ویرایش راننده.',
      });
    } finally {
      setSavingDriver(false);
    }
  };

  const handleSaveWorkshop = async () => {
    if (!editingWorkshop) return;
    setSavingWorkshop(true);
    setBanner(null);
    try {
      await apiRequest(`/api/admin/workshops/${editingWorkshop.id}`, {
        method: 'PATCH',
        body: {
          workshopName: editingWorkshop.workshopName,
          workshopCode: editingWorkshop.workshopCode,
          contactFullName: editingWorkshop.contactFullName,
          contactNationalId: editingWorkshop.contactNationalId,
          reviewState: editingWorkshop.reviewState,
          isArchived: editingWorkshop.isArchived,
        },
      });
      setEditingWorkshop(null);
      setBanner({ type: 'success', text: 'پرونده کارگاه ویرایش و در گزارش رویدادها ثبت شد.' });
      await loadCustomer();
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'خطا در ویرایش کارگاه.',
      });
    } finally {
      setSavingWorkshop(false);
    }
  };

  if (loading) return <LoadingState label="در حال بارگذاری پرونده مشتری..." />;
  if (error || !data) {
    return <ErrorState message={error ?? 'مشتری یافت نشد.'} onRetry={loadCustomer} />;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'همه درخواست‌ها', to: '/admin' },
          { label: 'مشتریان', to: '/admin/customers' },
          { label: data.customer.fullName },
        ]}
      />

      <PageTitle
        title={`پرونده مشتری: ${data.customer.fullName}`}
        subtitle={`نام کاربری: ${data.customer.mobile} · آخرین ورود: ${formatJalaliDateTime(data.authStatus.lastLoginAt, publicConfig.businessTimezone)}`}
        actions={
          <SecondaryButton
            onClick={() => setResetModalOpen(true)}
            icon={<KeyRound className="w-4 h-4" aria-hidden="true" />}
          >
            بازنشانی رمز عبور توسط دفتر
          </SecondaryButton>
        }
      />

      {banner && (
        <Alert variant={banner.type === 'success' ? 'success' : 'error'}>{banner.text}</Alert>
      )}

      {/* Customer Account Management Form */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-3">
          <UserCheck className="w-5 h-5 text-brand-blue" aria-hidden="true" />
          <span>مشخصات حساب کاربری مشتری (مدیریت انحصاری توسط دفتر)</span>
        </h2>

        <form onSubmit={handleSaveCustomer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField label="نام و نام خانوادگی" required>
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

            <FormField label="شماره همراه (نام کاربری)" required>
              {(props) => (
                <input
                  {...props}
                  type="tel"
                  dir="ltr"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className={`${INPUT_CLASS} text-left`}
                />
              )}
            </FormField>

            <FormField label="کد ملی ۱۰ رقمی">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  dir="ltr"
                  maxLength={10}
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  className={`${INPUT_CLASS} text-left`}
                />
              )}
            </FormField>

            <FormField label="تلفن تماس تکمیلی">
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
          </div>

          <FormField label="یادداشت داخلی دفتر (محرمانه — برای مشتری نمایش داده نمی‌شود)">
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-brand-border">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-brand-navy cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-brand-navy rounded"
              />
              <span>حساب کاربری فعال و مجاز به ورود باشد</span>
            </label>

            <PrimaryButton
              type="submit"
              loading={savingCustomer}
              icon={<Save className="w-4 h-4" aria-hidden="true" />}
            >
              ذخیره تغییرات پرونده مشتری
            </PrimaryButton>
          </div>
        </form>
      </Card>

      {/* Linked Drivers & Workshops Inspection & Editing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5 space-y-3">
          <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-2.5">
            <Truck className="w-4 h-4 text-brand-blue" aria-hidden="true" />
            <span>رانندگان زیرمجموعه ({toPersianDigits(data.drivers.length)})</span>
          </h2>
          {data.drivers.length === 0 ? (
            <p className="text-xs text-brand-muted py-3">راننده‌ای ثبت نشده است.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.drivers.map((drv) => (
                <li
                  key={drv.id}
                  className="p-3.5 rounded-control border border-brand-border bg-brand-bg flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-sm text-brand-navy">
                      {drv.fullName}{' '}
                      {drv.isArchived && (
                        <span className="text-status-danger text-xs">(بایگانی‌شده)</span>
                      )}
                    </p>
                    <p className="text-brand-muted">
                      کد ملی:{' '}
                      <strong className="ltr-code">{toPersianDigits(drv.nationalId)}</strong> ·{' '}
                      {PROFILE_REVIEW_LABELS[drv.reviewState]}
                    </p>
                  </div>
                  <SecondaryButton
                    onClick={() => setEditingDriver({ ...drv })}
                    icon={<Edit3 className="w-3.5 h-3.5" />}
                    className="!min-h-[34px] !px-3 !py-1 !text-xs"
                  >
                    ویرایش
                  </SecondaryButton>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="text-base font-bold text-brand-navy flex items-center gap-2 border-b border-brand-border pb-2.5">
            <Building2 className="w-4 h-4 text-brand-blue" aria-hidden="true" />
            <span>کارگاه‌های زیرمجموعه ({toPersianDigits(data.workshops.length)})</span>
          </h2>
          {data.workshops.length === 0 ? (
            <p className="text-xs text-brand-muted py-3">کارگاهی ثبت نشده است.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.workshops.map((ws) => (
                <li
                  key={ws.id}
                  className="p-3.5 rounded-control border border-brand-border bg-brand-bg flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-sm text-brand-navy">
                      {ws.workshopName}{' '}
                      {ws.isArchived && (
                        <span className="text-status-danger text-xs">(بایگانی‌شده)</span>
                      )}
                    </p>
                    <p className="text-brand-muted">
                      کد کارگاه:{' '}
                      <strong className="ltr-code">{toPersianDigits(ws.workshopCode)}</strong> ·
                      رابط: {ws.contactFullName} ({toPersianDigits(ws.contactNationalId)})
                    </p>
                  </div>
                  <SecondaryButton
                    onClick={() => setEditingWorkshop({ ...ws })}
                    icon={<Edit3 className="w-3.5 h-3.5" />}
                    className="!min-h-[34px] !px-3 !py-1 !text-xs"
                  >
                    ویرایش
                  </SecondaryButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Customer Requests History */}
      <Card className="p-5 space-y-3">
        <h2 className="text-base font-bold text-brand-navy border-b border-brand-border pb-2.5">
          سابقه تمام درخواست‌های این مشتری ({toPersianDigits(data.requests.length)})
        </h2>
        {data.requests.length === 0 ? (
          <p className="text-xs text-brand-muted py-2">درخواستی ثبت نشده است.</p>
        ) : (
          <div className="divide-y divide-brand-border">
            {data.requests.map((r) => (
              <div
                key={r.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="ltr-code font-bold text-brand-navy">{r.referenceCode}</span>
                  <span>{r.requestType === 'driver' ? 'راننده' : 'کارگاه'}</span>
                  <span className="font-semibold">
                    دوره: {formatJalaliPeriod(r.jalaliYear, r.jalaliMonth)}
                  </span>
                  <span className="text-brand-muted">
                    ثبت: {formatJalaliDate(r.submittedAt, publicConfig.businessTimezone)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  <Link
                    to={`/admin/requests/${r.id}`}
                    className="inline-flex items-center gap-1 font-bold text-brand-blue hover:underline"
                  >
                    <span>باز کردن</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Password Reset Modal */}
      <ConfirmDialog
        open={resetModalOpen}
        title="بازنشانی رمز عبور مشتری توسط دفتر"
        description="رمز عبور قبلی به‌صورت هش غیرقابل بازگشت ذخیره شده و هرگز نمایش داده نمی‌شود. با بازنشانی، نشست‌های فعلی بسته شده و مشتری در ورود بعدی ملزم به تغییر رمز خواهد بود."
        confirmLabel="تأیید و بازنشانی رمز عبور"
        loading={resetting}
        onConfirm={handleResetPassword}
        onClose={() => setResetModalOpen(false)}
      >
        <FormField label="روش صدور اعتبار موقت جدید">
          {(props) => (
            <select
              {...props}
              value={resetMode}
              onChange={(e) => setResetMode(e.target.value as 'generated' | 'national_id')}
              className={INPUT_CLASS}
            >
              <option value="generated">صدور رمز موقت یک‌بارمصرف ۱۲ کاراکتری (پیشنهادی)</option>
              <option value="national_id">تنظیم کد ملی ثبت‌شده مشتری به‌عنوان رمز موقت</option>
            </select>
          )}
        </FormField>
      </ConfirmDialog>

      {/* One-time Reset Password Display Modal */}
      <ConfirmDialog
        open={issuedTempPassword !== null}
        title="رمز عبور موقت جدید صادر شد"
        confirmLabel="متوجه شدم"
        onConfirm={() => setIssuedTempPassword(null)}
        onClose={() => setIssuedTempPassword(null)}
      >
        <div className="p-4 rounded-control bg-status-warning-bg border border-status-warning/40 space-y-2">
          <p className="text-xs font-bold text-status-warning">
            این رمز موقت فقط همین یک‌بار نمایش داده می‌شود؛ آن را به مشتری تحویل دهید:
          </p>
          <p className="text-lg font-extrabold ltr-code text-brand-navy select-all">
            {issuedTempPassword}
          </p>
        </div>
      </ConfirmDialog>

      {/* Edit Driver Modal */}
      <ConfirmDialog
        open={editingDriver !== null}
        title="ویرایش مشخصات راننده"
        description="تغییرات در گزارش رویدادها (Audit Trail) ثبت می‌شود."
        confirmLabel="ذخیره تغییرات راننده"
        loading={savingDriver}
        onConfirm={handleSaveDriver}
        onClose={() => setEditingDriver(null)}
      >
        {editingDriver && (
          <div className="space-y-3">
            <FormField label="نام کامل راننده" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={editingDriver.fullName}
                  onChange={(e) => setEditingDriver({ ...editingDriver, fullName: e.target.value })}
                  className={INPUT_CLASS}
                />
              )}
            </FormField>
            <FormField label="کد ملی ۱۰ رقمی" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  dir="ltr"
                  maxLength={10}
                  value={editingDriver.nationalId}
                  onChange={(e) =>
                    setEditingDriver({ ...editingDriver, nationalId: e.target.value })
                  }
                  className={`${INPUT_CLASS} text-left`}
                />
              )}
            </FormField>
            <FormField label="وضعیت بررسی پرونده">
              {(props) => (
                <select
                  {...props}
                  value={editingDriver.reviewState}
                  onChange={(e) =>
                    setEditingDriver({
                      ...editingDriver,
                      reviewState: e.target.value as ProfileReviewState,
                    })
                  }
                  className={INPUT_CLASS}
                >
                  <option value="confirmed">تأییدشده در پرونده</option>
                  <option value="pending_office_review">در انتظار تطبیق دفتر</option>
                </select>
              )}
            </FormField>
            <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={editingDriver.isArchived}
                onChange={(e) =>
                  setEditingDriver({ ...editingDriver, isArchived: e.target.checked })
                }
                className="w-4 h-4 accent-brand-navy"
              />
              <span>بایگانی کردن پرونده راننده</span>
            </label>
          </div>
        )}
      </ConfirmDialog>

      {/* Edit Workshop Modal */}
      <ConfirmDialog
        open={editingWorkshop !== null}
        title="ویرایش مشخصات کارگاه"
        description="تغییرات در گزارش رویدادها (Audit Trail) ثبت می‌شود."
        confirmLabel="ذخیره تغییرات کارگاه"
        loading={savingWorkshop}
        onConfirm={handleSaveWorkshop}
        onClose={() => setEditingWorkshop(null)}
      >
        {editingWorkshop && (
          <div className="space-y-3">
            <FormField label="نام کارگاه" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={editingWorkshop.workshopName}
                  onChange={(e) =>
                    setEditingWorkshop({ ...editingWorkshop, workshopName: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
              )}
            </FormField>
            <FormField label="کد کارگاه" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  dir="ltr"
                  value={editingWorkshop.workshopCode}
                  onChange={(e) =>
                    setEditingWorkshop({ ...editingWorkshop, workshopCode: e.target.value })
                  }
                  className={`${INPUT_CLASS} text-left`}
                />
              )}
            </FormField>
            <FormField label="نام کارفرما / رابط بیمه" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={editingWorkshop.contactFullName}
                  onChange={(e) =>
                    setEditingWorkshop({ ...editingWorkshop, contactFullName: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
              )}
            </FormField>
            <FormField label="کد ملی رابط" required>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  dir="ltr"
                  maxLength={10}
                  value={editingWorkshop.contactNationalId}
                  onChange={(e) =>
                    setEditingWorkshop({ ...editingWorkshop, contactNationalId: e.target.value })
                  }
                  className={`${INPUT_CLASS} text-left`}
                />
              )}
            </FormField>
            <FormField label="وضعیت بررسی پرونده">
              {(props) => (
                <select
                  {...props}
                  value={editingWorkshop.reviewState}
                  onChange={(e) =>
                    setEditingWorkshop({
                      ...editingWorkshop,
                      reviewState: e.target.value as ProfileReviewState,
                    })
                  }
                  className={INPUT_CLASS}
                >
                  <option value="confirmed">تأییدشده در پرونده</option>
                  <option value="pending_office_review">در انتظار تطبیق دفتر</option>
                </select>
              )}
            </FormField>
            <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={editingWorkshop.isArchived}
                onChange={(e) =>
                  setEditingWorkshop({ ...editingWorkshop, isArchived: e.target.checked })
                }
                className="w-4 h-4 accent-brand-navy"
              />
              <span>بایگانی کردن پرونده کارگاه</span>
            </label>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
