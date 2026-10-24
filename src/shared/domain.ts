import { toPersianDigits } from './jalali.js';

export const USER_ROLES = ['customer', 'office_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const REQUEST_TYPES = ['driver', 'workshop'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = [
  'registered',
  'office_reviewing',
  'needs_customer_info',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const TERMINAL_REQUEST_STATUSES: readonly RequestStatus[] = [
  'completed',
  'rejected',
  'cancelled',
];

export const CURRENCY_UNITS = ['TOMAN', 'RIAL'] as const;
export type CurrencyUnit = (typeof CURRENCY_UNITS)[number];

export const INITIAL_PASSWORD_MODES = ['national_id', 'generated', 'manual_bootstrap'] as const;
export type InitialPasswordMode = (typeof INITIAL_PASSWORD_MODES)[number];

export const PROFILE_REVIEW_STATES = ['confirmed', 'pending_office_review'] as const;
export type ProfileReviewState = (typeof PROFILE_REVIEW_STATES)[number];

export const FILE_CLASSIFICATIONS = [
  'customer_attachment',
  'employee_document',
  'office_output',
] as const;
export type FileClassification = (typeof FILE_CLASSIFICATIONS)[number];

export const CANCELLATION_DECISIONS = ['pending', 'accepted', 'rejected'] as const;
export type CancellationDecision = (typeof CANCELLATION_DECISIONS)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  registered: 'ثبت‌شده',
  office_reviewing: 'در حال بررسی دفتر',
  needs_customer_info: 'نیازمند تکمیل اطلاعات از طرف مشتری',
  in_progress: 'در حال انجام',
  completed: 'انجام‌شده',
  rejected: 'ردشده',
  cancelled: 'لغوشده',
};

export const REQUEST_STATUS_DESCRIPTIONS: Record<RequestStatus, string> = {
  registered: 'درخواست شما در سامانه ثبت شده و در نوبت بررسی دفتر قرار دارد.',
  office_reviewing: 'مسئول دفتر در حال بررسی اطلاعات و مدارک ارسال‌شده است.',
  needs_customer_info: 'برای ادامه یا تکمیل کار، ارسال توضیح یا مدرک تکمیلی از سوی شما لازم است.',
  in_progress: 'اقدامات اجرایی مربوط به درخواست شما توسط دفتر در حال انجام است.',
  completed: 'درخواست توسط دفتر انجام و نهایی شده است.',
  rejected: 'درخواست به دلیل اعلام‌شده در توضیحات دفتر رد شده است.',
  cancelled: 'درخواست پس از بررسی دفتر لغو شده است.',
};

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  driver: 'حق بیمه رانندگان',
  workshop: 'لیست بیمه ماهانه کارگاه',
};

export const CURRENCY_UNIT_LABELS: Record<CurrencyUnit, string> = {
  TOMAN: 'تومان',
  RIAL: 'ریال',
};

export const FILE_CLASSIFICATION_LABELS: Record<FileClassification, string> = {
  customer_attachment: 'پیوست ارسالی مشتری',
  employee_document: 'مدرک بیمه‌شده جدید',
  office_output: 'فایل خروجی دفتر',
};

export const PROFILE_REVIEW_LABELS: Record<ProfileReviewState, string> = {
  confirmed: 'تأییدشده در پرونده',
  pending_office_review: 'ثبت‌شده توسط مشتری (در انتظار تطبیق دفتر)',
};

/**
 * Allowed status transitions managed exclusively by `office_admin`.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  registered: ['office_reviewing', 'needs_customer_info', 'in_progress', 'rejected', 'cancelled'],
  office_reviewing: ['needs_customer_info', 'in_progress', 'completed', 'rejected', 'cancelled'],
  needs_customer_info: ['office_reviewing', 'in_progress', 'completed', 'rejected', 'cancelled'],
  in_progress: ['office_reviewing', 'needs_customer_info', 'completed', 'rejected', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};

export function formatMoney(
  amount: number | string | null | undefined,
  unit: CurrencyUnit,
): string {
  if (amount === null || amount === undefined || amount === '') {
    return 'ثبت‌نشده';
  }
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(num)) {
    return 'ثبت‌نشده';
  }
  const grouped = Math.trunc(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return `${toPersianDigits(grouped)} ${CURRENCY_UNIT_LABELS[unit]}`;
}
