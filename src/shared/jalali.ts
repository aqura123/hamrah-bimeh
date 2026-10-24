/**
 * Persian (Jalali / Solar Hijri) calendar utilities and Persian numeral helpers.
 *
 * Server storage policy:
 * - Timestamps are stored as UTC `TIMESTAMPTZ` in PostgreSQL and formatted for
 *   users in the configured business timezone (default `Asia/Tehran`).
 * - Insurance periods are stored as explicit `(jalali_year, jalali_month)` integers
 *   with `calendar_system = 'jalali'` (1 = فروردین ... 12 = اسفند), never as ambiguous strings.
 */

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

export const JALALI_MONTH_NAMES: readonly string[] = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export interface JalaliPeriod {
  jalaliYear: number;
  jalaliMonth: number;
}

/**
 * Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII (0-9).
 */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
}

/**
 * Converts ASCII digits (0-9) inside a string or number to Persian digits (۰-۹).
 */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b;
}

/**
 * Borkowski's calendar algorithm (same mathematical basis as jalaali-js)
 * for accurate Jalali leap-year & Gregorian equivalence across centuries.
 */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
    2456, 3178,
  ];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0]!;

  if (jy < jp || jy >= breaks[bl - 1]!) {
    throw new RangeError(`Invalid Jalali year: ${jy}`);
  }

  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i]!;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) {
    leapJ += 1;
  }

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) {
    n = n - jump + div(jump + 4, 33) * 33;
  }
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) {
    leap = 4;
  }

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm < 1 || jm > 12) {
    throw new RangeError(`Invalid Jalali month: ${jm}`);
  }
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

export function isValidJalaliDate(jy: number, jm: number, jd: number): boolean {
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) return false;
  if (jy < 1300 || jy > 1500) return false;
  if (jm < 1 || jm > 12) return false;
  if (jd < 1 || jd > jalaliMonthLength(jy, jm)) return false;
  return true;
}

export function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number,
): {
  gy: number;
  gm: number;
  gd: number;
} {
  const { gy, march } = jalCal(jy);
  const jdn1f = g2d(gy, 3, march);
  const k = (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  return d2g(jdn1f + k);
}

export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const jdn = g2d(gy, gm, gd);
  const gyBase = d2g(jdn).gy;
  let jy = gyBase - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gyBase, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + div(k, 31);
      const jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  const jm = 7 + div(k, 30);
  const jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

/**
 * Extracts Gregorian parts in the configured business timezone and converts to Jalali.
 */
export function dateToJalaliInTimezone(
  input: Date | string,
  timeZone = 'Asia/Tehran',
): JalaliDate & { hour: number; minute: number } {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) {
    throw new RangeError('Invalid Date passed to dateToJalaliInTimezone');
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const val = parts.find((p) => p.type === type)?.value ?? '0';
    return Number(val);
  };

  const gy = lookup('year');
  const gm = lookup('month');
  const gd = lookup('day');
  const rawHour = lookup('hour');
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = lookup('minute');

  const jalali = gregorianToJalali(gy, gm, gd);
  return { ...jalali, hour, minute };
}

export function getCurrentJalaliPeriod(
  now: Date = new Date(),
  timeZone = 'Asia/Tehran',
): JalaliPeriod {
  const { jy, jm } = dateToJalaliInTimezone(now, timeZone);
  return { jalaliYear: jy, jalaliMonth: jm };
}

export function getJalaliMonthName(month: number): string {
  const name = JALALI_MONTH_NAMES[month - 1];
  if (!name) {
    throw new RangeError(`Invalid Jalali month index: ${month}`);
  }
  return name;
}

export function formatJalaliPeriod(year: number, month: number): string {
  const monthName = JALALI_MONTH_NAMES[month - 1] ?? String(month);
  return `${monthName} ${toPersianDigits(year)}`;
}

export function formatJalaliPeriodNumeric(year: number, month: number): string {
  const padded = String(month).padStart(2, '0');
  return toPersianDigits(`${year}/${padded}`);
}

export function formatJalaliDate(
  input: Date | string | null | undefined,
  timeZone = 'Asia/Tehran',
): string {
  if (!input) return '—';
  const { jy, jm, jd } = dateToJalaliInTimezone(input, timeZone);
  const monthName = JALALI_MONTH_NAMES[jm - 1] ?? String(jm);
  return `${toPersianDigits(jd)} ${monthName} ${toPersianDigits(jy)}`;
}

export function formatJalaliDateTime(
  input: Date | string | null | undefined,
  timeZone = 'Asia/Tehran',
): string {
  if (!input) return '—';
  const { jy, jm, jd, hour, minute } = dateToJalaliInTimezone(input, timeZone);
  const datePart = `${toPersianDigits(jy)}/${toPersianDigits(String(jm).padStart(2, '0'))}/${toPersianDigits(String(jd).padStart(2, '0'))}`;
  const timePart = `${toPersianDigits(String(hour).padStart(2, '0'))}:${toPersianDigits(String(minute).padStart(2, '0'))}`;
  return `${datePart} — ساعت ${timePart}`;
}

/**
 * Compares two Jalali periods newest-first (descending):
 * returns negative if `a` is newer than `b`, positive if `b` is newer than `a`, 0 if equal.
 */
export function compareJalaliPeriodsDesc(a: JalaliPeriod, b: JalaliPeriod): number {
  if (a.jalaliYear !== b.jalaliYear) {
    return b.jalaliYear - a.jalaliYear;
  }
  return b.jalaliMonth - a.jalaliMonth;
}
