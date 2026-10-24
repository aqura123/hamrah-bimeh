import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  ExternalLink,
  Plus,
  Shield,
  Truck,
  User,
} from 'lucide-react';
import {
  formatMoney,
  PROFILE_REVIEW_LABELS,
  type CurrencyUnit,
  type ProfileReviewState,
  type RequestStatus,
} from '@shared/domain';
import { formatMobileDisplay } from '@shared/iran-identifiers';
import { formatJalaliDate, formatJalaliPeriod, toPersianDigits } from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { ApiError, apiRequest } from '../../lib/api';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
} from '../../components/ui/Primitives';
import { AwaitingInfoBadge, StatusBadge } from '../../components/ui/StatusBadge';

interface PortalRequestSummary {
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
}

interface PortalOverviewResponse {
  account: {
    fullName: string;
    mobile: string;
    maskedNationalId: string;
    phone: string | null;
  };
  unreadNotificationsCount: number;
  drivers: Array<{
    id: string;
    fullName: string;
    maskedNationalId: string;
    reviewState: ProfileReviewState;
    createdAt: string;
    requests: PortalRequestSummary[];
  }>;
  workshops: Array<{
    id: string;
    workshopName: string;
    workshopCode: string;
    contactFullName: string;
    maskedContactNationalId: string;
    reviewState: ProfileReviewState;
    employeesCount: number;
    createdAt: string;
    requests: PortalRequestSummary[];
  }>;
}

