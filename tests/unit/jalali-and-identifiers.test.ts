import { describe, expect, it } from 'vitest';
import {
  compareJalaliPeriodsDesc,
  dateToJalaliInTimezone,
  formatJalaliPeriod,
  gregorianToJalali,
  isLeapJalaliYear,
  jalaliMonthLength,
  jalaliToGregorian,
  normalizeDigits,
  toPersianDigits,
} from '../../src/shared/jalali.js';
import {
  buildValidNationalIdFromPrefix,
  isValidIranianMobile,
  isValidIranianNationalId,
  maskNationalId,
  normalizeIranianMobile,
} from '../../src/shared/iran-identifiers.js';
import { looksLikePortalPasswordDisclosure } from '../../src/shared/validation.js';
import { loadConfig } from '../../src/server/config.js';

describe('Persian/Jalali Calendar & Digit Utilities', () => {
  it('converts Persian and Arabic-Indic numerals accurately', () => {
    expect(normalizeDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
    expect(normalizeDigits('٠٩١٢٣٤٥٦٧٨٩')).toBe('09123456789');
    expect(toPersianDigits(1405)).toBe('۱۴۰۵');
  });

  it('performs reversible Gregorian <-> Jalali conversions including year boundaries and leap years', () => {
    // 2026-10-24 -> 1405-08-02 (2 Aban 1405)
    const j = gregorianToJalali(2026, 10, 24);
    expect(j).toEqual({ jy: 1405, jm: 8, jd: 2 });
    expect(jalaliToGregorian(1405, 8, 2)).toEqual({ gy: 2026, gm: 10, gd: 24 });

    // Nowruz boundary: 1405/01/01 -> 2026-03-21
    expect(jalaliToGregorian(1405, 1, 1)).toEqual({ gy: 2026, gm: 3, gd: 21 });
    expect(gregorianToJalali(2026, 3, 20)).toEqual({ jy: 1404, jm: 12, jd: 29 });

    // Leap year check (1403 was leap -> Esfand 30 days; 1404 non-leap -> Esfand 29 days)
    expect(isLeapJalaliYear(1403)).toBe(true);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(isLeapJalaliYear(1404)).toBe(false);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });

  it('extracts Jalali date in Asia/Tehran timezone accurately', () => {
    const dt = new Date('2026-10-24T10:30:00Z');
    const tehran = dateToJalaliInTimezone(dt, 'Asia/Tehran');
    expect(tehran.jy).toBe(1405);
    expect(tehran.jm).toBe(8);
    expect(tehran.jd).toBe(2);
    expect(formatJalaliPeriod(1405, 8)).toBe('آبان ۱۴۰۵');
  });

  it('sorts insurance periods newest-first across year boundaries', () => {
    const periods = [
      { jalaliYear: 1404, jalaliMonth: 12 },
      { jalaliYear: 1405, jalaliMonth: 1 },
      { jalaliYear: 1405, jalaliMonth: 11 },
      { jalaliYear: 1404, jalaliMonth: 6 },
    ];
    const sorted = [...periods].sort(compareJalaliPeriodsDesc);
    expect(sorted).toEqual([
      { jalaliYear: 1405, jalaliMonth: 11 },
      { jalaliYear: 1405, jalaliMonth: 1 },
      { jalaliYear: 1404, jalaliMonth: 12 },
      { jalaliYear: 1404, jalaliMonth: 6 },
    ]);
  });
});

describe('Iranian Mobile, National ID & Portal Credential Guards', () => {
  it('normalizes valid Iranian mobile numbers and rejects invalid ones', () => {
    expect(normalizeIranianMobile('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBe('09123456789');
    expect(normalizeIranianMobile('+989123456789')).toBe('09123456789');
    expect(normalizeIranianMobile('00989351112233')).toBe('09351112233');
    expect(normalizeIranianMobile('9123456789')).toBe('09123456789');
    expect(isValidIranianMobile('02188776655')).toBe(false);
    expect(isValidIranianMobile('0912345')).toBe(false);
  });

  it('validates Iranian 10-digit National ID checksum and masks properly', () => {
    const valid = buildValidNationalIdFromPrefix('001234567');
    expect(isValidIranianNationalId(valid)).toBe(true);
    expect(isValidIranianNationalId(toPersianDigits(valid))).toBe(true);

    // Flip last digit -> invalid checksum
    const wrongCheck = `${valid.slice(0, 9)}${(Number(valid[9]) + 1) % 10}`;
    expect(isValidIranianNationalId(wrongCheck)).toBe(false);

    // Reject repeated digits
    expect(isValidIranianNationalId('1111111111')).toBe(false);
    expect(isValidIranianNationalId('0000000000')).toBe(false);

    // Masking hides middle 4 digits
    const masked = maskNationalId(valid, false);
    expect(masked).toContain('••••');
    expect(masked).not.toContain(valid.slice(3, 7));
  });

  it('detects accidental es.tamin.ir password disclosures in free text', () => {
    expect(looksLikePortalPasswordDisclosure('رمز تامین اجتماعی: 123456')).toBe(true);
    expect(looksLikePortalPasswordDisclosure('es.tamin.ir: MyPass')).toBe(true);
    expect(looksLikePortalPasswordDisclosure('لطفاً لیست مهرماه ارسال شود.')).toBe(false);
  });

  it('defaults onboarding to generated temporary passwords and rejects unsupported file/antivirus settings', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).initialPasswordMode).toBe('generated');

    expect(() =>
      loadConfig({ NODE_ENV: 'test', ALLOWED_UPLOAD_MIMES: 'application/pdf,image/svg+xml' }),
    ).toThrow(/ALLOWED_UPLOAD_MIMES/);

    expect(() =>
      loadConfig({ NODE_ENV: 'test', ANTIVIRUS_MODE: 'clamav_command' }),
    ).toThrow(/Antivirus scanning is not implemented/);

    expect(() => loadConfig({ NODE_ENV: 'test', MAX_UPLOAD_MB: 'not-a-number' })).toThrow(
      /MAX_UPLOAD_MB/,
    );
    expect(() => loadConfig({ NODE_ENV: 'test', PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadConfig({ NODE_ENV: 'test', CURRENCY_UNIT: 'EURO' })).toThrow(
      /CURRENCY_UNIT/,
    );
  });

  it('enforces fail-fast production security config checks', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'short',
      }),
    ).toThrow(/SESSION_SECRET/);

    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a_very_strong_random_production_secret_value_123456',
        PREVIEW_IFRAME_COMPAT: 'true',
      }),
    ).toThrow(/PREVIEW_IFRAME_COMPAT/);

    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a_very_strong_random_production_secret_value_123456',
        PRIVATE_STORAGE_DIR: './dist/client/uploads',
      }),
    ).toThrow(/PRIVATE_STORAGE_DIR/);

    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a_very_strong_random_production_secret_value_123456',
        PRIVATE_STORAGE_DIR: './dist/client-backup/uploads',
      }),
    ).not.toThrow();
  });
});
