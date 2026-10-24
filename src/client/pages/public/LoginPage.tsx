import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useApp, type AuthCustomerSummary, type AuthUser } from '../../context/AppContext';
import { ApiError, apiRequest } from '../../lib/api';
import { FormField, INPUT_CLASS } from '../../components/ui/FormControls';
import { LogoMark } from '../../components/ui/Logo';
import { Alert, Card, PrimaryButton } from '../../components/ui/Primitives';

interface LoginResponse {
  authenticated: boolean;
  csrfToken: string;
  previewSessionToken?: string;
  user: AuthUser;
  customer: AuthCustomerSummary | null;
}

export function LoginPage() {
  const { user, applyLoginSuccess } = useApp();
  const navigate = useNavigate();

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = 'ورود به حساب کاربری | همراه بیمه';
  }, []);

  if (user) {
    if (user.forcePasswordChange) {
      return <Navigate to="/change-password" replace />;
    }
    return <Navigate to={user.role === 'office_admin' ? '/admin' : '/portal'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      const result = await apiRequest<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: { mobile, password },
      });

      applyLoginSuccess({
        csrfToken: result.csrfToken,
        previewSessionToken: result.previewSessionToken,
        user: result.user,
        customer: result.customer,
      });

      if (result.user.forcePasswordChange) {
        navigate('/change-password', { replace: true });
      } else if (result.user.role === 'office_admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/portal', { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
      } else {
        setFormError('خطا در ورود به حساب کاربری. لطفاً مجدداً تلاش کنید.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <Card className="p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <LogoMark className="w-12 h-12 mx-auto" />
          <h1 className="text-xl sm:text-2xl font-bold text-brand-navy">ورود به همراه بیمه</h1>
          <p className="text-xs sm:text-sm text-brand-muted">
            نام کاربری شما همان شماره تلفن همراه ثبت‌شده در دفتر است.
          </p>
        </div>

        {formError && <Alert variant="error">{formError}</Alert>}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <FormField
            label="شماره تلفن همراه (نام کاربری)"
            required
            hint="نمونه: ۰۹۱۲۳۴۵۶۷۸۹"
            error={fieldErrors.mobile}
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="tel"
                inputMode="tel"
                autoComplete="username"
                dir="ltr"
                placeholder="09123456789"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className={`${INPUT_CLASS} text-left font-medium tracking-wider`}
              />
            )}
          </FormField>

          <FormField label="رمز عبور" required error={fieldErrors.password}>
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${INPUT_CLASS} text-left`}
              />
            )}
          </FormField>

          <PrimaryButton
            type="submit"
            loading={submitting}
            icon={<KeyRound className="w-4 h-4" aria-hidden="true" />}
            className="w-full"
          >
            ورود به سامانه
          </PrimaryButton>
        </form>

        <div className="pt-4 border-t border-brand-border space-y-2.5 text-xs text-brand-muted leading-relaxed">
          <p className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              حساب کاربری مشتریان صرفاً توسط دفتر ایجاد می‌شود و ثبت‌نام عمومی در سایت وجود ندارد.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Lock className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              در صورت فراموشی رمز عبور، بازیابی حساب به‌صورت حضوری یا تلفنی توسط مسئول دفتر انجام
              می‌گیرد.
            </span>
          </p>
        </div>
      </Card>
    </div>
  );
}
