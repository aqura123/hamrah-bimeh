import path from 'node:path';
import dotenv from 'dotenv';
import { CURRENCY_UNITS, type CurrencyUnit, type InitialPasswordMode } from '../shared/domain.js';

dotenv.config();

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databaseUrl: string;
  sessionSecret: string;
  sessionTtlHours: number;
  previewIframeCompat: boolean;
  frameAncestors: string;
  businessTimezone: string;
  currencyUnit: CurrencyUnit;
  initialPasswordMode: Exclude<InitialPasswordMode, 'manual_bootstrap'>;
  incompleteAlertHours: number;
  privateStorageDir: string;
  maxUploadBytes: number;
  maxUploadMb: number;
  allowedUploadMimes: readonly string[];
  antivirusMode: 'disabled';
  publicOfficeContact: {
    title: string;
    address: string | null;
    phone: string | null;
    workingHours: string | null;
    mapNote: string | null;
  };
}

const INSECURE_SECRETS = new Set([
  '',
  'changeme',
  'secret',
  'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARS_IN_PRODUCTION',
  'dev_sandbox_only_secret_9f8e7d6c5b4a3210_hamrah_bimeh_2026',
]);

function readFiniteNumber(name: string, rawValue: string | undefined, fallback: number): number {
  const normalized = rawValue?.trim();
  if (!normalized) return fallback;
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`CONFIG ERROR: ${name} must be a valid finite number.`);
  }
  return value;
}

function isWithinOrEqual(candidatePath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawEnv = env.NODE_ENV ?? 'development';
  const nodeEnv: AppConfig['nodeEnv'] =
    rawEnv === 'production' || rawEnv === 'test' || rawEnv === 'development'
      ? rawEnv
      : 'development';

  const port = readFiniteNumber('PORT', env.PORT, 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CONFIG ERROR: PORT must be an integer between 1 and 65535.');
  }
  const host = env.HOST ?? '0.0.0.0';
  const databaseUrl = env.DATABASE_URL ?? 'pglite://./storage/pgdata';
  const sessionSecret =
    env.SESSION_SECRET ??
    (nodeEnv === 'test' ? 'test_only_session_secret_0123456789abcdef0123456789abcdef' : '');
  const sessionTtlHours = Math.max(
    1,
    Math.min(168, readFiniteNumber('SESSION_TTL_HOURS', env.SESSION_TTL_HOURS, 12)),
  );
  const previewIframeCompat = env.PREVIEW_IFRAME_COMPAT === 'true';
  const frameAncestors = (env.FRAME_ANCESTORS ?? "'none'").trim();

  const businessTimezone = env.BUSINESS_TIMEZONE ?? 'Asia/Tehran';
  const rawCurrency = (env.CURRENCY_UNIT ?? 'TOMAN').trim().toUpperCase();
  if (!(CURRENCY_UNITS as readonly string[]).includes(rawCurrency)) {
    throw new Error('CONFIG ERROR: CURRENCY_UNIT must be either TOMAN or RIAL.');
  }
  const currencyUnit = rawCurrency as CurrencyUnit;

  const rawInitialMode = env.INITIAL_PASSWORD_MODE ?? 'generated';
  if (rawInitialMode !== 'generated' && rawInitialMode !== 'national_id') {
    throw new Error(
      'CONFIG ERROR: INITIAL_PASSWORD_MODE must be either generated or national_id.',
    );
  }
  const initialPasswordMode: AppConfig['initialPasswordMode'] = rawInitialMode;

  const incompleteAlertHours = Math.max(
    1,
    readFiniteNumber('INCOMPLETE_ALERT_HOURS', env.INCOMPLETE_ALERT_HOURS, 72),
  );

  const privateStorageDir = path.resolve(env.PRIVATE_STORAGE_DIR ?? './storage/uploads');
  const maxUploadMb = Math.max(
    1,
    Math.min(50, readFiniteNumber('MAX_UPLOAD_MB', env.MAX_UPLOAD_MB, 10)),
  );
  const maxUploadBytes = maxUploadMb * 1024 * 1024;

  const supportedUploadMimes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ] as const;
  const allowedUploadMimes = (
    env.ALLOWED_UPLOAD_MIMES ?? 'application/pdf,image/jpeg,image/png,image/webp'
  )
    .split(',')
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  const unsupportedUploadMimes = allowedUploadMimes.filter(
    (mime) => !(supportedUploadMimes as readonly string[]).includes(mime),
  );
  if (allowedUploadMimes.length === 0 || unsupportedUploadMimes.length > 0) {
    throw new Error(
      'CONFIG ERROR: ALLOWED_UPLOAD_MIMES must contain only supported types: application/pdf, image/jpeg, image/png, image/webp.',
    );
  }

  // File scanning is not implemented in this version. Never imply that setting an
  // environment flag enables antivirus scanning when no scanner is actually run.
  if (env.ANTIVIRUS_MODE && env.ANTIVIRUS_MODE !== 'disabled') {
    throw new Error(
      'CONFIG ERROR: Antivirus scanning is not implemented in this version. Keep ANTIVIRUS_MODE=disabled until scanner integration is added and tested.',
    );
  }
  const antivirusMode: AppConfig['antivirusMode'] = 'disabled';

  // Production Fail-Fast Safety Checks
  if (nodeEnv === 'production') {
    if (sessionSecret.length < 32 || INSECURE_SECRETS.has(sessionSecret)) {
      throw new Error(
        'FATAL SECURITY CONFIG: SESSION_SECRET must be set to a unique random secret (>= 32 chars) in production.',
      );
    }
    const publicClientDir = path.resolve('./dist/client');
    const publicStaticDir = path.resolve('./public');
    if (
      isWithinOrEqual(privateStorageDir, publicClientDir) ||
      isWithinOrEqual(privateStorageDir, publicStaticDir)
    ) {
      throw new Error(
        'FATAL SECURITY CONFIG: PRIVATE_STORAGE_DIR cannot be inside a public static directory.',
      );
    }
    if (previewIframeCompat) {
      throw new Error(
        'FATAL SECURITY CONFIG: PREVIEW_IFRAME_COMPAT must be false in production deployments.',
      );
    }
  }

  const cleanOptional = (val: string | undefined): string | null => {
    const trimmed = (val ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    nodeEnv,
    port,
    host,
    databaseUrl,
    sessionSecret,
    sessionTtlHours,
    previewIframeCompat,
    frameAncestors,
    businessTimezone,
    currencyUnit,
    initialPasswordMode,
    incompleteAlertHours,
    privateStorageDir,
    maxUploadMb,
    maxUploadBytes,
    allowedUploadMimes,
    antivirusMode,
    publicOfficeContact: {
      title: cleanOptional(env.PUBLIC_OFFICE_TITLE) ?? 'دفتر خدمات بیمه‌ای همراه بیمه',
      address: cleanOptional(env.PUBLIC_OFFICE_ADDRESS),
      phone: cleanOptional(env.PUBLIC_OFFICE_PHONE),
      workingHours: cleanOptional(env.PUBLIC_OFFICE_WORKING_HOURS),
      mapNote: cleanOptional(env.PUBLIC_OFFICE_MAP_NOTE),
    },
  };
}
