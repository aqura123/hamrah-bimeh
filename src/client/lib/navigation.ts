import type { AuthUser } from '../context/AppContext';

type AccountUser = Pick<AuthUser, 'role' | 'forcePasswordChange'> | null | undefined;

export interface NavigationAction {
  to: string;
  label: string;
}

/** Keep public-site actions consistent with authorization and first-login rules. */
export function getAccountAction(user: AccountUser): NavigationAction {
  if (!user) return { to: '/login', label: 'ورود به حساب کاربری' };
  if (user.forcePasswordChange) return { to: '/change-password', label: 'تغییر رمز عبور' };
  if (user.role === 'office_admin') return { to: '/admin', label: 'ورود به پنل دفتر' };
  return { to: '/portal', label: 'ورود به پرتال مشتری' };
}

/** A customer-facing service action must never send an office admin to a customer route. */
export function getServiceAction(
  user: AccountUser,
  customerPath: string,
  customerLabel: string,
): NavigationAction {
  if (!user) return { to: '/login', label: 'ورود برای ثبت درخواست' };
  if (user.forcePasswordChange) return { to: '/change-password', label: 'تغییر رمز عبور' };
  if (user.role === 'office_admin') return { to: '/admin', label: 'ورود به پنل دفتر' };
  return { to: customerPath, label: customerLabel };
}
