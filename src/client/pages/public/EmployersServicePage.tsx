import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, CheckCircle2, ShieldAlert, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Alert, Breadcrumb, Card, PageTitle } from '../../components/ui/Primitives';
import { getServiceAction } from '../../lib/navigation';

export function EmployersServicePage() {
  const { user } = useApp();
  const serviceAction = getServiceAction(user, '/portal/requests/new/workshop', 'ثبت درخواست کارگاه');

  useEffect(() => {
    document.title = 'خدمات کارفرمایان و کارگاه‌ها | همراه بیمه';
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <Breadcrumb
        items={[{ label: 'صفحه اصلی', to: '/' }, { label: 'خدمات کارفرمایان و کارگاه‌ها' }]}
      />

      <PageTitle
        title="خدمات کارفرمایان و کارگاه‌ها"
        subtitle="ثبت درخواست ماهانه لیست بیمه کارگاه، نگهداری پرونده چندین کارگاه و معرفی اختیاری بیمه‌شده جدید"
        documentTitle="خدمات کارفرمایان و کارگاه‌ها"
        actions={
          <Link
            to={serviceAction.to}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
          >
            <span>{serviceAction.label}</span>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-brand-navy">
            <Building2 className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-lg font-bold">درخواست لیست بیمه ماهانه کارگاه</h2>
          </div>
          <p className="text-sm text-brand-text leading-relaxed">
            کارفرمایان و نمایندگان بیمه کارگاه‌ها می‌توانند یک یا چند کارگاه را در حساب کاربری خود
            داشته باشند. هنگام معرفی کارگاه جدید، نام کارگاه، کد کارگاه، نام کارفرما یا رابط بیمه و
            کد ملی رابط یک‌بار ثبت می‌شود و در ماه‌های بعد نیازی به ورود مجدد این مشخصات ثابت نخواهد
            بود.
          </p>
          <ul className="space-y-2 text-sm text-brand-muted">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0 mt-1" aria-hidden="true" />
              <span>ثبت جداگانه هر ماه بیمه‌ای (تک‌ماهه) با تاریخچه کامل و مرتب</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0 mt-1" aria-hidden="true" />
              <span>امکان ارسال فایل‌های کمکی (مانند لیست حضور و غیاب یا تغییرات ماهانه)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0 mt-1" aria-hidden="true" />
              <span>دریافت فایل‌های خروجی ثبت‌شده توسط دفتر در همان پرونده درخواست</span>
            </li>
          </ul>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-brand-navy">
            <UserPlus className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-lg font-bold">معرفی بیمه‌شده جدید در درخواست ماهانه (اختیاری)</h2>
          </div>
          <p className="text-sm text-brand-text leading-relaxed">
            چنانچه در ماه مورد نظر نیروی جدیدی به کارگاه اضافه شده باشد، می‌توانید هنگام ثبت درخواست
            لیست ماهانه گزینه «افزودن بیمه‌شده جدید به کارگاه» را فعال نمایید و مشخصات زیر را ثبت
            کنید:
          </p>
          <ul className="list-disc pr-5 space-y-1.5 text-sm text-brand-text">
            <li>نام و نام خانوادگی بیمه‌شده جدید</li>
            <li>کد ملی ۱۰ رقمی معتبر</li>
            <li>شماره بیمه تأمین اجتماعی بیمه‌شده</li>
            <li>بارگذاری مدارک مرتبط بیمه‌شده جدید (در صورت نیاز)</li>
          </ul>
          <p className="text-xs text-brand-muted leading-relaxed pt-1">
            در ماه‌هایی که نیروی جدیدی ندارید، این بخش کاملاً اختیاری است و نیازی به تکمیل آن نیست.
          </p>
        </Card>
      </div>

      <Alert variant="warning" title="هشدار امنیتی: رمز عبور سامانه تأمین اجتماعی را ارسال نکنید">
        <div className="flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 hidden" aria-hidden="true" />
          <p>
            وب‌سایت همراه بیمه به‌هیچ‌وجه رمز عبور ورود به سامانه{' '}
            <span className="ltr-code">es.tamin.ir</span> را درخواست، دریافت یا ذخیره نمی‌کند و به
            آن سامانه متصل نیست. لطفاً از نوشتن هرگونه رمز عبور در بخش توضیحات یا پیام‌ها خودداری
            فرمایید.
          </p>
        </div>
      </Alert>
    </div>
  );
}
