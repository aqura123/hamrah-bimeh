import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { formatJalaliDateTime, toPersianDigits } from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { ApiError, apiRequest } from '../../lib/api';
import {
  Alert,
  Breadcrumb,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
  SecondaryButton,
} from '../../components/ui/Primitives';

interface NotificationItem {
  id: string;
  notificationType: string;
  requestId: string | null;
  titleFa: string;
  bodyFa: string;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsView({ mode }: { mode: 'customer' | 'admin' }) {
  const { publicConfig } = useApp();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        unreadCount: number;
        incompleteRequestsCount?: number;
        notifications: NotificationItem[];
      }>('/api/notifications');
      setItems(res.notifications);
      setUnreadCount(res.unreadCount);
      setIncompleteCount(res.incompleteRequestsCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت اعلان‌ها.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markOneRead = async (id: string) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignore transient error
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? nowIso })));
      setUnreadCount(0);
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading) return <LoadingState label="در حال بارگذاری اعلان‌ها..." />;
  if (error) return <ErrorState message={error} onRetry={loadNotifications} />;

  const requestBasePath = mode === 'admin' ? '/admin/requests' : '/portal/requests';

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            label: mode === 'admin' ? 'پنل مدیریت دفتر' : 'پرتال من',
            to: mode === 'admin' ? '/admin' : '/portal',
          },
          { label: 'اعلان‌ها' },
        ]}
      />

      <PageTitle
        title={mode === 'admin' ? 'اعلان‌های دفتر' : 'اعلان‌های من'}
        subtitle={`تعداد اعلان‌های خوانده‌نشده: ${toPersianDigits(unreadCount)} مورد`}
        actions={
          unreadCount > 0 ? (
            <SecondaryButton
              onClick={markAllRead}
              loading={markingAll}
              icon={<CheckCheck className="w-4 h-4" aria-hidden="true" />}
            >
              علامت‌گذاری همه به‌عنوان خوانده‌شده
            </SecondaryButton>
          ) : undefined
        }
      />

      {mode === 'admin' && incompleteCount !== undefined && incompleteCount > 0 && (
        <Alert variant="warning" title="صف درخواست‌های تکمیل‌نشده (در جریان)">
          در حال حاضر <strong>{toPersianDigits(incompleteCount)} درخواست</strong> در وضعیت غیرنهایی
          (ثبت‌شده، در حال بررسی، نیازمند اطلاعات یا در حال انجام) قرار دارند.{' '}
          <Link
            to="/admin?incompleteOnly=true"
            className="font-bold underline hover:text-brand-navy mr-1"
          >
            مشاهده فهرست درخواست‌های تکمیل‌نشده
          </Link>
        </Alert>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-6 h-6" aria-hidden="true" />}
          title="اعلانی برای نمایش وجود ندارد"
          description="به محض تغییر وضعیت درخواست‌ها، ثبت پیام جدید یا بارگذاری فایل، اعلان آن در این صفحه ثبت خواهد شد."
        />
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const isUnread = !n.readAt;
            return (
              <Card
                key={n.id}
                className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isUnread ? 'border-brand-blue bg-status-info-bg/35' : ''
                }`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isUnread && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-navy text-white">
                        جدید
                      </span>
                    )}
                    <h2 className="text-sm font-bold text-brand-navy">{n.titleFa}</h2>
                    <span className="text-xs text-brand-muted">
                      · {formatJalaliDateTime(n.createdAt, publicConfig.businessTimezone)}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-brand-text leading-relaxed">{n.bodyFa}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => markOneRead(n.id)}
                      className="min-h-[36px] px-3 py-1.5 rounded-control text-xs font-medium bg-brand-surface border border-brand-border text-brand-muted hover:text-brand-navy"
                    >
                      خوانده شد
                    </button>
                  )}
                  {n.requestId && (
                    <Link
                      to={`${requestBasePath}/${n.requestId}`}
                      onClick={() => {
                        if (isUnread) void markOneRead(n.id);
                      }}
                      className="inline-flex items-center gap-1 min-h-[36px] px-3.5 py-1.5 rounded-control text-xs font-semibold bg-brand-navy text-white hover:bg-brand-navy-dark"
                    >
                      <span>مشاهده درخواست</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
