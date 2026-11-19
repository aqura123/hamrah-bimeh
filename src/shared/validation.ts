import { z } from 'zod';
import {
  isValidIranianMobile,
  isValidIranianNationalId,
  normalizeIranianMobile,
  normalizeNationalId,
  stripInvisibleBidiMarks,
} from './iran-identifiers.js';
import { normalizeDigits } from './jalali.js';
import { isValidCardNumber } from './banks.js';
import { INITIAL_PASSWORD_MODES, REQUEST_STATUSES, REQUEST_TYPES } from './domain.js';

export const iranianMobileSchema = z
  .string({ required_error: 'شماره همراه الزامی است.' })
  .trim()
  .min(1, 'شماره همراه الزامی است.')
  .refine((val) => isValidIranianMobile(val), {
    message: 'شماره همراه معتبر نیست (نمونه صحیح: ۰۹۱۲۳۴۵۶۷۸۹).',
  })
  .transform((val) => normalizeIranianMobile(val)!);

export const iranianNationalIdSchema = z
  .string({ required_error: 'کد ملی الزامی است.' })
  .trim()
  .min(1, 'کد ملی الزامی است.')
  .refine((val) => isValidIranianNationalId(val), {
    message: 'کد ملی ۱۰ رقمی معتبر نیست.',
  })
  .transform((val) => normalizeNationalId(val));

export const optionalNationalIdSchema = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((val) => !val || isValidIranianNationalId(val), {
    message: 'کد ملی ۱۰ رقمی معتبر نیست.',
  })
  .transform((val) => (val ? normalizeNationalId(val) : null));

export const jalaliYearSchema = z
  .union([z.number(), z.string()])
  .transform((v) => Number(normalizeDigits(String(v).trim())))
  .refine((n) => Number.isInteger(n) && n >= 1395 && n <= 1420, {
    message: 'سال بیمه‌ای انتخاب‌شده معتبر نیست.',
  });

export const jalaliMonthSchema = z
  .union([z.number(), z.string()])
  .transform((v) => Number(normalizeDigits(String(v).trim())))
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 12, {
    message: 'ماه بیمه‌ای باید عددی بین ۱ (فروردین) تا ۱۲ (اسفند) باشد.',
  });

export const safePersianNameSchema = (fieldLabel: string) =>
  z
    .string({ required_error: `${fieldLabel} الزامی است.` })
    .trim()
    .min(2, `${fieldLabel} باید حداقل ۲ کاراکتر باشد.`)
    .max(150, `${fieldLabel} نباید بیش از ۱۵۰ کاراکتر باشد.`);

export const workshopCodeSchema = z
  .string({ required_error: 'کد کارگاه الزامی است.' })
  .trim()
  .transform((v) => normalizeDigits(v))
  .refine((v) => /^[A-Za-z0-9\-/]{3,40}$/.test(v), {
    message: 'کد کارگاه باید بین ۳ تا ۴۰ کاراکتر عددی یا حروف مجاز باشد.',
  });

export const insuranceNumberSchema = z
  .string({ required_error: 'شماره بیمه الزامی است.' })
  .trim()
  .transform((v) => normalizeDigits(v))
  .refine((v) => /^\d{6,20}$/.test(v), {
    message: 'شماره بیمه باید شامل ۶ تا ۲۰ رقم باشد.',
  });

/**
 * Keeps portal credentials out of free-form notes; the dedicated field stores them encrypted.
 */
const PORTAL_CREDENTIAL_PATTERN =
  /(es\.tamin\.ir\s*[:=-]|رمز\s*(عبور\s*)?(سامانه\s*)?تامین\s*اجتماعی\s*[:=-]|پسورد\s*تامین\s*اجتماعی\s*[:=-])/i;

export function looksLikePortalPasswordDisclosure(text: string): boolean {
  return PORTAL_CREDENTIAL_PATTERN.test(text);
}

export const explanationSchema = z
  .string()
  .trim()
  .max(3000, 'متن توضیحات نباید بیشتر از ۳۰۰۰ کاراکتر باشد.')
  .refine((v) => !looksLikePortalPasswordDisclosure(v), {
    message: 'رمز سامانه را فقط در فیلد مخصوص رمز وارد کنید، نه در متن توضیحات.',
  });

