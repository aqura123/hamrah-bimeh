import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ExternalLink, History } from 'lucide-react';
import { formatJalaliDateTime, toPersianDigits } from '@shared/jalali';
import { useApp } from '../../context/AppContext';
import { ApiError, apiRequest } from '../../lib/api';
import { INPUT_CLASS } from '../../components/ui/FormControls';
import {
  Breadcrumb,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
} from '../../components/ui/Primitives';

interface AuditRow {
  id: string;
  actorRole: string;
  actorName: string | null;
  entityType: string;
  entityId: string;
  requestId: string | null;
  eventType: string;
  summaryFa: string;
  createdAt: string;
}

export function AdminAuditPage() {
  const { publicConfig } = useApp();
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [items, setItems] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (entityType) qs.set('entityType', entityType);
      const res = await apiRequest<{
        totalCount: number;
        totalPages: number;
        items: AuditRow[];
      }>(`/api/admin/audit-events?${qs.toString()}`);
      setItems(res.items);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطا در دریافت گزارش رویدادها.');
    } finally {
      setLoading(false);
    }
  }, [entityType, page]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[{ label: 'همه درخواست‌ها', to: '/admin' }, { label: 'گزارش رویدادها (Audit)' }]}
      />

      <PageTitle
        title={`گزارش ممیزی و تاریخچه اقدامات (${toPersianDigits(totalCount)})`}
        subtitle="ثبت غیرقابل‌حذف تغییر وضعیت‌ها، مبالغ، فایل‌ها، ویرایش پرونده‌ها و عملیات امنیتی بدون ذخیره داده‌های حساس"
      />

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <label htmlFor="audit-entity-filter" className="text-xs font-semibold text-brand-navy">
          فیلتر بر اساس بخش:
        </label>
        <select
          id="audit-entity-filter"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          className={`${INPUT_CLASS} w-52`}
        >
          <option value="">همه رویدادها</option>
          <option value="request">درخواست‌ها</option>
          <option value="customer">حساب مشتریان</option>
          <option value="driver">پرونده رانندگان</option>
          <option value="workshop">پرونده کارگاه‌ها</option>
          <option value="file">فایل‌ها</option>
          <option value="user">احراز هویت و رمز عبور</option>
        </select>
      </Card>

      {loading ? (
        <LoadingState label="در حال بارگذاری گزارش رویدادها..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadAudit} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<History className="w-6 h-6" />}
          title="رویدادی یافت نشد"
          description="هنوز رویدادی در این دسته‌بندی ثبت نشده است."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-brand-border">
            {items.map((ev) => (
              <div
                key={ev.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-brand-subtle/40"
              >
                <div className="space-y-1">
                  <p className="font-bold text-sm text-brand-navy">{ev.summaryFa}</p>
                  <p className="text-brand-muted">
                    نوع رویداد: <span className="ltr-code">{ev.eventType}</span> · اقدام‌کننده:{' '}
                    {ev.actorName ?? ev.actorRole}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-brand-muted">
                    {formatJalaliDateTime(ev.createdAt, publicConfig.businessTimezone)}
                  </span>
                  {ev.requestId && (
                    <Link
                      to={`/admin/requests/${ev.requestId}`}
                      className="inline-flex items-center gap-1 font-bold text-brand-blue hover:underline"
                    >
                      <span>درخواست</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 bg-brand-subtle/50 border-t border-brand-border flex items-center justify-between text-xs">
            <span>
              صفحه {toPersianDigits(page)} از {toPersianDigits(totalPages)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 min-h-[34px] px-3 py-1 rounded border border-brand-border bg-brand-surface disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
                <span>قبلی</span>
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 min-h-[34px] px-3 py-1 rounded border border-brand-border bg-brand-surface disabled:opacity-40"
              >
                <span>بعدی</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
