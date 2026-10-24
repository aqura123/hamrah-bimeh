import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle2, FileText, Info, Truck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Alert, Breadcrumb, Card, PageTitle } from '../../components/ui/Primitives';
import { getServiceAction } from '../../lib/navigation';

export function DriversServicePage() {
  const { user } = useApp();
  const serviceAction = getServiceAction(user, '/portal/requests/new/driver', 'ثبت درخواست راننده');

  useEffect(() => {
    document.title = 'خدمات بیمه‌ای رانندگان | همراه بیمه';
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <Breadcrumb items={[{ label: 'صفحه اصلی', to: '/' }, { label: 'خدمات رانندگان' }]} />

      <PageTitle
        title="خدمات بیمه‌ای رانندگان"
        subtitle="ثبت منظم درخواست ماهانه رسیدگی به امور حق بیمه رانندگان و پیگیری شفاف وضعیت انجام کار در پرتال اختصاصی"
        documentTitle="خدمات بیمه‌ای رانندگان"
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
            <Truck className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-lg font-bold">نحوه ثبت درخواست ماهانه رانندگان</h2>
          </div>
          <p className="text-sm text-brand-text leading-relaxed">
            در حساب کاربری همراه بیمه، هر مشتری می‌تواند مشخصات یک یا چند راننده را در بخش «رانندگان
            من» نگهداری کند. در هر بار ثبت درخواست، کافی است راننده مورد نظر را انتخاب کنید یا در
            صورت جدید بودن، نام و نام خانوادگی و کد ملی ۱۰ رقمی او را ثبت نمایید.
          </p>
          <ul className="space-y-2.5 text-sm text-brand-muted">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0 mt-1" aria-hidden="true" />
              <span>هر درخواست دقیقاً مربوط به یک ماه شمسی مشخص است.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0 mt-1" aria-hidden="true" />
              <span>
                برای رانندگان قبلی نیازی به ورود دوباره اطلاعات هویتی ثابت در ماه‌های بعد نیست.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0 mt-1" aria-hidden="true" />
              <span>
                سابقه ماه‌به‌ماه هر راننده از جدیدترین دوره تا دوره‌های قبل قابل مشاهده است.
              </span>
            </li>
          </ul>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-brand-navy">
            <FileText className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-lg font-bold">اطلاعات لازم و فایل‌های اختیاری</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <h3 className="font-bold text-brand-navy mb-1">اطلاعات اصلی فرم درخواست:</h3>
              <ul className="list-disc pr-5 space-y-1 text-brand-text">
                <li>انتخاب راننده ذخیره‌شده یا معرفی راننده جدید (نام کامل و کد ملی ۱۰ رقمی)</li>
                <li>انتخاب سال و ماه بیمه‌ای مورد نظر در تقویم شمسی</li>
                <li>توضیحات تکمیلی برای مسئول دفتر (اختیاری)</li>
              </ul>
            </div>
            <div className="pt-2 border-t border-brand-border">
              <h3 className="font-bold text-brand-navy mb-1">مدارک و پیوست‌های مرتبط (اختیاری):</h3>
              <p className="text-brand-muted leading-relaxed">
                ارسال تصویر کارت ملی یا سایر مستندات اجباری نیست؛ تنها در صورتی که تصویر برگه، فیش
                یا مدرک مرتبطی برای اطلاع دفتر دارید می‌توانید آن را در یکی از قالب‌های مجازِ نمایش‌داده‌شده هنگام بارگذاری
                پیوست کنید.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2.5 text-brand-navy">
          <Calendar className="w-5 h-5 text-brand-blue" aria-hidden="true" />
          <h2 className="text-lg font-bold">پیگیری وضعیت، پیام‌ها و دریافت خروجی</h2>
        </div>
        <p className="text-sm text-brand-text leading-relaxed">
          پس از ثبت درخواست، کد پیگیری اختصاصی به شما نمایش داده می‌شود. مسئول دفتر درخواست را
          بررسی کرده و در صورت نیاز به توضیح بیشتر، بدون توقف غیرضروری روند کار، پیام خود را در همان
          پرونده ثبت می‌کند. پس از اتمام اقدام دفتر، وضعیت به «انجام‌شده» تغییر یافته و مبلغ نهایی
          خدمات و فایل‌های خروجی در صفحه درخواست قابل مشاهده و دانلود خواهد بود.
        </p>
      </Card>

      <Alert variant="info" title="توجه مهم درباره حدود خدمات دفتر">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5 hidden" aria-hidden="true" />
          <p>
            دفتر همراه بیمه صرفاً ارائه‌دهنده خدمات اداری و هماهنگی دستی ثبت درخواست‌ها است و
            هیچ‌گونه تضمینی بابت تأیید رسمی، سوابق بیمه‌ای یا تصمیم‌های سازمان تأمین اجتماعی ارائه
            نمی‌دهد.
          </p>
        </div>
      </Alert>
    </div>
  );
}
