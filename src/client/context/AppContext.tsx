import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { CurrencyUnit, UserRole } from '@shared/domain';
import { getCurrentJalaliPeriod } from '@shared/jalali';
import {
  apiRequest,
  clearClientAuthTokens,
  setCsrfToken,
  setOnUnauthorizedHandler,
  setPreviewSessionToken,
} from '../lib/api';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  forcePasswordChange: boolean;
}

export interface AuthCustomerSummary {
  id: string;
  fullName: string;
  mobile: string;
  maskedNationalId: string;
  phone: string | null;
}

export interface PublicAppConfig {
  brandNameFa: string;
  brandTaglineFa: string;
  currencyUnit: CurrencyUnit;
  currencyLabel: string;
  businessTimezone: string;
  currentJalaliPeriod: { jalaliYear: number; jalaliMonth: number };
  maxUploadMb: number;
  allowedUploadMimes: string[];
  initialPasswordMode: 'national_id' | 'generated';
  officeContact: {
    title: string;
    address: string | null;
    phone: string | null;
    workingHours: string | null;
    mapNote: string | null;
  };
}

interface AuthMeResponse {
  authenticated: boolean;
  csrfToken?: string;
  user?: AuthUser;
  customer?: AuthCustomerSummary | null;
}

interface AppContextValue {
  loading: boolean;
  publicConfig: PublicAppConfig;
  user: AuthUser | null;
  customer: AuthCustomerSummary | null;
  refreshSession: () => Promise<AuthUser | null>;
  applyLoginSuccess: (payload: {
    csrfToken: string;
    previewSessionToken?: string;
    user: AuthUser;
    customer: AuthCustomerSummary | null;
  }) => void;
  logout: () => Promise<void>;
}

const DEFAULT_PUBLIC_CONFIG: PublicAppConfig = {
  brandNameFa: 'همراه بیمه',
  brandTaglineFa: 'خدمات بیمه‌ای، ساده‌تر و مطمئن‌تر',
  currencyUnit: 'TOMAN',
  currencyLabel: 'تومان',
  businessTimezone: 'Asia/Tehran',
  currentJalaliPeriod: getCurrentJalaliPeriod(new Date(), 'Asia/Tehran'),
  maxUploadMb: 10,
  allowedUploadMimes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  initialPasswordMode: 'generated',
  officeContact: {
    title: 'دفتر خدمات بیمه‌ای همراه بیمه',
    address: null,
    phone: null,
    workingHours: null,
    mapNote: null,
  },
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [publicConfig, setPublicConfig] = useState<PublicAppConfig>(DEFAULT_PUBLIC_CONFIG);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [customer, setCustomer] = useState<AuthCustomerSummary | null>(null);

  useEffect(() => {
    setOnUnauthorizedHandler(() => {
      setUser(null);
      setCustomer(null);
    });
    return () => setOnUnauthorizedHandler(null);
  }, []);

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    const me = await apiRequest<AuthMeResponse>('/api/auth/me');
    if (me.authenticated && me.user) {
      setCsrfToken(me.csrfToken ?? null);
      setUser(me.user);
      setCustomer(me.customer ?? null);
      return me.user;
    }
    clearClientAuthTokens();
    setUser(null);
    setCustomer(null);
    return null;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [cfg, me] = await Promise.all([
          apiRequest<PublicAppConfig>('/api/public/config'),
          apiRequest<AuthMeResponse>('/api/auth/me'),
        ]);
        if (!active) return;
        setPublicConfig(cfg);
        if (me.authenticated && me.user) {
          setCsrfToken(me.csrfToken ?? null);
          setUser(me.user);
          setCustomer(me.customer ?? null);
        } else {
          clearClientAuthTokens();
          setUser(null);
          setCustomer(null);
        }
      } catch {
        // Keep safe fallback config on transient boot failure
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const applyLoginSuccess = useCallback(
    (payload: {
      csrfToken: string;
      previewSessionToken?: string;
      user: AuthUser;
      customer: AuthCustomerSummary | null;
    }) => {
      setCsrfToken(payload.csrfToken);
      if (payload.previewSessionToken) {
        setPreviewSessionToken(payload.previewSessionToken);
      }
      setUser(payload.user);
      setCustomer(payload.customer);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear local session state even if network failed
    } finally {
      clearClientAuthTokens();
      setUser(null);
      setCustomer(null);
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        loading,
        publicConfig,
        user,
        customer,
        refreshSession,
        applyLoginSuccess,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
