import crypto from 'node:crypto';
import { hash, verify, type Options as Argon2Options } from '@node-rs/argon2';
import { toPersianDigits } from '../../shared/jalali.js';

// Algorithm 2 = Argon2id (normative default in @node-rs/argon2)
const ARGON2_OPTIONS: Argon2Options = {
  algorithm: 2,
  memoryCost: 19456, // 19 MiB (OWASP recommended baseline)
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, candidate: string): Promise<boolean> {
  try {
    return await verify(passwordHash, candidate);
  } catch {
    return false;
  }
}

export function generateSessionToken(): { rawToken: string; tokenHash: string; csrfToken: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const csrfToken = crypto.randomBytes(24).toString('hex');
  return { rawToken, tokenHash, csrfToken };
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates an unambiguous, high-entropy one-time temporary password (12 chars).
 */
export function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!';
  const all = upper + lower + digits + symbols;

  const pick = (charset: string) => charset[crypto.randomInt(0, charset.length)]!;
  const chars = [
    pick(upper),
    pick(upper),
    pick(lower),
    pick(lower),
    pick(digits),
    pick(digits),
    pick(symbols),
  ];
  while (chars.length < 12) {
    chars.push(pick(all));
  }
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join('');
}

/**
 * Generates a non-sequential, non-enumerable human-readable request reference code,
 * e.g. `HB-1405-7K9M2P`.
 */
export function generateRequestReference(jalaliYear: number): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `HB-${jalaliYear}-${suffix}`;
}

/**
 * Sliding-window IP / identifier rate limiter for brute-force protection on login.
 */
export class LoginRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts = 8,
    private readonly windowMs = 10 * 60 * 1000, // 10 minutes
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const cutoff = now - this.windowMs;
    const recent = (this.buckets.get(key) ?? []).filter((ts) => ts > cutoff);
    if (recent.length >= this.maxAttempts) {
      const oldest = recent[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.buckets.set(key, recent);
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordFailure(key: string, now = Date.now()): void {
    const cutoff = now - this.windowMs;
    const recent = (this.buckets.get(key) ?? []).filter((ts) => ts > cutoff);
    recent.push(now);
    this.buckets.set(key, recent);
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  formatLockoutMessage(seconds: number): string {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return `تعداد تلاش‌های ناموفق بیش از حد مجاز بوده است. لطفاً ${toPersianDigits(minutes)} دقیقه دیگر مجدداً تلاش کنید.`;
  }
}
