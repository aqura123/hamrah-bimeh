// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../../src/client/context/AppContext.js';
import { StatusBadge } from '../../src/client/components/ui/StatusBadge.js';
import { HomePage } from '../../src/client/pages/public/HomePage.js';
import { LoginPage } from '../../src/client/pages/public/LoginPage.js';
import { ContactPage } from '../../src/client/pages/public/ContactPage.js';
import { getAccountAction, getServiceAction } from '../../src/client/lib/navigation.js';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/api/public/config')) {
        return {
          ok: true,
          json: async () => ({
            brandNameFa: 'همراه بیمه',
            brandTaglineFa: 'خدمات بیمه‌ای، ساده‌تر و مطمئن‌تر',
            currencyUnit: 'TOMAN',
            currencyLabel: 'تومان',
            businessTimezone: 'Asia/Tehran',
            currentJalaliPeriod: { jalaliYear: 1405, jalaliMonth: 8 },
            maxUploadMb: 10,
            allowedUploadMimes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
            initialPasswordMode: 'national_id',
            officeContact: {
              title: 'دفتر خدمات بیمه‌ای همراه بیمه',
              address: null,
              phone: null,
              workingHours: null,
              mapNote: null,
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ authenticated: false }),
      };
    }),
  );
});

describe('Persian RTL Public Pages & Accessible Components', () => {
  it('renders StatusBadge with explicit Persian text (never color-only)', () => {
    render(<StatusBadge status="needs_customer_info" />);
    expect(screen.getByText('نیازمند تکمیل اطلاعات از طرف مشتری')).toBeTruthy();
  });

  it('renders HomePage with official Persian tagline, service cards, and zero lorem ipsum', async () => {
    const { container } = render(
      <AppProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </AppProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('خدمات بیمه‌ای، ساده‌تر و مطمئن‌تر')).toBeTruthy();
    });
    expect(screen.getByText('خدمات رانندگان')).toBeTruthy();
    expect(screen.getByText('خدمات کارفرمایان و کارگاه‌ها')).toBeTruthy();
    expect(container.textContent?.toLowerCase()).not.toContain('lorem');
  });

  it('renders LoginPage with accessible labeled mobile & password inputs only (no public signup, no SMS OTP)', async () => {
    const { container } = render(
      <AppProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AppProvider>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/شماره تلفن همراه \(نام کاربری\)/)).toBeTruthy();
    });
    expect(screen.getByLabelText(/رمز عبور/)).toBeTruthy();
    expect(container.textContent).toContain('ثبت‌نام عمومی در سایت وجود ندارد');
    expect(container.textContent).not.toContain('کد پیامکی');
  });

  it('renders ContactPage with honest configurable placeholders and zero fabricated numbers', async () => {
    const { container } = render(
      <AppProvider>
        <MemoryRouter>
          <ContactPage />
        </MemoryRouter>
      </AppProvider>,
    );
    await waitFor(() => {
      expect(container.textContent).toContain('PUBLIC_OFFICE_ADDRESS');
    });
    expect(container.textContent).toContain('PUBLIC_OFFICE_PHONE');
  });
});


describe('Role-aware public navigation actions', () => {
  it('keeps service calls out of customer routes for office admins and forced password changes', () => {
    expect(getServiceAction(null, '/portal/requests/new/driver', 'ثبت درخواست راننده')).toEqual({
      to: '/login',
      label: 'ورود برای ثبت درخواست',
    });
    expect(
      getServiceAction(
        { role: 'office_admin', forcePasswordChange: false },
        '/portal/requests/new/driver',
        'ثبت درخواست راننده',
      ),
    ).toEqual({ to: '/admin', label: 'ورود به پنل دفتر' });
    expect(
      getServiceAction(
        { role: 'customer', forcePasswordChange: true },
        '/portal/requests/new/driver',
        'ثبت درخواست راننده',
      ),
    ).toEqual({ to: '/change-password', label: 'تغییر رمز عبور' });
    expect(getAccountAction({ role: 'office_admin', forcePasswordChange: true })).toEqual({
      to: '/change-password',
      label: 'تغییر رمز عبور',
    });
  });
});