export const requiredExplanationSchema = z
  .string({ required_error: 'ثبت توضیح الزامی است.' })
  .trim()
  .min(3, 'لطفاً توضیح روشن (حداقل ۳ کاراکتر) وارد کنید.')
  .max(3000, 'متن توضیحات نباید بیشتر از ۳۰۰۰ کاراکتر باشد.')
  .refine((v) => !looksLikePortalPasswordDisclosure(v), {
    message: 'رمز سامانه را فقط در فیلد مخصوص رمز وارد کنید، نه در متن پیام.',
  });

// --- Auth Schemas ---
export const loginInputSchema = z.object({
  mobile: iranianMobileSchema,
  password: z
    .string({ required_error: 'رمز عبور الزامی است.' })
    .transform((v) => normalizeDigits(stripInvisibleBidiMarks(v)).trim())
    .refine((v) => v.length >= 1, { message: 'رمز عبور الزامی است.' })
    .refine((v) => v.length <= 200, { message: 'رمز عبور نامعتبر است.' }),
});

export const changePasswordInputSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'رمز عبور فعلی الزامی است.' })
      .transform((v) => normalizeDigits(stripInvisibleBidiMarks(v)).trim())
      .pipe(z.string().min(1, 'رمز عبور فعلی الزامی است.')),
    newPassword: z
      .string({ required_error: 'رمز عبور جدید الزامی است.' })
      .transform((v) => normalizeDigits(stripInvisibleBidiMarks(v)).trim())
      .pipe(
        z
          .string()
          .min(8, 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد.')
          .max(128, 'رمز عبور جدید بیش از حد طولانی است.'),
      )
      .refine(
        (v) => /[A-Za-zآ-ی]/.test(v) && /\d/.test(normalizeDigits(v)),
        {
          message: 'رمز عبور جدید باید ترکیبی از حروف و اعداد باشد.',
        },
      ),
    confirmPassword: z
      .string({ required_error: 'تکرار رمز عبور جدید الزامی است.' })
      .transform((v) => normalizeDigits(stripInvisibleBidiMarks(v)).trim()),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'تکرار رمز عبور جدید با رمز عبور واردشده مطابقت ندارد.',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'رمز عبور جدید نباید با رمز عبور فعلی یکسان باشد.',
  });

// Shared card/mobile selections are validated on both server and client.
const numberOnly = (value: string) =>
  normalizeDigits(stripInvisibleBidiMarks(value)).replace(/[\s-]/g, '');
export const cardInputSchema = z
  .object({
    number: z
      .string()
      .transform(numberOnly)
      .refine(isValidCardNumber, 'شماره کارت ۱۶ رقمی یا رقم کنترل آن معتبر نیست.'),
    cvv2: z
      .string()
      .transform(numberOnly)
      .refine((v) => /^\d{3,4}$/.test(v), 'CVV2 باید ۳ یا ۴ رقم باشد.'),
    expiryMonth: z
      .string()
      .transform(numberOnly)
      .refine((v) => /^(0[1-9]|1[0-2])$/.test(v), 'ماه انقضا باید از ۰۱ تا ۱۲ باشد.'),
    expiryYear: z
      .string()
      .transform(numberOnly)
      .refine((v) => /^(\d{2}|\d{4})$/.test(v), 'سال انقضا باید ۲ یا ۴ رقم باشد.'),
    holderName: safePersianNameSchema('نام دارنده کارت'),
  })
  .strict();
export const cardSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), id: z.string().uuid() }).strict(),
  z.object({ mode: z.literal('new'), card: cardInputSchema }).strict(),
]);
export const mobileSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), id: z.string().uuid() }).strict(),
  z
    .object({
      mode: z.literal('new'),
      mobile: iranianMobileSchema.refine(
        (v) => /^09(?:0[0-5]|1[0-9]|2[0-4]|3[0-9]|9[0-9])\d{7}$/.test(v),
        'پیش‌شماره موبایل معتبر نیست.',
      ),
      ownerName: safePersianNameSchema('نام صاحب شماره'),
    })
    .strict(),
]);

// Preserve every character, including digits and whitespace, in the external portal password.
export const portalPasswordSchema = z
  .string({ required_error: 'رمز عبور سامانه تأمین اجتماعی الزامی است.' })
  .min(1, 'رمز عبور سامانه تأمین اجتماعی الزامی است.')
  .max(200, 'رمز عبور بیش از حد طولانی است.')
  .refine((v) => v.trim().length > 0, 'رمز عبور الزامی است.');

