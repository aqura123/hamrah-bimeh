import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  icon?: React.ReactNode;
}

export function PrimaryButton({
  children,
  loading = false,
  disabled,
  icon,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-control font-semibold text-sm bg-brand-navy text-white hover:bg-brand-navy-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export function SecondaryButton({
  children,
  loading = false,
  disabled,
  icon,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-control font-medium text-sm bg-brand-surface text-brand-text border border-brand-border hover:bg-brand-subtle transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export function DangerButton({
  children,
  loading = false,
  disabled,
  icon,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-control font-semibold text-sm bg-status-danger-bg text-status-danger border border-status-danger/30 hover:bg-status-danger hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export function Card({
  children,
  className = '',
  as: Component = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Component
      className={`bg-brand-surface border border-brand-border rounded-card shadow-card ${className}`}
    >
      {children}
    </Component>
  );
}

export function Alert({
  variant = 'info',
  title,
  children,
  className = '',
}: {
  variant?: 'info' | 'warning' | 'success' | 'error';
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: {
      box: 'bg-status-info-bg text-status-info border-brand-blue/30',
      icon: <Info className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />,
      role: 'status' as const,
    },
    warning: {
      box: 'bg-status-warning-bg text-status-warning border-status-warning/30',
      icon: <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />,
      role: 'status' as const,
    },
    success: {
      box: 'bg-status-success-bg text-status-success border-brand-turquoise/60',
      icon: <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />,
      role: 'status' as const,
    },
    error: {
      box: 'bg-status-danger-bg text-status-danger border-status-danger/30',
      icon: <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />,
      role: 'alert' as const,
    },
  }[variant];

  return (
    <div
      role={styles.role}
      className={`flex items-start gap-3 p-4 rounded-control border text-sm leading-relaxed ${styles.box} ${className}`}
    >
      {styles.icon}
      <div className="flex-1 min-w-0">
        {title && <p className="font-bold mb-1">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 bg-brand-surface border border-dashed border-brand-border rounded-card">
      {icon && (
        <div className="w-12 h-12 rounded-full bg-brand-subtle text-brand-blue flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-brand-text mb-1.5">{title}</h3>
      <p className="text-sm text-brand-muted max-w-md mb-5 leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'در حال بارگذاری اطلاعات...' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="py-12 px-4 flex flex-col items-center justify-center gap-3 text-brand-muted"
    >
      <Loader2 className="w-7 h-7 animate-spin text-brand-blue" aria-hidden="true" />
      <p className="text-sm font-medium">{label}</p>
      <div className="w-full max-w-lg space-y-2.5 mt-2" aria-hidden="true">
        <div className="h-3 bg-brand-subtle rounded animate-pulse w-3/4 mx-auto" />
        <div className="h-3 bg-brand-subtle rounded animate-pulse w-1/2 mx-auto" />
      </div>
    </div>
  );
}

export function ErrorState({
  title = 'خطا در دریافت اطلاعات',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="p-6 bg-status-danger-bg border border-status-danger/30 rounded-card text-center max-w-xl mx-auto my-6"
    >
      <AlertCircle className="w-8 h-8 text-status-danger mx-auto mb-2" aria-hidden="true" />
      <h3 className="text-base font-bold text-status-danger mb-1">{title}</h3>
      <p className="text-sm text-brand-text mb-4">{message}</p>
      {onRetry && (
        <SecondaryButton
          onClick={onRetry}
          icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
        >
          تلاش مجدد
        </SecondaryButton>
      )}
    </div>
  );
}

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="مسیر صفحه" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm text-brand-muted">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="hover:text-brand-navy underline-offset-4 hover:underline transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={isLast ? 'font-semibold text-brand-text' : ''}
                >
                  {item.label}
                </span>
              )}
              {!isLast && <ChevronLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageTitle({
  title,
  subtitle,
  documentTitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  documentTitle?: string;
  actions?: React.ReactNode;
}) {
  useEffect(() => {
    document.title = documentTitle ? `${documentTitle} | همراه بیمه` : `${title} | همراه بیمه`;
  }, [title, documentTitle]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-brand-border">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-brand-navy leading-snug">{title}</h1>
        {subtitle && <p className="text-sm text-brand-muted mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
