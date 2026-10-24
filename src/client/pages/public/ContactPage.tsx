import React, { useEffect } from 'react';
import { Clock, Info, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Alert, Breadcrumb, Card, PageTitle } from '../../components/ui/Primitives';
import { normalizeDigits } from '@shared/jalali';

export function ContactPage() {
  const { publicConfig } = useApp();
  const contact = publicConfig.officeContact;

  useEffect(() => {
    document.title = 'تماس با دفتر | همراه بیمه';
  }, []);

  const hasUnconfiguredPlaceholders = !contact.address || !contact.phone || !contact.workingHours;
  const phoneHref = contact.phone
    ? normalizeDigits(contact.phone).replace(/[^\d+]/g, '')
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <Breadcrumb items={[{ label: 'صفحه اصلی', to: '/' }, { label: 'تماس با دفتر' }]} />

      <PageTitle
        title="تماس با دفتر همراه بیمه"
        subtitle="راه‌های ارتباطی برای دریافت دسترسی، هماهنگی و پیگیری درخواست‌های خدماتی"
        documentTitle="تماس با دفتر"
      />

      {hasUnconfiguredPlaceholders && (
        <Alert variant="info" title="اطلاعات تماس قابل پیکربندی توسط مدیر سامانه">
          اطلاعات تماس واقعی دفتر باید پیش از راه‌اندازی نهایی از طریق متغیرهای محیطی سرور{' '}
          (<span className="ltr-code">PUBLIC_OFFICE_*</span>) تنظیم شوند.
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-brand-navy border-b border-brand-border pb-3">
            <ShieldCheck className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-lg font-bold">{contact.title}</h2>
          </div>

          <dl className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <dt className="font-bold text-brand-navy">نشانی دفتر:</dt>
                <dd className="text-brand-text mt-0.5">
                  {contact.address ?? (
                    <span className="inline-block px-2 py-0.5 rounded bg-brand-subtle text-brand-muted text-xs">
                      [جایگاه پیکربندی نشانی دفتر — تنظیم در PUBLIC_OFFICE_ADDRESS]
                    </span>
                  )}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <dt className="font-bold text-brand-navy">شماره تماس دفتر:</dt>
                <dd className="text-brand-text mt-0.5">
                  {contact.phone && phoneHref ? (
                    <a
                      href={`tel:${phoneHref}`}
                      className="ltr-code font-medium text-brand-blue hover:underline underline-offset-2"
                    >
                      {contact.phone}
                    </a>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded bg-brand-subtle text-brand-muted text-xs">
                      [جایگاه پیکربندی تلفن ثابت/همراه دفتر — تنظیم در PUBLIC_OFFICE_PHONE]
                    </span>
                  )}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <dt className="font-bold text-brand-navy">ساعات پاسخ‌گویی:</dt>
                <dd className="text-brand-text mt-0.5">
                  {contact.workingHours ?? (
                    <span className="inline-block px-2 py-0.5 rounded bg-brand-subtle text-brand-muted text-xs">
                      [جایگاه پیکربندی ساعات کاری دفتر — تنظیم در PUBLIC_OFFICE_WORKING_HOURS]
                    </span>
                  )}
                </dd>
              </div>
            </div>
          </dl>
        </Card>

        <Card className="p-6 flex flex-col justify-between bg-brand-subtle/40 space-y-4">
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-brand-navy">
              موقعیت مکانی و راهنمای مراجعه حضوری
            </h2>
            <div className="min-h-[180px] rounded-control border border-dashed border-brand-border bg-brand-surface p-5 flex flex-col items-center justify-center text-center">
              <MapPin className="w-8 h-8 text-brand-muted mb-2" aria-hidden="true" />
              {contact.mapNote ? (
                <p className="text-sm text-brand-text leading-relaxed">{contact.mapNote}</p>
              ) : (
                <p className="text-xs text-brand-muted leading-relaxed max-w-xs">
                  جایگاه پیکربندی نقشه و راهنمای مسیر دفتر (تنظیم از طریق متغیر{' '}
                  <span className="ltr-code">PUBLIC_OFFICE_MAP_NOTE</span> بدون درج مختصات فرضی).
                </p>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-control bg-brand-surface border border-brand-border text-xs text-brand-muted flex items-start gap-2">
            <Info className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              ثبت‌نام عمومی در سایت فعال نیست. برای دریافت نام کاربری (شماره همراه) و رمز ورود
              اولیه، با دفتر هماهنگ فرمایید.
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
