import { normalizeDigits, toPersianDigits } from './jalali.js';

const INVISIBLE_BIDI_MARKS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function stripInvisibleBidiMarks(raw: string): string {
  return raw.replace(INVISIBLE_BIDI_MARKS, '');
}

/**
 * Normalizes an Iranian mobile phone number to canonical `09XXXXXXXXX` (11 ASCII digits).
 * Accepts `09123456789`, `+989123456789`, `00989123456789`, or `9123456789`,
 * as well as Persian/Arabic digits, BiDi copy-paste marks, and spaces/dashes.
 * Returns `null` if invalid.
 */
export function normalizeIranianMobile(raw: string): string | null {
  const cleaned = normalizeDigits(stripInvisibleBidiMarks(raw)).replace(/[\s\-().]/g, '');
  let normalized = cleaned;
  if (normalized.startsWith('+98')) {
    normalized = `0${normalized.slice(3)}`;
  } else if (normalized.startsWith('0098')) {
    normalized = `0${normalized.slice(4)}`;
  } else if (/^9\d{9}$/.test(normalized)) {
    normalized = `0${normalized}`;
  }

  if (!/^09\d{9}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function isValidIranianMobile(raw: string): boolean {
  return normalizeIranianMobile(raw) !== null;
}

/**
 * Normalizes an Iranian 10-digit National ID (کد ملی) to ASCII digits.
 */
export function normalizeNationalId(raw: string): string {
  return normalizeDigits(stripInvisibleBidiMarks(raw)).replace(/[\s-]/g, '');
}

/**
 * Validates an Iranian 10-digit National ID using the official modulo-11 checksum.
 * Rejects repeated-digit sequences like `0000000000` or `1111111111`.
 */
export function isValidIranianNationalId(raw: string): boolean {
  const code = normalizeNationalId(raw);
  if (!/^\d{10}$/.test(code)) {
    return false;
  }
  if (/^(\d)\1{9}$/.test(code)) {
    return false;
  }

  const check = Number(code[9]);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(code[i]) * (10 - i);
  }
  const remainder = sum % 11;
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

/**
 * Computes a valid 10-digit Iranian National ID from a 9-digit prefix (for test fixtures).
 */
export function buildValidNationalIdFromPrefix(nineDigitPrefix: string): string {
  const prefix = normalizeDigits(nineDigitPrefix);
  if (!/^\d{9}$/.test(prefix) || /^(\d)\1{8}$/.test(prefix)) {
    throw new Error('Prefix must be 9 non-identical digits');
  }
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(prefix[i]) * (10 - i);
  }
  const r = sum % 11;
  const check = r < 2 ? r : 11 - r;
  return `${prefix}${check}`;
}

/**
 * Masks an Iranian National ID so lists, logs, and timelines never reveal the full value.
 * Example: `0012345678` -> `۰۰۱••••۶۷۸`
 */
export function maskNationalId(nid: string | null | undefined, persianDigits = true): string {
  if (!nid) return '—';
  const clean = normalizeNationalId(nid);
  if (clean.length < 6) return '••••••••••';
  const masked = `${clean.slice(0, 3)}••••${clean.slice(-3)}`;
  return persianDigits ? toPersianDigits(masked) : masked;
}

export function formatMobileDisplay(mobile: string): string {
  const clean = normalizeIranianMobile(mobile) ?? mobile;
  if (clean.length === 11) {
    return toPersianDigits(`${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`);
  }
  return toPersianDigits(clean);
}