// --- Driver Request Flow Schema ---
export const newDriverProfileInputSchema = z
  .object({
    fullName: safePersianNameSchema('نام و نام خانوادگی راننده'),
    nationalId: iranianNationalIdSchema,
    portalPassword: portalPasswordSchema,
  })
  .strict();

export const createDriverRequestSchema = z
  .object({
    cardSelection: cardSelectionSchema,
    mobileSelection: mobileSelectionSchema,
    driverMode: z.enum(['existing', 'new']),
    driverId: z.string().uuid('شناسه راننده نامعتبر است.').optional(),
    initialPortalPassword: portalPasswordSchema.optional(),
    newDriver: newDriverProfileInputSchema.optional(),
    jalaliYear: jalaliYearSchema,
    jalaliMonth: jalaliMonthSchema,
    explanation: explanationSchema.optional().default(''),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.driverMode === 'existing' && !val.driverId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['driverId'],
        message: 'لطفاً یکی از رانندگان ثبت‌شده را انتخاب کنید.',
      });
    }
    if (val.driverMode === 'new' && !val.newDriver) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newDriver'],
        message: 'اطلاعات راننده جدید الزامی است.',
      });
    }
  });

// --- Workshop Request Flow Schema ---
export const newWorkshopProfileInputSchema = z
  .object({
    workshopName: safePersianNameSchema('نام کارگاه'),
    workshopCode: workshopCodeSchema,
    contactFullName: safePersianNameSchema('نام کارفرما / رابط بیمه'),
    contactNationalId: iranianNationalIdSchema,
    portalPassword: portalPasswordSchema,
  })
  .strict();

export const newInsuredEmployeeInputSchema = z.object({
  fullName: safePersianNameSchema('نام و نام خانوادگی بیمه‌شده جدید'),
  nationalId: iranianNationalIdSchema,
  insuranceNumber: insuranceNumberSchema,
});

export const createWorkshopRequestSchema = z
  .object({
    cardSelection: cardSelectionSchema,
    mobileSelection: mobileSelectionSchema,
    workshopMode: z.enum(['existing', 'new']),
    workshopId: z.string().uuid('شناسه کارگاه نامعتبر است.').optional(),
    initialPortalPassword: portalPasswordSchema.optional(),
    newWorkshop: newWorkshopProfileInputSchema.optional(),
    jalaliYear: jalaliYearSchema,
    jalaliMonth: jalaliMonthSchema,
    explanation: explanationSchema.optional().default(''),
    includeNewEmployee: z.boolean().default(false),
    newEmployee: newInsuredEmployeeInputSchema.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.workshopMode === 'existing' && !val.workshopId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workshopId'],
        message: 'لطفاً یکی از کارگاه‌های ثبت‌شده را انتخاب کنید.',
      });
    }
    if (val.workshopMode === 'new' && !val.newWorkshop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newWorkshop'],
        message: 'اطلاعات کارگاه جدید الزامی است.',
      });
    }
    if (val.includeNewEmployee && !val.newEmployee) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newEmployee'],
        message: 'با فعال بودن گزینه بیمه‌شده جدید، تکمیل مشخصات بیمه‌شده الزامی است.',
      });
    }
  });

// --- Request Detail & Workflow Schemas ---
export const postMessageSchema = z.object({
  body: requiredExplanationSchema,
});

export const requestCancellationSchema = z.object({
  reason: requiredExplanationSchema,
});

export const adminStatusTransitionSchema = z
  .object({
    newStatus: z.enum(REQUEST_STATUSES),
    explanation: explanationSchema.optional().default(''),
    awaitingCustomerInfo: z.boolean().optional(),
    awaitingCustomerInfoNote: explanationSchema.optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (
      (val.newStatus === 'rejected' || val.newStatus === 'cancelled') &&
      (!val.explanation || val.explanation.trim().length < 5)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['explanation'],
        message: 'برای رد یا لغو درخواست، ثبت توضیح روشن برای مشتری الزامی است (حداقل ۵ کاراکتر).',
      });
    }
    if (
      val.newStatus === 'needs_customer_info' &&
      (!val.awaitingCustomerInfoNote || val.awaitingCustomerInfoNote.trim().length < 3) &&
      (!val.explanation || val.explanation.trim().length < 3)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['awaitingCustomerInfoNote'],
        message: 'لطفاً مشخص کنید چه اطلاعات یا مدرکی باید توسط مشتری تکمیل شود.',
      });
    }
  });

