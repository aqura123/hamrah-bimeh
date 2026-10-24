import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, Calendar, ExternalLink, Plus, Truck, Users } from 'lucide-react';
import {
  formatMoney,
  PROFILE_REVIEW_LABELS,
  type CurrencyUnit,
  type ProfileReviewState,
  type RequestStatus,
} from '@shared/domain';
import { formatJalaliDate, formatJalaliPeriod, toPersianDigits } from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { ApiError, apiRequest } from '../../lib/api';
import {
  Breadcrumb,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
} from '../../components/ui/Primitives';
import { AwaitingInfoBadge, StatusBadge } from '../../components/ui/StatusBadge';

interface HistoryRequestRow {
  id: string;
  referenceCode: string;
  jalaliYear: number;
  jalaliMonth: number;
  status: RequestStatus;
  awaitingCustomerInfo: boolean;
  hasNewEmployeeSubmission?: boolean;
  finalAmount: number | null;
  currencyUnit: CurrencyUnit;
  submittedAt: string;
  completedAt: string | null;
}

export function ProfileHistoryPage({ kind }: { kind: 'driver' | 'workshop' }) {
  const params = useParams();
  const profileId = kind === 'driver' ? params.driverId : params.workshopId;
  const { publicConfig } = useApp();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driverInfo, setDriverInfo] = useState<{
    id: string;
    fullName: string;
    maskedNationalId: string;
    reviewState: ProfileReviewState;
  } | null>(null);
  const [workshopInfo, setWorkshopInfo] = useState<{
    id: string;
    workshopName: string;
    workshopCode: string;
    contactFullName: string;
    maskedContactNationalId: string;
    reviewState: ProfileReviewState;
  } | null>(null);
  const [employees, setEmployees] = useState<
    Array<{ id: string; fullName: string; maskedNationalId: string; insuranceNumber: string }>
  >([]);
  const [requestsList, setRequestsList] = useState<HistoryRequestRow[]>([]);

  const loadProfile = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      if (kind === 'driver') {
        const res = await apiRequest<{
          driver: NonNullable<typeof driverInfo>;
          requests: HistoryRequestRow[];
        }>(`/api/portal/drivers/${profileId}`);
        setDriverInfo(res.driver);
        setRequestsList(res.requests);
      } else {
        const res = await apiRequest<{
          workshop: NonNullable<typeof workshopInfo>;
          employees: typeof employees;
          requests: HistoryRequestRow[];
        }>(`/api/portal/workshops/${profileId}`);
        setWorkshopInfo(res.workshop);
        setEmployees(res.employees);
        setRequestsList(res.requests);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت سوابق پرونده.');
    } finally {
      setLoading(false);
    }
  }, [kind, profileId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (loading) return <LoadingState label="در حال بارگذاری سوابق ماهانه..." />;
  if (error) return <ErrorState message={error} onRetry={loadProfile} />;

  const title =
    kind === 'driver'
      ? `سوابق ماهانه راننده: ${driverInfo?.fullName ?? ''}`
      : `سوابق ماهانه کارگاه: ${workshopInfo?.workshopName ?? ''}`;

  const createNewLink =
    kind === 'driver'
      ? `/portal/requests/new/driver?driverId=${profileId}`
      : `/portal/requests/new/workshop?workshopId=${profileId}`;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'پرتال من', to: '/portal' },
          {
            label: kind === 'driver' ? 'رانندگان من' : 'کارگاه‌های من',
            to: `/portal#${kind === 'driver' ? 'drivers' : 'workshops'}`,
          },
          { label: title },
        ]}
      />

      <PageTitle
        title={title}
        subtitle="فهرست درخواست‌ها از جدیدترین ماه بیمه‌ای تا قدیمی‌ترین دوره به تفکیک تاریخ ثبت"
        actions={
          <Link
            to={createNewLink}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>ثبت درخواست ماه جدید</span>
          </Link>
        }
      />

      {/* Saved Profile Summary */}
      <Card className="p-5 bg-brand-subtle/40">
        {kind === 'driver' && driverInfo ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2 font-bold text-brand-navy">
              <Truck className="w-4 h-4 text-brand-blue" aria-hidden="true" />
              <span>نام راننده: {driverInfo.fullName}</span>
            </span>
            <span>
              کد ملی: <strong className="ltr-code">{driverInfo.maskedNationalId}</strong>
            </span>
            <span className="text-xs text-brand-muted">
              وضعیت پرونده: {PROFILE_REVIEW_LABELS[driverInfo.reviewState]}
            </span>
          </div>
        ) : workshopInfo ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2 font-bold text-brand-navy">
              <Building2 className="w-4 h-4 text-brand-blue" aria-hidden="true" />
              <span>نام کارگاه: {workshopInfo.workshopName}</span>
            </span>
            <span>
              کد کارگاه:{' '}
              <strong className="ltr-code">{toPersianDigits(workshopInfo.workshopCode)}</strong>
            </span>
            <span>رابط بیمه: {workshopInfo.contactFullName}</span>
            <span>
              کد ملی رابط:{' '}
              <strong className="ltr-code">{workshopInfo.maskedContactNationalId}</strong>
            </span>
          </div>
        ) : null}
      </Card>

      {/* Monthly Requests Table / Cards */}
      {requestsList.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-6 h-6" aria-hidden="true" />}
          title="هنوز درخواست ماهانه‌ای ثبت نشده است"
          description="اولین درخواست ماهانه خود را برای این پرونده ثبت کنید."
          action={
            <Link
              to={createNewLink}
              className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 rounded-control text-sm font-semibold bg-brand-navy text-white"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت اولین درخواست</span>
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-brand-subtle text-brand-navy border-b border-brand-border text-xs font-bold">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    دوره / ماه بیمه‌ای
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    کد پیگیری
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    تاریخ ثبت درخواست
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    وضعیت
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    مبلغ نهایی اعلامی دفتر
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {requestsList.map((r) => (
                  <tr key={r.id} className="hover:bg-brand-subtle/40">
                    <td className="px-4 py-3.5 font-bold text-brand-navy">
                      {formatJalaliPeriod(r.jalaliYear, r.jalaliMonth)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="ltr-code font-medium text-xs bg-brand-subtle px-2 py-0.5 rounded">
                        {r.referenceCode}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-brand-muted">
                      {formatJalaliDate(r.submittedAt, publicConfig.businessTimezone)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={r.status} />
                        {r.awaitingCustomerInfo && <AwaitingInfoBadge primaryStatus={r.status} />}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-medium">
                      {r.finalAmount !== null
                        ? formatMoney(r.finalAmount, r.currencyUnit)
                        : 'هنوز ثبت نشده'}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        to={`/portal/requests/${r.id}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-brand-blue hover:text-brand-navy"
                      >
                        <span>مشاهده جزئیات</span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Compact List */}
          <div className="md:hidden divide-y divide-brand-border">
            {requestsList.map((r) => (
              <Link
                key={r.id}
                to={`/portal/requests/${r.id}`}
                className="block p-4 space-y-2 hover:bg-brand-subtle/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-brand-navy">
                    دوره بیمه: {formatJalaliPeriod(r.jalaliYear, r.jalaliMonth)}
                  </span>
                  <span className="ltr-code text-xs text-brand-muted">{r.referenceCode}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={r.status} />
                  {r.awaitingCustomerInfo && <AwaitingInfoBadge primaryStatus={r.status} />}
                </div>
                <div className="flex items-center justify-between text-xs text-brand-muted pt-1">
                  <span>ثبت: {formatJalaliDate(r.submittedAt, publicConfig.businessTimezone)}</span>
                  <span>
                    {r.finalAmount !== null
                      ? formatMoney(r.finalAmount, r.currencyUnit)
                      : 'مبلغ نهایی ثبت نشده'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Workshop Introduced Insured Employees Summary */}
      {kind === 'workshop' && employees.length > 0 && (
        <Card className="p-5 space-y-3">
          <h2 className="text-base font-bold text-brand-navy flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-blue" aria-hidden="true" />
            <span>بیمه‌شدگان معرفی‌شده در این کارگاه ({toPersianDigits(employees.length)})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className="p-3 rounded-control border border-brand-border bg-brand-bg text-xs space-y-1"
              >
                <p className="font-bold text-brand-navy">{emp.fullName}</p>
                <p className="text-brand-muted">
                  کد ملی: <span className="ltr-code">{emp.maskedNationalId}</span>
                </p>
                <p className="text-brand-muted">
                  شماره بیمه:{' '}
                  <span className="ltr-code font-medium">
                    {toPersianDigits(emp.insuranceNumber)}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
