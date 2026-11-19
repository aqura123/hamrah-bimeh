import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogIn, Menu, ShieldCheck, UserCheck, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BrandLogo } from '../ui/Logo';

const PUBLIC_NAV_ITEMS = [
  { to: '/', label: 'صفحه اصلی', end: true },
  { to: '/drivers', label: 'خدمات رانندگان', end: false },
  { to: '/employers', label: 'خدمات کارفرمایان', end: false },
  { to: '/guide', label: 'راهنمای مدارک و فرآیند', end: false },
  { to: '/contact', label: 'تماس با دفتر', end: false },
];

export function SiteHeader() {
  const { user } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const portalDestination = user?.forcePasswordChange
    ? '/change-password'
    : user?.role === 'office_admin'
      ? '/admin'
      : '/portal';

  return (
    <header className="sticky top-0 z-40 bg-brand-surface/95 backdrop-blur border-b border-brand-border">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-navy focus:text-white focus:rounded-control"
      >
        پرش به محتوای اصلی
      </a>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
        <BrandLogo />

        {/* Desktop Nav */}
        <nav aria-label="منوی اصلی سایت" className="hidden lg:flex items-center gap-1">
          {PUBLIC_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3.5 py-2 rounded-control text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-subtle text-brand-navy font-bold'
                    : 'text-brand-text hover:bg-brand-subtle/70 hover:text-brand-navy'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-2">
          {user ? (
            <Link
              to={portalDestination}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark transition-colors"
            >
              <UserCheck className="w-4 h-4" aria-hidden="true" />
              <span>{user.role === 'office_admin' ? 'ورود به پنل دفتر' : 'ورود به پرتال من'}</span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 rounded-control text-sm font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark transition-colors"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>ورود به حساب</span>
            </Link>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-site-menu"
          aria-label={mobileMenuOpen ? 'بستن منو' : 'باز کردن منو'}
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-control border border-brand-border text-brand-navy hover:bg-brand-subtle"
        >
          {mobileMenuOpen ? (
            <X className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Menu className="w-5 h-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileMenuOpen && (
        <nav
          id="mobile-site-menu"
          aria-label="منوی موبایل"
          className="lg:hidden border-t border-brand-border bg-brand-surface px-4 py-4 space-y-1.5"
        >
          {PUBLIC_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `block min-h-[44px] px-4 py-2.5 rounded-control text-sm font-medium ${
                  isActive
                    ? 'bg-brand-subtle text-brand-navy font-bold'
                    : 'text-brand-text hover:bg-brand-subtle'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <div className="pt-2 border-t border-brand-border">
            <Link
              to={user ? portalDestination : '/login'}
              onClick={() => setMobileMenuOpen(false)}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-control text-sm font-semibold bg-brand-navy text-white"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>
                {user
                  ? user.role === 'office_admin'
                    ? 'ورود به پنل دفتر'
                    : 'ورود به پرتال من'
                  : 'ورود به حساب کاربری'}
              </span>
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-brand-navy text-white mt-16 border-t border-brand-navy-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-brand-turquoise shrink-0" aria-hidden="true" />
              <span className="text-lg font-bold">همراه بیمه</span>
            </div>
            <p className="text-sm text-white/80 leading-relaxed">
              «خدمات بیمه‌ای، ساده‌تر و مطمئن‌تر» — سامانه اختصاصی ثبت، هماهنگی و پیگیری درخواست‌های
              حق بیمه رانندگان و لیست بیمه ماهانه کارگاه‌ها برای مشتریان دفتر.
            </p>
          </div>

          <div className="space-y-2.5">
            <h2 className="text-sm font-bold text-brand-turquoise">دسترسی سریع</h2>
            <ul className="space-y-2 text-sm text-white/85">
              <li>
                <Link to="/drivers" className="hover:text-white hover:underline">
                  خدمات بیمه‌ای رانندگان
                </Link>
              </li>
              <li>
                <Link to="/employers" className="hover:text-white hover:underline">
                  خدمات کارفرمایان و کارگاه‌ها
                </Link>
              </li>
              <li>
                <Link to="/guide" className="hover:text-white hover:underline">
                  راهنمای مدارک و فرآیند انجام کار
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white hover:underline">
                  اطلاعات تماس با دفتر
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-white hover:underline">
                  ورود مشتریان و پرسنل دفتر
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h2 className="text-sm font-bold text-brand-turquoise">شفافیت فعالیت و حریم خصوصی</h2>
            <p className="text-xs text-white/80 leading-relaxed">
              این وب‌سایت یک پرتال مدیریت درخواست‌های خدماتی دفتر است؛ مرجع رسمی تصمیم‌گیری بیمه‌ای
              محسوب نمی‌شود، درگاه پرداخت آنلاین ندارد و هیچ‌گونه اتصال مستقیم یا وابستگی سازمانی به
              سازمان تأمین اجتماعی یا سامانه es.tamin.ir ندارد. درخواست‌ها توسط دفتر به‌صورت دستی
              پیگیری می‌شوند.
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-white/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/70">
          <p>کلیه حقوق برای دفتر خدمات بیمه‌ای همراه بیمه محفوظ است.</p>
          <p>حساب کاربری مشتریان صرفاً توسط دفتر ایجاد و مدیریت می‌شود.</p>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-brand-text">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
