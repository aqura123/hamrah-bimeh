import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Building2, LogOut, Menu, PlusCircle, Truck, X } from 'lucide-react';
import { toPersianDigits } from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { BrandLogo } from '../ui/Logo';

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, customer, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ unreadCount: number }>('/api/notifications')
      .then((res) => {
        if (active) setUnreadCount(res.unreadCount);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-brand-text">
      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-navy focus:text-white focus:rounded-control"
      >
        پرش به محتوای پرتال
      </a>

      <header className="sticky top-0 z-40 bg-brand-surface border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BrandLogo showTagline={false} to="/portal" compact />
            <span className="hidden sm:inline-block px-2.5 py-0.5 text-xs font-semibold rounded bg-brand-subtle text-brand-navy border border-brand-border">
              پرتال مشتری
            </span>
          </div>

          <nav aria-label="منوی پرتال مشتری" className="hidden lg:flex items-center gap-1">
            <Link
              to="/portal#drivers"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-control text-sm font-medium ${
                location.pathname === '/portal' && location.hash !== '#workshops'
                  ? 'bg-brand-subtle text-brand-navy font-bold'
                  : 'text-brand-text hover:bg-brand-subtle'
              }`}
            >
              <Truck className="w-4 h-4" aria-hidden="true" />
              <span>رانندگان من</span>
            </Link>

            <Link
              to="/portal#workshops"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-control text-sm font-medium ${
                location.pathname === '/portal' && location.hash === '#workshops'
                  ? 'bg-brand-subtle text-brand-navy font-bold'
                  : 'text-brand-text hover:bg-brand-subtle'
              }`}
            >
              <Building2 className="w-4 h-4" aria-hidden="true" />
              <span>کارگاه‌های من</span>
            </Link>

            <NavLink
              to="/portal/requests/new"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3.5 py-2 rounded-control text-sm font-semibold ${
                  isActive ? 'bg-brand-navy text-white' : 'text-brand-blue hover:bg-brand-subtle'
                }`
              }
            >
              <PlusCircle className="w-4 h-4" aria-hidden="true" />
              <span>ثبت درخواست جدید</span>
            </NavLink>

            <NavLink
              to="/portal/notifications"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 rounded-control text-sm font-medium ${
                  isActive
                    ? 'bg-brand-subtle text-brand-navy font-bold'
                    : 'text-brand-text hover:bg-brand-subtle'
                }`
              }
            >
              <Bell className="w-4 h-4" aria-hidden="true" />
              <span>اعلان‌ها</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-bold rounded-full bg-brand-navy text-white">
                  {toPersianDigits(unreadCount)}
                </span>
              )}
            </NavLink>
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <span className="text-xs text-brand-muted truncate max-w-[160px]">
              {customer?.fullName ?? user?.displayName}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-control text-xs font-semibold text-status-danger border border-brand-border hover:bg-status-danger-bg"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>خروج</span>
            </button>
          </div>

          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'بستن منو' : 'باز کردن منو'}
            onClick={() => setMobileOpen((p) => !p)}
            className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-control border border-brand-border text-brand-navy"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <nav
            aria-label="منوی موبایل پرتال"
            className="lg:hidden border-t border-brand-border bg-brand-surface px-4 py-3 space-y-1.5"
          >
            <Link
              to="/portal#drivers"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-control text-sm font-medium hover:bg-brand-subtle"
            >
              <Truck className="w-4 h-4" />
              <span>رانندگان من</span>
            </Link>
            <Link
              to="/portal#workshops"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-control text-sm font-medium hover:bg-brand-subtle"
            >
              <Building2 className="w-4 h-4" />
              <span>کارگاه‌های من</span>
            </Link>
            <Link
              to="/portal/requests/new"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-control text-sm font-semibold text-brand-blue hover:bg-brand-subtle"
            >
              <PlusCircle className="w-4 h-4" />
              <span>ثبت درخواست جدید</span>
            </Link>
            <Link
              to="/portal/notifications"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between min-h-[44px] px-3 py-2 rounded-control text-sm font-medium hover:bg-brand-subtle"
            >
              <span className="inline-flex items-center gap-2">
                <Bell className="w-4 h-4" />
                <span>اعلان‌ها</span>
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-brand-navy text-white">
                  {toPersianDigits(unreadCount)}
                </span>
              )}
            </Link>
            <div className="pt-2 border-t border-brand-border flex items-center justify-between">
              <span className="text-xs text-brand-muted">{customer?.fullName}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-control text-xs font-semibold text-status-danger bg-status-danger-bg"
              >
                <LogOut className="w-4 h-4" />
                <span>خروج از حساب</span>
              </button>
            </div>
          </nav>
        )}
      </header>

      <main id="portal-main" className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
