import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ClipboardList, History, LogOut, Menu, Users, X } from 'lucide-react';
import { toPersianDigits } from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { BrandLogo } from '../ui/Logo';

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useApp();
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

  const navItems = [
    {
      to: '/admin',
      label: 'همه درخواست‌ها',
      icon: <ClipboardList className="w-4 h-4" />,
      end: true,
    },
    {
      to: '/admin/customers',
      label: 'مشتریان و پرونده‌ها',
      icon: <Users className="w-4 h-4" />,
      end: false,
    },
    {
      to: '/admin/notifications',
      label: 'اعلان‌های دفتر',
      icon: <Bell className="w-4 h-4" />,
      end: false,
      badge: unreadCount,
    },
    {
      to: '/admin/audit',
      label: 'گزارش رویدادها',
      icon: <History className="w-4 h-4" />,
      end: false,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-brand-text">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-navy focus:text-white focus:rounded-control"
      >
        پرش به محتوای پنل مدیریت
      </a>

      <header className="sticky top-0 z-40 bg-brand-navy text-white border-b border-brand-navy-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-control px-2.5 py-1">
              <BrandLogo showTagline={false} to="/admin" compact />
            </div>
            <span className="hidden sm:inline-block px-2.5 py-0.5 text-xs font-semibold rounded bg-brand-blue text-white">
              پنل مدیریت دفتر
            </span>
          </div>

          <nav aria-label="منوی پنل مدیریت" className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3.5 py-2 rounded-control text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white text-brand-navy font-bold'
                      : 'text-white/90 hover:bg-white/10'
                  }`
                }
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-bold rounded-full bg-brand-turquoise text-brand-navy-dark">
                    {toPersianDigits(item.badge)}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <span className="text-xs text-white/80 truncate max-w-[160px]">
              {user?.displayName}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-control text-xs font-semibold bg-white/10 text-white hover:bg-white/20"
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
            className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-control border border-white/25 text-white"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <nav
            aria-label="منوی موبایل پنل مدیریت"
            className="lg:hidden border-t border-white/15 bg-brand-navy px-4 py-3 space-y-1.5"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between min-h-[44px] px-3 py-2 rounded-control text-sm font-medium ${
                    isActive
                      ? 'bg-white text-brand-navy font-bold'
                      : 'text-white/90 hover:bg-white/10'
                  }`
                }
              >
                <span className="inline-flex items-center gap-2">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-brand-turquoise text-brand-navy-dark">
                    {toPersianDigits(item.badge)}
                  </span>
                )}
              </NavLink>
            ))}
            <div className="pt-2 border-t border-white/15 flex items-center justify-between">
              <span className="text-xs text-white/80">{user?.displayName}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-control text-xs font-semibold bg-white/15 text-white"
              >
                <LogOut className="w-4 h-4" />
                <span>خروج از پنل</span>
              </button>
            </div>
          </nav>
        )}
      </header>

      <main id="admin-main" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
