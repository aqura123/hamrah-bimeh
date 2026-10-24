import React from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  FileSearch,
  HelpCircle,
  Wrench,
} from 'lucide-react';
import { REQUEST_STATUS_LABELS, type RequestStatus } from '@shared/domain';

export function StatusBadge({ status }: { status: RequestStatus }) {
  const config: Record<RequestStatus, { className: string; icon: React.ReactNode }> = {
    registered: {
      className: 'bg-status-neutral-bg text-status-neutral border-brand-border',
      icon: <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    office_reviewing: {
      className: 'bg-status-info-bg text-status-info border-brand-blue/30',
      icon: <FileSearch className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    needs_customer_info: {
      className: 'bg-status-warning-bg text-status-warning border-status-warning/40',
      icon: <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    in_progress: {
      className: 'bg-status-info-bg text-brand-navy border-brand-navy/30',
      icon: <Wrench className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    completed: {
      className: 'bg-status-success-bg text-status-success border-brand-turquoise/60',
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    rejected: {
      className: 'bg-status-danger-bg text-status-danger border-status-danger/30',
      icon: <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    cancelled: {
      className: 'bg-status-neutral-bg text-brand-muted border-brand-border',
      icon: <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
  };

  const item = config[status] ?? config.registered;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control text-xs font-semibold border ${item.className}`}
    >
      {item.icon}
      <span>{REQUEST_STATUS_LABELS[status] ?? status}</span>
    </span>
  );
}

/**
 * Distinct indicator for the independent `awaitingCustomerInfo` flag so users
 * clearly see when a customer response is pending even while the request is `in_progress`.
 */
export function AwaitingInfoBadge({ primaryStatus }: { primaryStatus?: RequestStatus }) {
  if (primaryStatus === 'needs_customer_info') {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control text-xs font-semibold bg-status-warning-bg text-status-warning border border-status-warning/40">
      <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>منتظر پاسخ/مدرک مشتری</span>
    </span>
  );
}

export function CancellationPendingBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control text-xs font-semibold bg-status-danger-bg text-status-danger border border-status-danger/30">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>درخواست لغو در انتظار تصمیم دفتر</span>
    </span>
  );
}
