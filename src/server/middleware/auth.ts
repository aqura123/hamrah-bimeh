import crypto from 'node:crypto';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import { customers, sessions, users } from '../db/schema.js';
import { hashSessionToken } from '../services/security.js';

export const SESSION_COOKIE_NAME = 'hb_session';

export interface AuthenticatedContext {
  user: typeof users.$inferSelect;
  session: typeof sessions.$inferSelect;
  customer: typeof customers.$inferSelect | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth: AuthenticatedContext | null;
    }
  }
}

export function buildSessionCookieOptions(req: Request, config: AppConfig) {
  const originHeader = String(req.headers.origin ?? '');
  const refererHeader = String(req.headers.referer ?? '');
  const forwardedHost = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '');
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    originHeader.startsWith('https://') ||
    refererHeader.startsWith('https://') ||
    forwardedHost.includes('.e2b.app') ||
    config.nodeEnv === 'production';

  const maxAgeMs = config.sessionTtlHours * 60 * 60 * 1000;

  if (config.previewIframeCompat && isHttps) {
    // Cross-site preview iframe compatibility (CHIPS Partitioned + HttpOnly + Secure)
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      partitioned: true,
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeMs,
  };
}

/**
 * Extracts all plausible session tokens from headers (in preview-compat mode)
 * and all `hb_session` cookies so a stale unpartitioned cookie can never shadow
 * a fresh partitioned cookie or preview session header.
 */
function extractCandidateSessionTokens(req: Request, config: AppConfig): string[] {
  const candidates: string[] = [];
  const pushUnique = (val: unknown) => {
    if (typeof val !== 'string') return;
    const trimmed = val.trim();
    if (trimmed.length >= 32 && trimmed.length <= 256 && !candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  if (config.previewIframeCompat) {
    const customSessionHeader = req.headers['x-session-token'];
    if (typeof customSessionHeader === 'string') {
      pushUnique(customSessionHeader);
    }

    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      pushUnique(authHeader.slice('Bearer '.length));
    }
  }

  // Parse ALL occurrences of `hb_session=...` from raw Cookie header (handles duplicate unpartitioned + Partitioned cookies)
  const rawCookieHeader = req.headers.cookie;
  if (typeof rawCookieHeader === 'string' && rawCookieHeader.length > 0) {
    const parts = rawCookieHeader.split(';');
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const part = parts[i]!.trim();
      const eqIdx = part.indexOf('=');
      if (eqIdx > 0) {
        const name = part.slice(0, eqIdx).trim();
        if (name === SESSION_COOKIE_NAME) {
          try {
            pushUnique(decodeURIComponent(part.slice(eqIdx + 1).trim()));
          } catch {
            pushUnique(part.slice(eqIdx + 1).trim());
          }
        }
      }
    }
  }

  pushUnique(req.cookies?.[SESSION_COOKIE_NAME]);

  return candidates.slice(0, 6);
}

export function createSessionLoaderMiddleware(db: AppDb, config: AppConfig) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    req.auth = null;
    try {
      const rawTokens = extractCandidateSessionTokens(req, config);
      if (rawTokens.length === 0) {
        return next();
      }

      const tokenHashes = rawTokens.map((t) => hashSessionToken(t));
      const now = new Date();

      const [sessionRow] = await db
        .select()
        .from(sessions)
        .where(and(inArray(sessions.tokenHash, tokenHashes), gt(sessions.expiresAt, now)))
        .orderBy(desc(sessions.createdAt))
        .limit(1);

      if (!sessionRow) {
        return next();
      }

      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.id, sessionRow.userId))
        .limit(1);

      if (!userRow || !userRow.isActive) {
        return next();
      }

      let customerRow: typeof customers.$inferSelect | null = null;
      if (userRow.role === 'customer') {
        const [cust] = await db
          .select()
          .from(customers)
          .where(eq(customers.userId, userRow.id))
          .limit(1);
        if (!cust || !cust.isActive) {
          return next();
        }
        customerRow = cust;
      }

      req.auth = {
        user: userRow,
        session: sessionRow,
        customer: customerRow,
      };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.byteLength !== bufB.byteLength) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isOriginAllowedForHost(
  originUrl: URL,
  primaryHost: string,
  previewCompat: boolean,
): boolean {
  if (originUrl.host === primaryHost) {
    return true;
  }

  if (previewCompat) {
    const hostWithoutPort = primaryHost.split(':')[0]!.toLowerCase();
    const originHostname = originUrl.hostname.toLowerCase();

    if (originHostname === hostWithoutPort) {
      return true;
    }

    const isLocalProxyTarget =
      hostWithoutPort === 'localhost' ||
      hostWithoutPort === '127.0.0.1' ||
      hostWithoutPort === '0.0.0.0';

    if (isLocalProxyTarget && originHostname.endsWith('.e2b.app')) {
      return true;
    }
  }

  return false;
}