export const adminAwaitingInfoSchema = z
  .object({
    awaitingCustomerInfo: z.boolean(),
    note: explanationSchema.optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (val.awaitingCustomerInfo && val.note.trim().length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'لطفاً مورد نیازمند تکمیل توسط مشتری را بنویسید.',
      });
    }
  });

export const paymentCardNumberSchema = z
  .string({ required_error: 'شماره کارت واریز الزامی است.' })
  .transform(numberOnly)
  .refine(isValidCardNumber, 'شماره کارت واریز ۱۶ رقمی یا رقم کنترل آن معتبر نیست.');

export const adminUpdateAmountSchema = z
  .object({
    finalAmount: z
      .union([z.number(), z.string()])
      .refine((v) => String(v).trim().length > 0, 'مبلغ نهایی الزامی است.')
      .transform((v) => Number(normalizeDigits(String(v).replace(/[,٬\s]/g, ''))))
      .refine(
        (n) => Number.isInteger(n) && n >= 0 && n <= 100_000_000_000,
        'مبلغ نهایی باید یک عدد صحیح نامنفی معتبر باشد.',
      ),
    paymentCardNumber: paymentCardNumberSchema,
  })
  .strict();

export const paymentPreviewSchema = z
  .object({
    requestIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, 'درخواست تکراری انتخاب شده است.'),
  })
  .strict();

export const adminCancellationDecisionSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  explanation: z
    .string({ required_error: 'توضیح تصمیم دفتر الزامی است.' })
    .trim()
    .min(5, 'ثبت توضیح تصمیم دفتر درباره درخواست لغو الزامی است (حداقل ۵ کاراکتر).')
    .max(2000),
});

// --- Admin Customer & Profile Management Schemas ---
export const adminCreateCustomerSchema = z
  .object({
    fullName: safePersianNameSchema('نام و نام خانوادگی مشتری'),
    mobile: iranianMobileSchema,
    nationalId: optionalNationalIdSchema,
    phone: z.string().trim().max(30).optional().default(''),
    officeNotes: z.string().trim().max(1000).optional().default(''),
    isActive: z.boolean().default(true),
    initialPasswordMode: z.enum(['national_id', 'generated']).optional(),
  })
  .strict();

export const adminUpdateCustomerSchema = z
  .object({
    fullName: safePersianNameSchema('نام و نام خانوادگی مشتری'),
    mobile: iranianMobileSchema,
    nationalId: optionalNationalIdSchema,
    phone: z.string().trim().max(30).optional().default(''),
    officeNotes: z.string().trim().max(1000).optional().default(''),
    isActive: z.boolean(),
  })
  .strict();

export const adminResetPasswordSchema = z
  .object({
    mode: z.enum(INITIAL_PASSWORD_MODES).exclude(['manual_bootstrap']).optional(),
  })
  .strict();

export const adminUpdateDriverSchema = z
  .object({
    fullName: safePersianNameSchema('نام و نام خانوادگی راننده'),
    nationalId: iranianNationalIdSchema,
    reviewState: z.enum(['confirmed', 'pending_office_review']),
    isArchived: z.boolean(),
  })
  .strict();

export const adminUpdateWorkshopSchema = z
  .object({
    workshopName: safePersianNameSchema('نام کارگاه'),
    workshopCode: workshopCodeSchema,
    contactFullName: safePersianNameSchema('نام کارفرما / رابط بیمه'),
    contactNationalId: iranianNationalIdSchema,
    reviewState: z.enum(['confirmed', 'pending_office_review']),
    isArchived: z.boolean(),
  })
  .strict();

export const adminRequestFilterSchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  requestType: z.enum(REQUEST_TYPES).optional(),
  jalaliYear: jalaliYearSchema.optional(),
  jalaliMonth: jalaliMonthSchema.optional(),
  awaitingInfoOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  incompleteOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['newest_created', 'newest_activity', 'period_desc']).default('newest_created'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(15),
});
