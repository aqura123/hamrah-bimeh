import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  Lock,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Primitives';
import { getAccountAction, getServiceAction } from '../../lib/navigation';
import { normalizeDigits } from '@shared/jalali';

export function HomePage() {
  const { publicConfig, user } = useApp();

  useEffect(() => {
    document.title = 'همراه بیمه | خدمات بیمه‌ای، ساده‌تر و مطمئن‌تر';
  }, []);

  const primaryAction =
    user?.role === 'customer'
      ? getServiceAction(user, '/portal/requests/new', 'ثبت و پیگیری درخواست')
      : getAccountAction(user);
  const driverAction = getServiceAction(user, '/portal/requests/new/driver', 'ثبت درخواست راننده');
  const workshopAction = getServiceAction(
    user,
    '/portal/requests/new/workshop',
    'ثبت درخواست کارگاه',
  );
  const officePhone = publicConfig.officeContact.phone;
  const officePhoneHref = officePhone
    ? normalizeDigits(officePhone).replace(/[^\d+]/g, '')
    : null;

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-brand-navy text-white border-b border-brand-navy-dark">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-10 items-center">
          <div className="max-w-3xl space-y-6">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-brand-turquoise border border-white/15">
              <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>سامانه ثبت و پیگیری درخواست‌های خدمات بیمه‌ای دفتر</span>
            </span>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight">
              خدمات بیمه‌ای، ساده‌تر و مطمئن‌تر
            </h1>

            <p className="text-base sm:text-lg text-white/85 leading-relaxed">
              در حساب «همراه بیمه» درخواست‌های ماهانه مربوط به بیمه رانندگان و لیست بیمه کارگاه‌ها
              را ثبت می‌کنید، مدارک مرتبط را از مسیر خصوصی می‌فرستید و وضعیت رسیدگی دفتر را پیگیری
              می‌کنید. بررسی و انجام امور در سامانه تأمین اجتماعی توسط دفتر و به‌صورت دستی انجام
              می‌شود؛ این سایت درگاه پرداخت بیمه یا سامانه متصل به تأمین اجتماعی نیست.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to={primaryAction.to}
                className="inline-flex items-center gap-2 min-h-[48px] px-6 py-3 rounded-control font-bold text-sm bg-brand-turquoise text-brand-navy-dark hover:opacity-95 transition-opacity"
              >
                <span>{primaryAction.label}</span>
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to="/guide"
                className="inline-flex items-center gap-2 min-h-[48px] px-5 py-3 rounded-control font-semibold text-sm bg-white/10 text-white border border-white/25 hover:bg-white/20 transition-colors"
              >
                <span>مشاهده راهنمای مدارک و فرآیند</span>
              </Link>
            </div>
          </div>

          <aside
            aria-label="امکانات حساب کاربری همراه بیمه"
            className="w-full max-w-xl justify-self-center lg:justify-self-end"
          >
            <div className="rounded-card border border-white/15 bg-white/[0.06] p-6 sm:p-7 shadow-elevated">
              <div className="flex items-start gap-3.5 mb-6">
                <span className="w-12 h-12 rounded-card bg-brand-turquoise/15 text-brand-turquoise flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-white">همه درخواست‌ها، یک‌جا و منظم</h2>
                  <p className="text-sm text-white/75 mt-1 leading-relaxed">
                    از ثبت درخواست تا دریافت فایل‌های نهایی، مسیر کار در حساب شما ثبت می‌شود.
                  </p>
                </div>
              </div>

              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-turquoise shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-white">پرونده‌های جداگانه راننده و کارگاه</p>
                    <p className="text-xs sm:text-sm text-white/70 mt-0.5">مشخصات ثابت و سابقه ماهانه هر پرونده حفظ می‌شود.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-turquoise shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-white">پیام‌ها و تکمیل مدارک در همان درخواست</p>
                    <p className="text-xs sm:text-sm text-white/70 mt-0.5">توضیحات مشتری و دفتر همراه با زمان ثبت نگهداری می‌شود.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-turquoise shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-white">مشاهده مبلغ نهایی و دریافت فایل</p>
                    <p className="text-xs sm:text-sm text-white/70 mt-0.5">اطلاعات پس از ثبت و تأیید اقدام از سوی دفتر نمایش داده می‌شود.</p>
                  </div>
                </li>
              </ul>

              <div className="mt-6 pt-4 border-t border-white/15 flex items-center gap-2 text-xs text-white/75">
                <Lock className="w-4 h-4 text-brand-turquoise shrink-0" aria-hidden="true" />
                <span>پرداخت آنلاین و اتصال خودکار به سامانه تأمین اجتماعی در نسخه اول وجود ندارد.</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Two Primary Service Cards */}
      <section aria-labelledby="services-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="mb-8">
          <h2 id="services-heading" className="text-2xl font-bold text-brand-navy">
            خدمات اصلی دفتر همراه بیمه
          </h2>
          <p className="text-sm text-brand-muted mt-1.5">
            هر درخواست برای یک ماه بیمه‌ای مشخص ثبت می‌شود و سابقه هر راننده یا کارگاه به‌صورت
            جداگانه و مرتب نگهداری می‌گردد.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card as="article" className="p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-card bg-brand-subtle text-brand-navy flex items-center justify-center">
                <Truck className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-brand-navy">خدمات رانندگان</h3>
              <p className="text-sm text-brand-text leading-relaxed">
                ثبت درخواست ماهانه رسیدگی به امور حق بیمه رانندگان، نگهداری پرونده یک یا چند راننده
                زیرمجموعه حساب شما، بارگذاری مدارک مرتبط اختیاری و دریافت فایل خروجی پس از انجام کار
                توسط دفتر.
              </p>
              <ul className="space-y-2 text-xs sm:text-sm text-brand-muted pt-1">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0" aria-hidden="true" />
                  <span>امکان انتخاب راننده ذخیره‌شده بدون ورود مجدد مشخصات ثابت</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0" aria-hidden="true" />
                  <span>مشاهده سابقه ماه‌به‌ماه هر راننده از جدیدترین دوره</span>
                </li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-brand-border flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/drivers"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-blue hover:text-brand-navy"
              >
                <span>آشنایی با خدمات رانندگان</span>
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to={driverAction.to}
                className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-control text-xs font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
              >
                {driverAction.label}
              </Link>
            </div>
          </Card>

          <Card as="article" className="p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-card bg-brand-subtle text-brand-navy flex items-center justify-center">
                <Building2 className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-brand-navy">خدمات کارفرمایان و کارگاه‌ها</h3>
              <p className="text-sm text-brand-text leading-relaxed">
                ثبت درخواست ماهانه تهیه و ارسال لیست بیمه کارگاه‌ها، مدیریت هم‌زمان چند کارگاه در یک
                حساب کاربری، و امکان اختیاری معرفی بیمه‌شده جدید به همراه مدارک مرتبط در همان
                درخواست ماهانه.
              </p>
              <ul className="space-y-2 text-xs sm:text-sm text-brand-muted pt-1">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0" aria-hidden="true" />
                  <span>نگهداری مشخصات ثابت کارگاه برای ماه‌های بعد</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0" aria-hidden="true" />
                  <span>گفت‌وگو با مسئول دفتر و دریافت فایل‌های خروجی ثبت‌شده</span>
                </li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-brand-border flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/employers"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-blue hover:text-brand-navy"
              >
                <span>آشنایی با خدمات کارگاه‌ها</span>
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to={workshopAction.to}
                className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-control text-xs font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
              >
                {workshopAction.label}
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section
        aria-labelledby="how-it-works-heading"
        className="bg-brand-surface border-y border-brand-border py-14"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-8">
            <h2 id="how-it-works-heading" className="text-2xl font-bold text-brand-navy">
              روند انجام کار چگونه است؟
            </h2>
            <p className="text-sm text-brand-muted mt-1">
              چهار گام شفاف از ثبت درخواست تا دریافت مدارک خروجی دفتر:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                step: '۱',
                icon: <UserCheck className="w-5 h-5" aria-hidden="true" />,
                title: 'ورود به حساب اختصاصی',
                desc: 'با شماره همراه و رمز عبور دریافتی از دفتر وارد پرتال اختصاصی خود شوید.',
              },
              {
                step: '۲',
                icon: <ClipboardCheck className="w-5 h-5" aria-hidden="true" />,
                title: 'ثبت درخواست و مدارک',
                desc: 'راننده یا کارگاه و ماه بیمه‌ای مدنظر را انتخاب کرده و توضیحات یا پیوست‌ها را بفرستید.',
              },
              {
                step: '۳',
                icon: <ShieldCheck className="w-5 h-5" aria-hidden="true" />,
                title: 'بررسی و اقدام توسط دفتر',
                desc: 'مسئول دفتر اطلاعات را بررسی می‌کند و اقدامات اجرایی را به‌صورت دستی پیگیری می‌کند.',
              },
              {
                step: '۴',
                icon: <FileDown className="w-5 h-5" aria-hidden="true" />,
                title: 'مشاهده وضعیت و دانلود خروجی',
                desc: 'وضعیت نهایی، مبلغ اعلامی دفتر و فایل‌های خروجی مجاز را در پرونده درخواست دریافت کنید.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="p-5 rounded-card border border-brand-border bg-brand-bg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-control bg-brand-navy text-white flex items-center justify-center font-bold text-sm">
                    {item.step}
                  </span>
                  <span className="text-brand-blue">{item.icon}</span>
                </div>
                <h3 className="font-bold text-base text-brand-navy">{item.title}</h3>
                <p className="text-xs sm:text-sm text-brand-muted leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust, Scope & Privacy Note + Contact Preview */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2.5 text-brand-navy">
            <Lock className="w-5 h-5 text-brand-blue shrink-0" aria-hidden="true" />
            <h2 className="text-lg font-bold">شفافیت خدماتی و حفاظت از اطلاعات شما</h2>
          </div>
          <p className="text-sm text-brand-text leading-relaxed">
            درخواست‌ها، پیام‌ها و فایل‌های بارگذاری‌شده فقط در حساب مشتری مربوط و برای مدیر دفتر
            قابل مشاهده‌اند. این سامانه یک پرتال مدیریت درخواست‌های خدماتی دفتر بوده و به سامانه‌های
            دولتی یا درگاه <span className="ltr-code">es.tamin.ir</span> متصل نیست.
          </p>
          <p className="text-xs sm:text-sm text-brand-muted leading-relaxed">
            دفتر همراه بیمه مرجع صدور رأی یا تضمین تصمیم‌های سازمان تأمین اجتماعی نیست و عملیات ثبت
            و پیگیری را به‌صورت دستی خارج از این سامانه انجام می‌دهد. همچنین در این نسخه پرداخت
            آنلاین وجود ندارد و مبلغ نهایی خدمات پس از انجام کار توسط دفتر در پرونده ثبت می‌شود.
          </p>
        </Card>

        <Card className="p-6 sm:p-8 flex flex-col justify-between space-y-4 bg-brand-subtle/50">
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-brand-navy">ارتباط با دفتر همراه بیمه</h2>
            <p className="text-xs sm:text-sm text-brand-muted leading-relaxed">
              ایجاد حساب کاربری جدید برای مشتریان و هماهنگی‌های حضوری یا تلفنی از طریق دفتر انجام
              می‌شود:
            </p>
            <div className="space-y-2 text-xs sm:text-sm text-brand-text">
              <div className="flex items-start gap-2">
                <Phone className="w-4 h-4 text-brand-blue shrink-0 mt-1" aria-hidden="true" />
                <span>
                  تلفن دفتر:{' '}
                  {officePhone && officePhoneHref ? (
                    <a
                      href={`tel:${officePhoneHref}`}
                      className="ltr-code font-medium text-brand-blue hover:underline underline-offset-2"
                    >
                      {officePhone}
                    </a>
                  ) : (
                    'پس از تنظیم اطلاعات تماس دفتر نمایش داده می‌شود'
                  )}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-brand-blue shrink-0 mt-1" aria-hidden="true" />
                <span>
                  نشانی:{' '}
                  {publicConfig.officeContact.address ?? 'مطابق اطلاعات تماس پیکربندی‌شده دفتر'}
                </span>
              </div>
            </div>
          </div>

          <Link
            to="/contact"
            className="inline-flex items-center justify-center min-h-[42px] px-4 py-2 rounded-control text-xs font-semibold bg-brand-surface text-brand-navy border border-brand-border hover:bg-brand-surface/80"
          >
            مشاهده صفحه تماس با دفتر
          </Link>
        </Card>
      </section>
    </div>
  );
}