/**
 * Enforces CSRF protection on all state-changing HTTP methods.
 * - Authenticated requests must supply `X-CSRF-Token` matching `session.csrfToken`.
 * - Unauthenticated login requests must be JSON and pass Origin/Host consistency if Origin is sent.
 */
export function createCsrfMiddleware(config?: AppConfig) {
  const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  return (req: Request, res: Response, next: NextFunction) => {
    if (!mutatingMethods.has(req.method.toUpperCase())) {
      return next();
    }

    // Check Origin header when provided by browser
    const originHeader = req.headers.origin;
    const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host;
    if (originHeader && hostHeader) {
      try {
        const originUrl = new URL(originHeader);
        const primaryHost = String(hostHeader).split(',')[0]!.trim();
        if (!isOriginAllowedForHost(originUrl, primaryHost, Boolean(config?.previewIframeCompat))) {
          return res.status(403).json({
            error: 'درخواست نامعتبر است (عدم تطابق مبدأ امنیتی).',
            code: 'CSRF_ORIGIN_MISMATCH',
          });
        }
      } catch {
        return res.status(403).json({
          error: 'درخواست نامعتبر است.',
          code: 'CSRF_INVALID_ORIGIN',
        });
      }
    }

    // Unauthenticated login uses JSON Content-Type + Origin check
    if (req.path === '/auth/login' || req.originalUrl.split('?')[0] === '/api/auth/login') {
      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.includes('application/json')) {
        return res.status(415).json({
          error: 'قالب درخواست نامعتبر است.',
          code: 'UNSUPPORTED_CONTENT_TYPE',
        });
      }
      return next();
    }

    if (!req.auth) {
      return res.status(401).json({
        error: 'برای انجام این عملیات، ابتدا وارد حساب کاربری خود شوید.',
        code: 'UNAUTHENTICATED',
      });
    }

    const headerToken = req.headers['x-csrf-token'];
    if (
      typeof headerToken !== 'string' ||
      !timingSafeStringEqual(headerToken, req.auth.session.csrfToken)
    ) {
      return res.status(403).json({
        error: 'نشست امنیتی معتبر نیست. لطفاً صفحه را بازخوانی کرده و دوباره تلاش کنید.',
        code: 'CSRF_TOKEN_INVALID',
      });
    }

    return next();
  };
}

export function requireAuth(options?: { allowPasswordChangeGate?: boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        error: 'لطفاً وارد حساب کاربری خود شوید.',
        code: 'UNAUTHENTICATED',
      });
    }
    if (!options?.allowPasswordChangeGate && req.auth.user.forcePasswordChange) {
      return res.status(403).json({
        error: 'پیش از دسترسی به پرتال، تغییر رمز عبور اولیه الزامی است.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    return next();
  };
}

export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({
      error: 'لطفاً وارد حساب کاربری خود شوید.',
      code: 'UNAUTHENTICATED',
    });
  }
  if (req.auth.user.forcePasswordChange) {
    return res.status(403).json({
      error: 'پیش از دسترسی به پرتال، تغییر رمز عبور اولیه الزامی است.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  if (req.auth.user.role !== 'customer' || !req.auth.customer) {
    return res.status(403).json({
      error: 'شما مجوز دسترسی به این بخش را ندارید.',
      code: 'FORBIDDEN',
    });
  }
  return next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({
      error: 'لطفاً وارد حساب مدیریت دفتر شوید.',
      code: 'UNAUTHENTICATED',
    });
  }
  if (req.auth.user.forcePasswordChange) {
    return res.status(403).json({
      error: 'پیش از دسترسی به پنل مدیریت، تغییر رمز عبور اولیه الزامی است.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  if (req.auth.user.role !== 'office_admin') {
    return res.status(403).json({
      error: 'دسترسی به پنل مدیریت فقط برای مسئول مجاز دفتر امکان‌پذیر است.',
      code: 'FORBIDDEN',
    });
  }
  return next();
}
