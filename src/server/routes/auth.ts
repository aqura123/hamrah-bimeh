import { and, eq, ne } from 'drizzle-orm';
import { Router } from 'express';
import { maskNationalId } from '../../shared/iran-identifiers.js';
import { normalizeDigits } from '../../shared/jalali.js';
import { changePasswordInputSchema, loginInputSchema } from '../../shared/validation.js';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import { customers, sessions, users } from '../db/schema.js';
import { logger } from '../logger.js';
import { buildSessionCookieOptions, requireAuth, SESSION_COOKIE_NAME } from '../middleware/auth.js';
import { recordAuditEvent } from '../services/audit.js';
import {
  generateSessionToken,
  hashPassword,
  LoginRateLimiter,
  verifyPassword,
} from '../services/security.js';
import { asyncHandler, formatZodError } from './helpers.js';

// Precomputed dummy Argon2id hash to equalize timing when a username does not exist
let DUMMY_HASH_PROMISE: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  if (!DUMMY_HASH_PROMISE) {
    DUMMY_HASH_PROMISE = hashPassword('dummy-constant-time-guard-password');
  }
  return DUMMY_HASH_PROMISE;
}

const GENERIC_LOGIN_ERROR = 'شماره همراه یا رمز عبور نادرست است.';

export function createAuthRouter(
  db: AppDb,
  config: AppConfig,
  rateLimiter: LoginRateLimiter,
): Router {
  const router = Router();

  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      if (!req.auth) {
        return res.json({ authenticated: false });
      }

      const { user, session, customer } = req.auth;

      return res.json({
        authenticated: true,
        csrfToken: session.csrfToken,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          forcePasswordChange: user.forcePasswordChange,
        },
        customer: customer
          ? {
              id: customer.id,
              fullName: customer.fullName,
              mobile: customer.mobile,
              maskedNationalId: maskNationalId(customer.nationalId),
              phone: customer.phone ?? null,
            }
          : null,
      });
    }),
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'local')
        .split(',')[0]!
        .trim();

      const ipCheck = rateLimiter.check(`ip:${ip}`);

      if (!ipCheck.allowed) {
        res.setHeader('Retry-After', String(ipCheck.retryAfterSeconds));
        return res.status(429).json({
          error: rateLimiter.formatLockoutMessage(ipCheck.retryAfterSeconds),
          code: 'RATE_LIMITED',
        });
      }

      const parsed = loginInputSchema.safeParse(req.body);

      if (!parsed.success) {
        rateLimiter.recordFailure(`ip:${ip}`);
        return res.status(400).json(formatZodError(parsed.error));
      }

      const { mobile, password } = parsed.data;
      const userCheck = rateLimiter.check(`user:${mobile}`);

      if (!userCheck.allowed) {
        res.setHeader('Retry-After', String(userCheck.retryAfterSeconds));
        return res.status(429).json({
          error: rateLimiter.formatLockoutMessage(userCheck.retryAfterSeconds),
          code: 'RATE_LIMITED',
        });
      }

      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.username, mobile))
        .limit(1);

      if (!userRow) {
        await verifyPassword(await getDummyHash(), password);
        rateLimiter.recordFailure(`ip:${ip}`);
        rateLimiter.recordFailure(`user:${mobile}`);
        return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
      }

      const now = new Date();

      if (userRow.lockedUntil && userRow.lockedUntil > now) {
        const remainingSec = Math.ceil(
          (userRow.lockedUntil.getTime() - now.getTime()) / 1000,
        );

        return res.status(429).json({
          error: rateLimiter.formatLockoutMessage(remainingSec),
          code: 'ACCOUNT_LOCKED',
        });
      }

      const validPassword = await verifyPassword(userRow.passwordHash, password);

      if (!validPassword || !userRow.isActive) {
        rateLimiter.recordFailure(`ip:${ip}`);
        rateLimiter.recordFailure(`user:${mobile}`);

        const nextFailCount = userRow.failedLoginCount + 1;
        const shouldLock = nextFailCount >= 6;

        await db
          .update(users)
          .set({
            failedLoginCount: nextFailCount,
            lockedUntil: shouldLock ? new Date(now.getTime() + 10 * 60 * 1000) : null,
            updatedAt: now,
          })
          .where(eq(users.id, userRow.id));

        logger.warn('auth.login.failed', { userId: userRow.id, ip });

        return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
      }

      // Check customer profile is active if role === 'customer'
      let customerRow: typeof customers.$inferSelect | null = null;

      if (userRow.role === 'customer') {
        const [cust] = await db
          .select()
          .from(customers)
          .where(eq(customers.userId, userRow.id))
          .limit(1);

        if (!cust || !cust.isActive) {
          logger.warn('auth.login.inactive_customer', { userId: userRow.id });
          return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
        }

        customerRow = cust;
      }

      rateLimiter.reset(`user:${mobile}`);

      const { rawToken, tokenHash, csrfToken } = generateSessionToken();
      const expiresAt = new Date(now.getTime() + config.sessionTtlHours * 60 * 60 * 1000);

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: now,
            updatedAt: now,
          })
          .where(eq(users.id, userRow.id));

        await tx.insert(sessions).values({
          userId: userRow.id,
          tokenHash,
          csrfToken,
          ipAddress: ip.slice(0, 64),
          userAgent: String(req.headers['user-agent'] ?? '').slice(0, 255),
          expiresAt,
        });
      });

      res.cookie(SESSION_COOKIE_NAME, rawToken, buildSessionCookieOptions(req, config));

      return res.json({
        authenticated: true,
        csrfToken,
        ...(config.previewIframeCompat ? { previewSessionToken: rawToken } : {}),
        user: {
          id: userRow.id,
          username: userRow.username,
          displayName: userRow.displayName,
          role: userRow.role,
          forcePasswordChange: userRow.forcePasswordChange,
        },
        customer: customerRow
          ? {
              id: customerRow.id,
              fullName: customerRow.fullName,
              mobile: customerRow.mobile,
              maskedNationalId: maskNationalId(customerRow.nationalId),
              phone: customerRow.phone ?? null,
            }
          : null,
      });
    }),
  );

  router.post(
    '/logout',
    requireAuth({ allowPasswordChangeGate: true }),
    asyncHandler(async (req, res) => {
      if (req.auth) {
        await db.delete(sessions).where(eq(sessions.id, req.auth.session.id));
      }

      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });

      if (config.previewIframeCompat) {
        res.clearCookie(SESSION_COOKIE_NAME, {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          partitioned: true,
        });
      }

      return res.json({ ok: true });
    }),
  );

  router.post(
    '/change-password',
    requireAuth({ allowPasswordChangeGate: true }),
    asyncHandler(async (req, res) => {
      const parsed = changePasswordInputSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const auth = req.auth!;
      const { currentPassword, newPassword } = parsed.data;

      const matchesCurrent = await verifyPassword(auth.user.passwordHash, currentPassword);

      if (!matchesCurrent) {
        return res.status(400).json({
          error: 'رمز عبور فعلی نادرست است.',
          fieldErrors: { currentPassword: 'رمز عبور فعلی نادرست است.' },
        });
      }

      // رمز جدید می‌تواند با شماره همراه یا کد ملی یکسان باشد.
      // بررسی حداقل طول و تطابق تکرار رمز در changePasswordInputSchema انجام می‌شود.
      const newHash = await hashPassword(newPassword);
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            passwordHash: newHash,
            forcePasswordChange: false,
            passwordChangedAt: now,
            updatedAt: now,
          })
          .where(eq(users.id, auth.user.id));

        // Revoke any other active sessions for this user
        await tx
          .delete(sessions)
          .where(and(eq(sessions.userId, auth.user.id), ne(sessions.id, auth.session.id)));

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: auth.user.id,
          actorRole: auth.user.role,
          entityType: 'user',
          entityId: auth.user.id,
          eventType: 'auth.password_changed',
          customerVisible: false,
          summaryFa: 'رمز عبور حساب کاربری توسط کاربر تغییر یافت.',
        });
      });

      return res.json({
        ok: true,
        forcePasswordChange: false,
      });
    }),
  );

  return router;
}
