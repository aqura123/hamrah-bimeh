import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ApiError, apiRequest } from '../../lib/api';
import { FormField, INPUT_CLASS } from '../../components/ui/FormControls';
import { BrandLogo } from '../../components/ui/Logo';
import { Alert, Card, PrimaryButton, SecondaryButton } from '../../components/ui/Primitives';

export function ForceChangePasswordPage() {
  const { user, refreshSession, logout } = useApp();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = 'تغییر رمز عبور اولیه | همراه بیمه';
  }, []);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword, confirmPassword },
      });
      const updatedUser = await refreshSession();
      if (updatedUser?.role === 'office_admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/portal', { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
      } else {
        setError('خطا در تغییر رمز عبور.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <BrandLogo to="/change-password" />
        </div>

        <Card className="p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-brand-blue shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-bold text-brand-navy">
                تغییر اجباری رمز عبور اولیه / موقت
              </h1>
              <p className="text-xs text-brand-muted mt-1 leading-relaxed">
                برای حفظ امنیت پرونده‌های بیمه‌ای شما، پیش از ورود به پرتال لازم است رمز عبور اولیه
                دریافتی از دفتر را به یک رمز شخصی امن تغییر دهید.
              </p>
            </div>
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <FormField
              label="رمز عبور فعلی (اولیه / موقت)"
              required
              error={fieldErrors.currentPassword}
            >
              {(props) => (
                <input
                  {...props}
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={`${INPUT_CLASS} text-left`}
                />
              )}
            </FormField>

            <FormField
              label="رمز عبور جدید"
              required
              hint="حداقل ۸ کاراکتر شامل حروف و اعداد؛ نباید با شماره همراه یا کد ملی شما یکسان باشد."
              error={fieldErrors.newPassword}
            >
              {(props) => (
                <input
                  {...props}
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`${INPUT_CLASS} text-left`}
                />
              )}
            </FormField>

            <FormField label="تکرار رمز عبور جدید" required error={fieldErrors.confirmPassword}>
              {(props) => (
                <input
                  {...props}
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${INPUT_CLASS} text-left`}
                />
              )}
            </FormField>

            <div className="pt-2 space-y-2">
              <PrimaryButton
                type="submit"
                loading={submitting}
                icon={<KeyRound className="w-4 h-4" aria-hidden="true" />}
                className="w-full"
              >
                ثبت رمز جدید و ورود به پرتال
              </PrimaryButton>
              <SecondaryButton
                type="button"
                onClick={handleLogout}
                icon={<LogOut className="w-4 h-4" aria-hidden="true" />}
                className="w-full"
              >
                انصراف و خروج از حساب
              </SecondaryButton>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
