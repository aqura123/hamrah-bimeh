import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Building2, CheckSquare, FileUp, Truck } from 'lucide-react';
import { Alert, Breadcrumb, Card, PageTitle } from '../../components/ui/Primitives';
import { useApp } from '../../context/AppContext';
import { getServiceAction } from '../../lib/navigation';

export function GuidePage() {
  const { user } = useApp();
  const serviceAction = getServiceAction(user, '/portal/requests/new', 'ثبت درخواست جدید');

  useEffect(() => {
    document.title = 'راهنمای مدارک و فرآیند انجام کار | همراه بیمه';
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <Breadcrumb items={[{ label: 'صفحه اصلی', to: '/' }, { label: 'راهنمای مدارک و فرآیند' }]} />

      <PageTitle
        title="راهنمای مدارک و فرآیند ثبت درخواست"
        subtitle="تفکیک دقیق اطلاعات الزامی فرم‌ها از پیوست‌های اختیاری و راهنمای آماده‌سازی پیشنهادی دفتر"
        documentTitle="راهنمای مدارک و فرآیند انجام کار"
      />

      <Alert variant="info" title="توضیح درباره ماهیت این راهنما">
        موارد زیر صرفاً «راهنمای آماده‌سازی اطلاعات برای ثبت درخواست در دفتر همراه بیمه» است و به
        منزله بخشنامه یا الزام قانونی رسمی سازمان تأمین اجتماعی تلقی نمی‌شود. در صورت نیاز به مدرک
        تکمیلی خاص، مسئول دفتر در پرونده درخواست به شما اطلاع خواهد داد.
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Driver Guide */}
        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-brand-navy border-b border-brand-border pb-3">
            <Truck className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-lg font-bold">۱. درخواست حق بیمه رانندگان</h2>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-brand-navy flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-brand-blue" aria-hidden="true" />
              <span>اطلاعات اصلی فرم (الزامی در سامانه):</span>
            </h3>
            <ul className="list-disc pr-5 text-sm text-brand-text space-y-1">
              <li>انتخاب راننده قبلی یا ثبت نام و نام خانوادگی و کد ملی ۱۰ رقمی راننده جدید</li>
              <li>انتخاب دقیق یک سال و ماه شمسی برای دوره بیمه</li>
            </ul>
          </div>

          <div className="space-y-2 pt-2 border-t border-brand-border">
            <h3 className="text-sm font-bold text-brand-navy flex items-center gap-1.5">
              <FileUp className="w-4 h-4 text-brand-blue" aria-hidden="true" />
              <span>توضیحات و فایل‌های مرتبط (اختیاری):</span>
            </h3>
            <ul className="list-disc pr-5 text-sm text-brand-muted space-y-1">
              <li>یادداشت یا توضیح مشتری درباره وضعیت ماه مورد نظر</li>
              <li>
                پیوست فایل‌های کمکی مرتبط در قالب‌های مجاز نمایش‌داده‌شده هنگام بارگذاری (ارسال تصویر کارت ملی صرفاً
                به دلیل وجود فیلد کد ملی اجباری نیست)
              </li>
            </ul>
          </div>
        </Card>

        {/* Workshop Guide */}
        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-brand-navy border-b border-brand-border pb-3">
            <Building2 className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-lg font-bold">۲. درخواست لیست بیمه ماهانه کارگاه</h2>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-brand-navy flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-brand-blue" aria-hidden="true" />
              <span>اطلاعات اصلی فرم (الزامی در سامانه):</span>
            </h3>
            <ul className="list-disc pr-5 text-sm text-brand-text space-y-1">
              <li>
                انتخاب کارگاه ذخیره‌شده، یا برای کارگاه جدید: نام کارگاه، کد کارگاه، نام
                کارفرما/رابط بیمه و کد ملی رابط
              </li>
              <li>انتخاب یک ماه بیمه‌ای مشخص در تقویم شمسی</li>
              <li>
                در صورت نیاز، گزینه اختیاری «افزودن بیمه‌شده جدید» را انتخاب کنید: نام کامل، کد ملی و شماره
                بیمه بیمه‌شده
              </li>
            </ul>
          </div>

          <div className="space-y-2 pt-2 border-t border-brand-border">
            <h3 className="text-sm font-bold text-brand-navy flex items-center gap-1.5">
              <FileUp className="w-4 h-4 text-brand-blue" aria-hidden="true" />
              <span>توضیحات و فایل‌های مرتبط (اختیاری):</span>
            </h3>
            <ul className="list-disc pr-5 text-sm text-brand-muted space-y-1">
              <li>فایل تغییرات کارکرد ماهانه کارگران یا توضیحات مربوط به ترک‌کار/ورود نیرو</li>
              <li>تصاویر خوانای مدارک هویتی یا بیمه‌ای مربوط به بیمه‌شده جدید معرفی‌شده</li>
            </ul>
          </div>
        </Card>
      </div>

      {/* Office Preparation Guidance & Workflow */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2.5 text-brand-navy">
          <BookOpen className="w-5 h-5 text-brand-blue" aria-hidden="true" />
          <h2 className="text-lg font-bold">
            مراحل بررسی درخواست در دفتر
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs sm:text-sm">
          {[
            {
              title: 'ثبت‌شده / در حال بررسی دفتر',
              body: 'درخواست شما دریافت شده و مسئول دفتر اطلاعات و پیوست‌ها را بررسی می‌کند.',
            },
            {
              title: 'نیازمند تکمیل اطلاعات از طرف مشتری',
              body: 'در صورت کسری مدرک یا ابهام، دفتر مورد لازم را اعلام می‌کند و هم‌زمان می‌تواند بخش‌های دیگر کار را ادامه دهد.',
            },
            {
              title: 'در حال انجام و انجام‌شده',
              body: 'پس از تکمیل اقدامات دستی دفتر، مبلغ نهایی خدمات و فایل‌های خروجی در پرونده قرار می‌گیرد.',
            },
          ].map((s) => (
            <div
              key={s.title}
              className="p-4 rounded-control bg-brand-subtle/60 border border-brand-border"
            >
              <h3 className="font-bold text-brand-navy mb-1">{s.title}</h3>
              <p className="text-brand-muted leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="pt-2 flex flex-wrap gap-3">
          <Link
            to={serviceAction.to}
            className="inline-flex items-center justify-center min-h-[42px] px-5 py-2 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
          >
            {serviceAction.label}
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center justify-center min-h-[42px] px-4 py-2 rounded-control text-sm font-medium bg-brand-surface border border-brand-border text-brand-text hover:bg-brand-subtle"
          >
            تماس با دفتر برای افتتاح حساب مشتری
          </Link>
        </div>
      </Card>
    </div>
  );
}
