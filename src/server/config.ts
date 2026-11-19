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
  cardEncryptionKey: string;
  portalCredentialKey: string;
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
  /* antivirusMode: 'disabled' | 'clamav_command'; */
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawEnv = env.NODE_ENV ?? 'development';
  const nodeEnv: AppConfig['nodeEnv'] =
    rawEnv === 'production' || rawEnv === 'test' ? rawEnv : 'development';

  const port = Number(env.PORT ?? 3000);
  const host = env.HOST ?? '0.0.0.0';
  const databaseUrl = env.DATABASE_URL ?? 'pglite://./storage/pgdata';
  const sessionSecret =
    env.SESSION_SECRET ??
    (nodeEnv === 'test' ? 'test_only_session_secret_0123456789abcdef0123456789abcdef' : '');
  const cardEncryptionKey = env.CARD_ENCRYPTION_KEY ?? (nodeEnv === 'test' ? 'a'.repeat(64) : '');
  const portalCredentialKey =
    env.PORTAL_CREDENTIAL_KEY ?? (nodeEnv === 'test' ? 'b'.repeat(64) : '');
  const sessionTtlHours = Math.max(1, Math.min(168, Number(env.SESSION_TTL_HOURS ?? 12)));
  const previewIframeCompat = env.PREVIEW_IFRAME_COMPAT === 'true';
  const frameAncestors = (env.FRAME_ANCESTORS ?? "'none'").trim();

  const businessTimezone = env.BUSINESS_TIMEZONE ?? 'Asia/Tehran';
  const rawCurrency = (env.CURRENCY_UNIT ?? 'TOMAN').toUpperCase();
  const currencyUnit: CurrencyUnit = (CURRENCY_UNITS as readonly string[]).includes(rawCurrency)
    ? (rawCurrency as CurrencyUnit)
    : 'TOMAN';

  const rawInitialMode = env.INITIAL_PASSWORD_MODE ?? 'national_id';
  const initialPasswordMode: AppConfig['initialPasswordMode'] =
    rawInitialMode === 'generated' ? 'generated' : 'national_id';

  const incompleteAlertHours = Math.max(1, Number(env.INCOMPLETE_ALERT_HOURS ?? 72));

  const privateStorageDir = path.resolve(env.PRIVATE_STORAGE_DIR ?? './storage/uploads');
  const maxUploadMb = Math.max(1, Math.min(50, Number(env.MAX_UPLOAD_MB ?? 10)));
  const maxUploadBytes = maxUploadMb * 1024 * 1024;

  const allowedUploadMimes = (
    env.ALLOWED_UPLOAD_MIMES ?? 'application/pdf,image/jpeg,image/png,image/webp'
  )
    .split(',')
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);

  /* const antivirusMode = env.ANTIVIRUS_MODE === 'clamav_command' ? 'clamav_command' : 'disabled'; */

  const rawAntivirusMode = (env.ANTIVIRUS_MODE ?? 'disabled').trim() || 'disabled';
    if (rawAntivirusMode !== 'disabled') {
      throw new Error(
        'CONFIG ERROR: Antivirus scanning is not implemented. Keep ANTIVIRUS_MODE=disabled until scanner integration is added and tested.',
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
      privateStorageDir.startsWith(publicClientDir) ||
      privateStorageDir.startsWith(publicStaticDir)
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
    if (!/^[0-9a-fA-F]{64}$/.test(cardEncryptionKey) || /^(.)\1{63}$/.test(cardEncryptionKey)) {
      throw new Error(
        'FATAL SECURITY CONFIG: CARD_ENCRYPTION_KEY must be 32 random bytes in hexadecimal.',
      );
    }
    if (
      !/^[0-9a-fA-F]{64}$/.test(portalCredentialKey) ||
      /^(.)\1{63}$/.test(portalCredentialKey) ||
      portalCredentialKey.toLowerCase() === cardEncryptionKey.toLowerCase()
    ) {
      throw new Error(
        'FATAL SECURITY CONFIG: PORTAL_CREDENTIAL_KEY must be an independent 32-byte random hex key.',
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
    cardEncryptionKey,
    portalCredentialKey,
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
