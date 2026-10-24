import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import {
  formatMoney,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUSES,
  REQUEST_TYPE_LABELS,
  type CurrencyUnit,
  type RequestStatus,
  type RequestType,
} from '@shared/domain';
import { formatMobileDisplay } from '@shared/iran-identifiers';
import {
  formatJalaliDate,
  formatJalaliPeriod,
  JALALI_MONTH_NAMES,
  toPersianDigits,
} from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { ApiError, apiRequest } from '../../lib/api';
import { INPUT_CLASS } from '../../components/ui/FormControls';
import {
  Card,
  EmptyState,
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

interface AdminRequestListItem {
  id: string;
  referenceCode: string;
  requestType: RequestType;
  jalaliYear: number;
  jalaliMonth: number;
  status: RequestStatus;
  awaitingCustomerInfo: boolean;
  cancellationDecision: string | null;
  finalAmount: number | null;
  currencyUnit: CurrencyUnit;
  hasNewEmployeeSubmission: boolean;
  submittedAt: string;
  lastActivityAt: string;
  customer: {
    id: string;
    fullName: string;
    mobile: string;
    maskedNationalId: string;
  };
  driver: {
    id: string;
    fullName: string;
    maskedNationalId: string;
  } | null;
  workshop: {
    id: string;
    workshopName: string;
    workshopCode: string;
  } | null;
}

interface AdminRequestsResponse {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  counters: {
    activeRequests: number;
    awaitingCustomerInfo: number;
    pendingCancellation: number;
  };
  items: AdminRequestListItem[];
}

export function AdminRequestsPage() {
  const { publicConfig } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const [qInput, setQInput] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [requestType, setRequestType] = useState(searchParams.get('requestType') ?? '');
  const [jalaliYear, setJalaliYear] = useState(searchParams.get('jalaliYear') ?? '');
  const [jalaliMonth, setJalaliMonth] = useState(searchParams.get('jalaliMonth') ?? '');
  const [awaitingInfoOnly, setAwaitingInfoOnly] = useState(
    searchParams.get('awaitingInfoOnly') === 'true',
  );
  const [incompleteOnly, setIncompleteOnly] = useState(
    searchParams.get('incompleteOnly') === 'true',
  );
  const [sort, setSort] = useState(searchParams.get('sort') ?? 'newest_created');
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get('page') ?? 1)));

  const [data, setData] = useState<AdminRequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (qInput.trim()) qs.set('q', qInput.trim());
      if (status) qs.set('status', status);
      if (requestType) qs.set('requestType', requestType);
      if (jalaliYear) qs.set('jalaliYear', jalaliYear);
      if (jalaliMonth) qs.set('jalaliMonth', jalaliMonth);
      if (awaitingInfoOnly) qs.set('awaitingInfoOnly', 'true');
      if (incompleteOnly) qs.set('incompleteOnly', 'true');
      qs.set('sort', sort);
      qs.set('page', String(page));
      qs.set('pageSize', '15');

      const res = await apiRequest<AdminRequestsResponse>(`/api/admin/requests?${qs.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت لیست درخواست‌ها.');
    } finally {
      setLoading(false);
    }
  }, [
    awaitingInfoOnly,
    incompleteOnly,
    jalaliMonth,
    jalaliYear,
    page,
    qInput,
    requestType,
    sort,
    status,
  ]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApplySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    const nextParams = new URLSearchParams();
    if (qInput.trim()) nextParams.set('q', qInput.trim());
    if (status) nextParams.set('status', status);
    if (requestType) nextParams.set('requestType', requestType);
    if (jalaliYear) nextParams.set('jalaliYear', jalaliYear);
    if (jalaliMonth) nextParams.set('jalaliMonth', jalaliMonth);
    if (awaitingInfoOnly) nextParams.set('awaitingInfoOnly', 'true');
    if (incompleteOnly) nextParams.set('incompleteOnly', 'true');
    setSearchParams(nextParams, { replace: true });
  };

  const handleResetFilters = () => {
    setQInput('');
    setStatus('');
    setRequestType('');
    setJalaliYear('');
    setJalaliMonth('');
    setAwaitingInfoOnly(false);
    setIncompleteOnly(false);
    setSort('newest_created');
    setPage(1);
    setSearchParams({}, { replace: true });
  };

  const baseYear = publicConfig.currentJalaliPeriod.jalaliYear;
  const yearChoices = [baseYear - 2, baseYear - 1, baseYear, baseYear + 1];

  return (
    <div className="space-y-6">
      <PageTitle
        title="فهرست یکپارچه درخواست‌های بیمه‌ای"
        subtitle="بررسی، جستجو و رسیدگی به درخواست‌های ماهانه رانندگان و کارگاه‌ها"
        documentTitle="پنل مدیریت دفتر"
        actions={
          <Link
            to="/admin/customers"
            className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-control text-xs sm:text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
          >
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>مدیریت مشتریان و افتتاح حساب</span>
          </Link>
        }
      />

      {/* Operational Action Queue Strips (No decorative charts) */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => {
              setIncompleteOnly(true);
              setAwaitingInfoOnly(false);
              setStatus('');
              setPage(1);
            }}
            className={`p-4 rounded-card border text-right transition-colors ${
              incompleteOnly
                ? 'bg-brand-navy text-white border-brand-navy'
                : 'bg-brand-surface border-brand-border hover:bg-brand-subtle/60'
            }`}
          >
            <span
              className={`text-xs block ${incompleteOnly ? 'text-white/80' : 'text-brand-muted'}`}
            >
              درخواست‌های باز (تکمیل‌نشده)
            </span>
            <span className="text-xl font-extrabold mt-0.5 block">
              {toPersianDigits(data.counters.activeRequests)} مورد
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAwaitingInfoOnly(true);
              setIncompleteOnly(false);
              setPage(1);
            }}
            className={`p-4 rounded-card border text-right transition-colors ${
              awaitingInfoOnly
                ? 'bg-brand-navy text-white border-brand-navy'
                : 'bg-brand-surface border-brand-border hover:bg-brand-subtle/60'
            }`}
          >
            <span
              className={`text-xs block ${awaitingInfoOnly ? 'text-white/80' : 'text-brand-muted'}`}
            >
              منتظر تکمیل اطلاعات مشتری
            </span>
            <span className="text-xl font-extrabold mt-0.5 block">
              {toPersianDigits(data.counters.awaitingCustomerInfo)} مورد
            </span>
          </button>

          <div className="p-4 rounded-card border border-brand-border bg-brand-surface">
            <span className="text-xs text-brand-muted block">درخواست‌های لغو در انتظار تصمیم</span>
            <span className="text-xl font-extrabold text-brand-navy mt-0.5 block">
              {toPersianDigits(data.counters.pendingCancellation)} مورد
            </span>
          </div>
        </div>
      )}

      {/* Search & Filters Form */}
      <Card className="p-5">
        <form onSubmit={handleApplySearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <label
                htmlFor="admin-q"
                className="block text-xs font-semibold text-brand-muted mb-1"
              >
                جستجو (نام/کد ملی مشتری، نام راننده، کد کارگاه، کد پیگیری)
              </label>
              <div className="relative">
                <input
                  id="admin-q"
                  type="search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="مثلاً: رضایی، 0412987654 یا HB-1405..."
                  className={`${INPUT_CLASS} pl-9`}
                />
                <Search
                  className="w-4 h-4 text-brand-muted absolute left-3 top-3.5 pointer-events-none"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div className="md:col-span-3">
              <label
                htmlFor="admin-status"
                className="block text-xs font-semibold text-brand-muted mb-1"
              >
                وضعیت درخواست
              </label>
              <select
                id="admin-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className={INPUT_CLASS}
              >
                <option value="">همه وضعیت‌ها</option>
                {REQUEST_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {REQUEST_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="admin-type"
                className="block text-xs font-semibold text-brand-muted mb-1"
              >
                نوع درخواست
              </label>
              <select
                id="admin-type"
                value={requestType}
                onChange={(e) => {
                  setRequestType(e.target.value);
                  setPage(1);
                }}
                className={INPUT_CLASS}
              >
                <option value="">همه انواع</option>
                <option value="driver">راننده</option>
                <option value="workshop">کارگاه</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="admin-sort"
                className="block text-xs font-semibold text-brand-muted mb-1"
              >
                مرتب‌سازی
              </label>
              <select
                id="admin-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className={INPUT_CLASS}
              >
                <option value="newest_created">جدیدترین ثبت</option>
                <option value="newest_activity">آخرین فعالیت</option>
                <option value="period_desc">دوره بیمه‌ای</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t border-brand-border">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label
                  htmlFor="admin-year"
                  className="block text-xs font-semibold text-brand-muted mb-1"
                >
                  سال شمسی
                </label>
                <select
                  id="admin-year"
                  value={jalaliYear}
                  onChange={(e) => {
                    setJalaliYear(e.target.value);
                    setPage(1);
                  }}
                  className={`${INPUT_CLASS} w-32`}
                >
                  <option value="">همه سال‌ها</option>
                  {yearChoices.map((y) => (
                    <option key={y} value={y}>
                      {toPersianDigits(y)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="admin-month"
                  className="block text-xs font-semibold text-brand-muted mb-1"
                >
                  ماه شمسی
                </label>
                <select
                  id="admin-month"
                  value={jalaliMonth}
                  onChange={(e) => {
                    setJalaliMonth(e.target.value);
                    setPage(1);
                  }}
                  className={`${INPUT_CLASS} w-36`}
                >
                  <option value="">همه ماه‌ها</option>
                  {JALALI_MONTH_NAMES.map((mName, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {mName}
                    </option>
                  ))}
                </select>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-brand-text pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={awaitingInfoOnly}
                  onChange={(e) => {
                    setAwaitingInfoOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="w-4 h-4 accent-brand-navy rounded"
                />
                <span>فقط منتظر اطلاعات مشتری</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-brand-text pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incompleteOnly}
                  onChange={(e) => {
                    setIncompleteOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="w-4 h-4 accent-brand-navy rounded"
                />
                <span>فقط تکمیل‌نشده‌ها</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <SecondaryButton
                type="button"
                onClick={handleResetFilters}
                icon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
              >
                پاک‌سازی فیلترها
              </SecondaryButton>
              <PrimaryButton type="submit" icon={<Filter className="w-4 h-4" aria-hidden="true" />}>
                اعمال فیلتر
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Card>

      {/* Results Area */}
      {loading ? (
        <LoadingState label="در حال جستجو در درخواست‌ها..." />
      ) : error || !data ? (
        <ErrorState message={error ?? 'خطا در دریافت داده‌ها.'} onRetry={fetchRequests} />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="درخواستی با این مشخصات یافت نشد"
          description="فیلترهای انتخابی یا عبارت جستجو را تغییر دهید."
          action={
            <SecondaryButton onClick={handleResetFilters}>نمایش همه درخواست‌ها</SecondaryButton>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-brand-subtle text-brand-navy border-b border-brand-border text-xs font-bold">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    کد پیگیری
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    مشتری
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    نوع و پرونده مرتبط
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    ماه بیمه‌ای
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    وضعیت
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    مبلغ نهایی
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    تاریخ ثبت
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-brand-subtle/40">
                    <td className="px-4 py-3.5">
                      <span className="ltr-code font-bold text-xs bg-brand-subtle px-2 py-1 rounded text-brand-navy">
                        {item.referenceCode}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        to={`/admin/customers/${item.customer.id}`}
                        className="font-semibold text-brand-navy hover:underline block"
                      >
                        {item.customer.fullName}
                      </Link>
                      <span className="text-xs text-brand-muted ltr-code">
                        {formatMobileDisplay(item.customer.mobile)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-brand-muted block">
                        {REQUEST_TYPE_LABELS[item.requestType]}
                      </span>
                      {item.driver ? (
                        <span className="font-medium text-brand-text">{item.driver.fullName}</span>
                      ) : item.workshop ? (
                        <span className="font-medium text-brand-text">
                          {item.workshop.workshopName}{' '}
                          <span className="text-xs text-brand-muted ltr-code">
                            ({toPersianDigits(item.workshop.workshopCode)})
                          </span>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-brand-navy">
                      {formatJalaliPeriod(item.jalaliYear, item.jalaliMonth)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={item.status} />
                        {item.awaitingCustomerInfo && (
                          <AwaitingInfoBadge primaryStatus={item.status} />
                        )}
                        {item.cancellationDecision === 'pending' && <CancellationPendingBadge />}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold">
                      {item.finalAmount !== null
                        ? formatMoney(item.finalAmount, item.currencyUnit)
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-brand-muted">
                      {formatJalaliDate(item.submittedAt, publicConfig.businessTimezone)}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        to={`/admin/requests/${item.id}`}
                        className="inline-flex items-center gap-1 min-h-[34px] px-3 py-1 rounded-control text-xs font-bold bg-brand-navy text-white hover:bg-brand-navy-dark"
                      >
                        <span>بررسی</span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / Tablet Compact Cards */}
          <div className="lg:hidden divide-y divide-brand-border">
            {data.items.map((item) => (
              <div key={item.id} className="p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="ltr-code font-bold text-xs bg-brand-subtle px-2 py-0.5 rounded text-brand-navy">
                    {item.referenceCode}
                  </span>
                  <span className="text-xs font-bold text-brand-navy">
                    دوره: {formatJalaliPeriod(item.jalaliYear, item.jalaliMonth)}
                  </span>
                </div>

                <div>
                  <p className="font-bold text-sm text-brand-navy">{item.customer.fullName}</p>
                  <p className="text-xs text-brand-muted">
                    {REQUEST_TYPE_LABELS[item.requestType]}:{' '}
                    {item.driver
                      ? item.driver.fullName
                      : `${item.workshop?.workshopName} (کد: ${toPersianDigits(item.workshop?.workshopCode ?? '')})`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={item.status} />
                  {item.awaitingCustomerInfo && <AwaitingInfoBadge primaryStatus={item.status} />}
                  {item.cancellationDecision === 'pending' && <CancellationPendingBadge />}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-brand-border text-xs">
                  <span className="text-brand-muted">
                    ثبت: {formatJalaliDate(item.submittedAt, publicConfig.businessTimezone)}
                  </span>
                  <Link
                    to={`/admin/requests/${item.id}`}
                    className="inline-flex items-center gap-1 font-bold text-brand-blue"
                  >
                    <span>مدیریت پرونده</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Bar */}
          <div className="px-4 py-3 bg-brand-subtle/50 border-t border-brand-border flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-brand-muted">
              مجموع نتایج: <strong>{toPersianDigits(data.totalCount)}</strong> درخواست · صفحه{' '}
              {toPersianDigits(data.page)} از {toPersianDigits(data.totalPages)}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1 rounded border border-brand-border bg-brand-surface disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
                <span>قبلی</span>
              </button>
              <button
                type="button"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1 rounded border border-brand-border bg-brand-surface disabled:opacity-40"
              >
                <span>بعدی</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
