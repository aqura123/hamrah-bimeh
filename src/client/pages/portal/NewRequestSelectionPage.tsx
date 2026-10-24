import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, Truck } from 'lucide-react';
import { Breadcrumb, Card, PageTitle } from '../../components/ui/Primitives';

export function NewRequestSelectionPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Breadcrumb items={[{ label: 'پرتال من', to: '/portal' }, { label: 'ثبت درخواست جدید' }]} />

      <PageTitle
        title="ثبت درخواست جدید"
        subtitle="نوع خدمت بیمه‌ای مورد نظر خود را برای ثبت درخواست تک‌ماهه انتخاب نمایید"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 flex flex-col justify-between space-y-5 hover:border-brand-blue transition-colors">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-card bg-brand-subtle text-brand-navy flex items-center justify-center">
              <Truck className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-brand-navy">درخواست حق بیمه رانندگان</h2>
            <p className="text-sm text-brand-muted leading-relaxed">
              انتخاب یکی از رانندگان ذخیره‌شده یا معرفی راننده جدید، تعیین ماه بیمه‌ای در تقویم شمسی
              و ارسال توضیحات یا مدارک مرتبط اختیاری.
            </p>
          </div>
          <Link
            to="/portal/requests/new/driver"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
          >
            <span>شروع ثبت درخواست راننده</span>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </Link>
        </Card>

        <Card className="p-6 flex flex-col justify-between space-y-5 hover:border-brand-blue transition-colors">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-card bg-brand-subtle text-brand-navy flex items-center justify-center">
              <Building2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-brand-navy">درخواست لیست بیمه ماهانه کارگاه</h2>
            <p className="text-sm text-brand-muted leading-relaxed">
              انتخاب کارگاه قبلی بدون نیاز به ورود مجدد مشخصات ثابت، یا معرفی کارگاه جدید؛ به همراه
              گزینه اختیاری افزودن بیمه‌شده جدید.
            </p>
          </div>
          <Link
            to="/portal/requests/new/workshop"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
          >
            <span>شروع ثبت درخواست کارگاه</span>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </Link>
        </Card>
      </div>
    </div>
  );
}
