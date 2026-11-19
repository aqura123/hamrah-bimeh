/**
 * Privacy-preserving structured logger.
 * Strips passwords, session tokens, storage keys, message bodies, and masks 10-digit national IDs.
 */

const REDACTED_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'passwordhash',
  'portalpassword',
  'initialportalpassword',
  'portalpasswordencrypted',
  'portal_password_encrypted',
  'portalcredentialkey',
  'portal_credential_key',
  'password_hash',
  'temporarypassword',
  'token',
  'tokenhash',
  'token_hash',
  'csrftoken',
  'csrf_token',
  'cookie',
  'authorization',
  'nationalid',
  'national_id',
  'contactnationalid',
  'contact_national_id',
  'storagekey',
  'storage_key',
  'body',
  'explanation',
  'buffer',
  'cardnumber',
  'paymentcardnumber',
  'payment_card_number',
  'number',
  'cvv2',
  'encrypteddata',
  'cardencryptionkey',
  'payload',
]);

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[Truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Mask standalone 10-digit sequences that could be Iranian National IDs
    return value
      .replace(/\b\d{13,19}\b/g, '[CARD-REDACTED]')
      .replace(/\b(\d{3})\d{4}(\d{3})\b/g, '$1****$2');
  }
  if (typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return `[Buffer ${value.byteLength} bytes]`;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeForLog(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = sanitizeForLog(v, depth + 1);
    }
  }
  return out;
}

export const logger = {
  info(event: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'test') return;
    console.log(
      JSON.stringify({
        level: 'info',
        ts: new Date().toISOString(),
        event,
        ...(meta ? { meta: sanitizeForLog(meta) } : {}),
      }),
    );
  },
  warn(event: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'test') return;
    console.warn(
      JSON.stringify({
        level: 'warn',
        ts: new Date().toISOString(),
        event,
        ...(meta ? { meta: sanitizeForLog(meta) } : {}),
      }),
    );
  },
  error(event: string, err?: unknown, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'test') return;
    const errMsg = err instanceof Error ? err.message : String(err ?? '');
    console.error(
      JSON.stringify({
        level: 'error',
        ts: new Date().toISOString(),
        event,
        error: sanitizeForLog(errMsg),
        ...(meta ? { meta: sanitizeForLog(meta) } : {}),
      }),
    );
  },
};