export function CustomerPortalPage() {
  const { publicConfig } = useApp();
  const location = useLocation();
  const [data, setData] = useState<PortalOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<PortalOverviewResponse>('/api/portal/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در بارگذاری پرونده‌های شما.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!loading && location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      target?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [loading, location.hash]);

  if (loading) return <LoadingState label="در حال بارگذاری پرونده رانندگان و کارگاه‌های شما..." />;
  if (error || !data) {
    return <ErrorState message={error ?? 'خطا در دریافت اطلاعات.'} onRetry={loadData} />;
  }

  return (
    <div className="space-y-10">
      <PageTitle
        title="پرتال اختصاصی من"
        subtitle="مشاهده پرونده رانندگان و کارگاه‌های ثبت‌شده، سابقه ماه‌به‌ماه و ثبت درخواست جدید"
        documentTitle="پرتال مشتری"
        actions={
          <Link
            to="/portal/requests/new"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark shadow-sm"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>ثبت درخواست جدید</span>
          </Link>
        }
      />

      {/* Read-Only Account Identity Strip (Managed exclusively by Office) */}
      <Card className="p-4 sm:p-5 bg-brand-subtle/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm">
            <span className="inline-flex items-center gap-1.5 font-bold text-brand-navy">
              <User className="w-4 h-4 text-brand-blue" aria-hidden="true" />
              <span>صاحب حساب: {data.account.fullName}</span>
            </span>
            <span className="text-brand-muted">
              شماره همراه:{' '}
              <strong className="text-brand-text ltr-code">
                {formatMobileDisplay(data.account.mobile)}
              </strong>
            </span>
            <span className="text-brand-muted">
              کد ملی:{' '}
              <strong className="text-brand-text ltr-code">{data.account.maskedNationalId}</strong>
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-brand-muted">
            <Shield className="w-3.5 h-3.5 text-brand-blue shrink-0" aria-hidden="true" />
            <span>مشخصات حساب کاربری توسط دفتر مدیریت می‌شود.</span>
          </span>
        </div>
      </Card>

      {/* SECTION 1: MY DRIVERS (رانندگان من) */}
      <section id="drivers" aria-labelledby="my-drivers-heading" className="space-y-4 scroll-mt-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-control bg-brand-navy text-white flex items-center justify-center">
              <Truck className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="my-drivers-heading" className="text-lg sm:text-xl font-bold text-brand-navy">
                رانندگان من ({toPersianDigits(data.drivers.length)})
              </h2>
              <p className="text-xs text-brand-muted">
                سابقه درخواست‌های ماهانه هر راننده از جدیدترین ماه به قدیمی‌ترین مرتب شده است.
              </p>
            </div>
          </div>

          <Link
            to="/portal/requests/new/driver"
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-control text-xs font-semibold bg-brand-surface border border-brand-border text-brand-navy hover:bg-brand-subtle"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>درخواست جدید راننده / افزودن راننده</span>
          </Link>
        </div>

        {data.drivers.length === 0 ? (
          <EmptyState
            icon={<Truck className="w-6 h-6" aria-hidden="true" />}
            title="هنوز راننده‌ای در حساب شما ثبت نشده است"
            description="می‌توانید هم‌زمان با ثبت اولین درخواست ماهانه حق بیمه رانندگان، مشخصات راننده خود را معرفی نمایید."
            action={
              <Link
                to="/portal/requests/new/driver?mode=new"
                className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>افزودن راننده و ثبت درخواست</span>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {data.drivers.map((drv) => (
              <Card
                key={drv.id}
                as="article"
                className="p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-brand-border">
                    <div>
                      <h3 className="text-base font-bold text-brand-navy">{drv.fullName}</h3>
                      <p className="text-xs text-brand-muted mt-0.5">
                        کد ملی: <span className="ltr-code font-medium">{drv.maskedNationalId}</span>{' '}
                        · {PROFILE_REVIEW_LABELS[drv.reviewState] ?? drv.reviewState}
                      </p>
                    </div>
                    <Link
                      to={`/portal/requests/new/driver?driverId=${drv.id}`}
                      className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-control text-xs font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>ثبت ماه جدید</span>
                    </Link>
                  </div>

                  {drv.requests.length === 0 ? (
                    <p className="text-xs text-brand-muted py-3">
                      هنوز درخواست ماهانه‌ای برای این راننده ثبت نشده است.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-brand-muted">
                        آخرین دوره‌های بیمه‌ای ثبت‌شده:
                      </p>
                      <ul className="divide-y divide-brand-border border border-brand-border rounded-control overflow-hidden">
                        {drv.requests.slice(0, 3).map((reqItem) => (
                          <li key={reqItem.id} className="bg-brand-bg/50 hover:bg-brand-subtle/60">
                            <Link
                              to={`/portal/requests/${reqItem.id}`}
                              className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="font-bold text-brand-navy flex items-center gap-1.5">
                                  <Calendar
                                    className="w-3.5 h-3.5 text-brand-blue"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    دوره بیمه:{' '}
                                    {formatJalaliPeriod(reqItem.jalaliYear, reqItem.jalaliMonth)}
                                  </span>
                                </div>
                                <div className="text-brand-muted">
                                  ثبت:{' '}
                                  {formatJalaliDate(
                                    reqItem.submittedAt,
                                    publicConfig.businessTimezone,
                                  )}{' '}
                                  · کد: <span className="ltr-code">{reqItem.referenceCode}</span>
                                  {reqItem.finalAmount !== null && (
                                    <>
                                      {' '}
                                      · مبلغ:{' '}
                                      <strong className="text-brand-text">
                                        {formatMoney(reqItem.finalAmount, reqItem.currencyUnit)}
                                      </strong>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <StatusBadge status={reqItem.status} />
                                {reqItem.awaitingCustomerInfo && (
                                  <AwaitingInfoBadge primaryStatus={reqItem.status} />
                                )}
                                <ExternalLink
                                  className="w-3.5 h-3.5 text-brand-muted"
                                  aria-hidden="true"
                                />
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-brand-muted">
                    مجموع درخواست‌ها: {toPersianDigits(drv.requests.length)} مورد
                  </span>
                  <Link
                    to={`/portal/drivers/${drv.id}`}
                    className="inline-flex items-center gap-1 font-bold text-brand-blue hover:text-brand-navy"
                  >
                    <span>مشاهده تمام سوابق ماهانه</span>
                    <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: MY WORKSHOPS (کارگاه‌های من) */}
      <section
        id="workshops"
        aria-labelledby="my-workshops-heading"
        className="space-y-4 pt-4 border-t border-brand-border scroll-mt-20"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-control bg-brand-blue text-white flex items-center justify-center">
              <Building2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="my-workshops-heading"
                className="text-lg sm:text-xl font-bold text-brand-navy"
              >
                کارگاه‌های من ({toPersianDigits(data.workshops.length)})
              </h2>
              <p className="text-xs text-brand-muted">
                مدیریت درخواست‌های لیست بیمه ماهانه کارگاه‌ها و معرفی بیمه‌شدگان جدید.
              </p>
            </div>
          </div>

          <Link
            to="/portal/requests/new/workshop"
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-control text-xs font-semibold bg-brand-surface border border-brand-border text-brand-navy hover:bg-brand-subtle"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>درخواست لیست کارگاه / افزودن کارگاه</span>
          </Link>
        </div>

        {data.workshops.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-6 h-6" aria-hidden="true" />}
            title="هنوز کارگاهی در حساب شما ثبت نشده است"
            description="برای ارسال اولین درخواست لیست بیمه ماهانه، کارگاه خود را معرفی کنید. مشخصات ثابت کارگاه برای ماه‌های بعد ذخیره خواهد شد."
            action={
              <Link
                to="/portal/requests/new/workshop?mode=new"
                className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>افزودن کارگاه و ثبت درخواست</span>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {data.workshops.map((ws) => (
              <Card
                key={ws.id}
                as="article"
                className="p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-brand-border">
                    <div>
                      <h3 className="text-base font-bold text-brand-navy">{ws.workshopName}</h3>
                      <p className="text-xs text-brand-muted mt-0.5">
                        کد کارگاه:{' '}
                        <span className="ltr-code font-semibold text-brand-text">
                          {toPersianDigits(ws.workshopCode)}
                        </span>{' '}
                        · رابط: {ws.contactFullName}
                      </p>
                    </div>
                    <Link
                      to={`/portal/requests/new/workshop?workshopId=${ws.id}`}
                      className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-control text-xs font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>ثبت لیست ماهانه</span>
                    </Link>
                  </div>

                  {ws.requests.length === 0 ? (
                    <p className="text-xs text-brand-muted py-3">
                      هنوز درخواست لیست ماهانه‌ای برای این کارگاه ثبت نشده است.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-brand-muted">
                        آخرین لیست‌های ماهانه ثبت‌شده:
                      </p>
                      <ul className="divide-y divide-brand-border border border-brand-border rounded-control overflow-hidden">
                        {ws.requests.slice(0, 3).map((reqItem) => (
                          <li key={reqItem.id} className="bg-brand-bg/50 hover:bg-brand-subtle/60">
                            <Link
                              to={`/portal/requests/${reqItem.id}`}
                              className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="font-bold text-brand-navy flex items-center gap-1.5">
                                  <Calendar
                                    className="w-3.5 h-3.5 text-brand-blue"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    دوره بیمه:{' '}
                                    {formatJalaliPeriod(reqItem.jalaliYear, reqItem.jalaliMonth)}
                                  </span>
                                </div>
                                <div className="text-brand-muted">
                                  ثبت:{' '}
                                  {formatJalaliDate(
                                    reqItem.submittedAt,
                                    publicConfig.businessTimezone,
                                  )}
                                  {reqItem.finalAmount !== null && (
                                    <>
                                      {' '}
                                      · مبلغ:{' '}
                                      <strong className="text-brand-text">
                                        {formatMoney(reqItem.finalAmount, reqItem.currencyUnit)}
                                      </strong>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <StatusBadge status={reqItem.status} />
                                {reqItem.awaitingCustomerInfo && (
                                  <AwaitingInfoBadge primaryStatus={reqItem.status} />
                                )}
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-brand-muted">
                    درخواست‌ها: {toPersianDigits(ws.requests.length)} مورد · بیمه‌شدگان معرفی‌شده:{' '}
                    {toPersianDigits(ws.employeesCount)} نفر
                  </span>
                  <Link
                    to={`/portal/workshops/${ws.id}`}
                    className="inline-flex items-center gap-1 font-bold text-brand-blue hover:text-brand-navy"
                  >
                    <span>مشاهده تمام سوابق کارگاه</span>
                    <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
