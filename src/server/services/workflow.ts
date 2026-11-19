import {
  ALLOWED_STATUS_TRANSITIONS,
  REQUEST_STATUS_LABELS,
  TERMINAL_REQUEST_STATUSES,
  type RequestStatus,
} from '../../shared/domain.js';

export class WorkflowError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'WorkflowError';
    this.statusCode = statusCode;
  }
}

export function assertStatusTransitionAllowed(params: {
  currentStatus: RequestStatus;
  newStatus: RequestStatus;
  finalAmount: number | null;
  paymentCardNumber?: string | null;
  awaitingCustomerInfo: boolean;
  cancellationDecision: string | null;
  explanation?: string;
}): void {
  const {
    currentStatus,
    newStatus,
    finalAmount,
    paymentCardNumber,
    awaitingCustomerInfo,
    cancellationDecision,
    explanation,
  } = params;

  if (currentStatus === newStatus) {
    throw new WorkflowError('وضعیت انتخاب‌شده با وضعیت فعلی درخواست یکسان است.');
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new WorkflowError(
      `تغییر وضعیت از «${REQUEST_STATUS_LABELS[currentStatus]}» به «${REQUEST_STATUS_LABELS[newStatus]}» مجاز نیست.`,
    );
  }

  if (
    (newStatus === 'rejected' || newStatus === 'cancelled') &&
    (!explanation || explanation.trim().length < 5)
  ) {
    throw new WorkflowError('برای رد یا لغو درخواست، ثبت توضیح روشن برای مشتری الزامی است.');
  }

  if (
    newStatus === 'awaiting_payment' &&
    (finalAmount === null || finalAmount < 0 || !paymentCardNumber)
  ) {
    throw new WorkflowError(
      'پیش از تغییر وضعیت به «در انتظار پرداخت»، مبلغ نهایی و شماره کارت واریز را ثبت کنید.',
    );
  }

  if (newStatus === 'completed') {
    if (awaitingCustomerInfo) {
      throw new WorkflowError(
        'تا زمانی که درخواست در حالت «در انتظار تکمیل اطلاعات مشتری» است، امکان نهایی‌سازی به «انجام‌شده» وجود ندارد. ابتدا وضعیت انتظار اطلاعات را برطرف کنید.',
      );
    }
    if (cancellationDecision === 'pending') {
      throw new WorkflowError(
        'برای این درخواست یک «درخواست لغو» از سوی مشتری ثبت شده که هنوز تعیین تکلیف نشده است. ابتدا درباره درخواست لغو تصمیم‌گیری کنید.',
      );
    }
    if (finalAmount === null || finalAmount === undefined || finalAmount < 0) {
      throw new WorkflowError(
        'پیش از تغییر وضعیت به «انجام‌شده»، ثبت مبلغ نهایی خدمات الزامی است (در صورت عدم دریافت هزینه، عدد ۰ را ثبت کنید).',
      );
    }
  }
}

export function isRequestTerminal(status: RequestStatus): boolean {
  return TERMINAL_REQUEST_STATUSES.includes(status);
}
