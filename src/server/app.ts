import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { AppConfig } from './config.js';
import type { AppDb } from './db/client.js';
import { logger } from './logger.js';
import { createCsrfMiddleware, createSessionLoaderMiddleware } from './middleware/auth.js';
import { createAdminRouter } from './routes/admin.js';
import { createAuthRouter } from './routes/auth.js';
import { createCustomerPortalRouter } from './routes/customer.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createPublicRouter } from './routes/public.js';
import { createRequestsAndFilesRouter } from './routes/requests.js';
import { LoginRateLimiter } from './services/security.js';
import type { FileStorageProvider } from './services/storage.js';

export interface CreateAppOptions {
  db: AppDb;
  config: AppConfig;
  storage: FileStorageProvider;
  rateLimiter?: LoginRateLimiter;
  mountFrontend?: (app: Express) => void;
}

export function getRouteMetadataFa(pathname: string): { title: string; description: string } {
  if (pathname === '/') {
    return {
      title: 'همراه بیمه | خدمات بیمه‌ای، ساده‌تر و مطمئن‌تر',
      description:
        'پرتال ثبت و پیگیری درخواست‌های خدمات بیمه‌ای رانندگان و لیست بیمه ماهانه کارگاه‌ها توسط دفتر همراه بیمه.',
    };
  }
  if (pathname.startsWith('/drivers')) {
    return {
      title: 'خدمات بیمه‌ای رانندگان | همراه بیمه',
      description:
        'راهنما و نحوه ثبت درخواست ماهانه حق بیمه رانندگان در دفتر خدمات بیمه‌ای همراه بیمه.',
    };
  }
  if (pathname.startsWith('/employers')) {
    return {
      title: 'خدمات کارفرمایان و کارگاه‌ها | همراه بیمه',
      description:
        'ثبت و پیگیری درخواست ارسال لیست بیمه ماهانه کارگاه‌ها و معرفی بیمه‌شده جدید در همراه بیمه.',
    };
  }
  if (pathname.startsWith('/guide')) {
    return {
      title: 'راهنمای مدارک و فرآیند انجام کار | همراه بیمه',
      description:
        'فهرست اطلاعات اصلی و مدارک اختیاری مرتبط برای ثبت درخواست رانندگان و کارگاه‌ها.',
    };
  }
  if (pathname.startsWith('/contact')) {
    return {
      title: 'تماس با دفتر | همراه بیمه',
      description: 'اطلاعات تماس، نشانی و ساعات پاسخ‌گویی دفتر خدمات بیمه‌ای همراه بیمه.',
    };
  }
  if (pathname.startsWith('/login')) {
    return {
      title: 'ورود به حساب کاربری | همراه بیمه',
      description: 'ورود مشتریان و مسئول دفتر به سامانه مدیریت درخواست‌های همراه بیمه.',
    };
  }
  if (pathname.startsWith('/portal')) {
    return {
      title: 'پرتال اختصاصی مشتری | همراه بیمه',
      description: 'مدیریت پرونده رانندگان و کارگاه‌ها، ثبت درخواست ماهانه و پیگیری وضعیت.',
    };
  }
  if (pathname.startsWith('/admin')) {
    return {
      title: 'پنل مدیریت دفتر | همراه بیمه',
      description: 'پنل اختصاصی بررسی و مدیریت درخواست‌های بیمه‌ای مشتریان دفتر همراه بیمه.',
    };
  }
  return {
    title: 'همراه بیمه | خدمات بیمه‌ای، ساده‌تر و مطمئن‌تر',
    description: 'سامانه ثبت و پیگیری درخواست‌های خدمات بیمه‌ای رانندگان و کارگاه‌ها.',
  };
}

export function createApiApp(options: CreateAppOptions): Express {
  const { db, config, storage } = options;
  const rateLimiter = options.rateLimiter ?? new LoginRateLimiter();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers configured for both production hardening and preview iframe compatibility
  app.use(
    helmet({
      frameguard: config.previewIframeCompat ? false : { action: 'deny' },
      contentSecurityPolicy: config.previewIframeCompat
        ? false
        : {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              frameAncestors: [config.frameAncestors],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
            },
          },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // Load authenticated session & customer context on every request
  app.use(createSessionLoaderMiddleware(db, config));

  // Prevent HTTP caching on all API endpoints
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  // Protect all `/api/*` mutating operations against CSRF
  app.use('/api', createCsrfMiddleware(config));

  // API Routers
  app.use('/api', createPublicRouter(config));
  app.use('/api/auth', createAuthRouter(db, config, rateLimiter));
  app.use('/api/portal', createCustomerPortalRouter(db, config, storage));
  app.use('/api', createRequestsAndFilesRouter(db, config, storage));
  app.use('/api/notifications', createNotificationsRouter(db, config));
  app.use('/api/admin', createAdminRouter(db, config, storage));

  // Unknown API endpoint fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'مسیر درخواستی یافت نشد.' });
  });

  // Server-side HTML route protection for protected browser paths before serving SPA shell
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();
    const p = req.path;

    if (p.startsWith('/admin')) {
      if (!req.auth) {
        if (config.previewIframeCompat) return next();
        return res.redirect(302, '/login');
      }
      if (req.auth.user.forcePasswordChange) {
        return res.redirect(302, '/change-password');
      }
      if (req.auth.user.role !== 'office_admin') {
        return res.redirect(302, '/portal');
      }
    } else if (p.startsWith('/portal')) {
      if (!req.auth) {
        if (config.previewIframeCompat) return next();
        return res.redirect(302, '/login');
      }
      if (req.auth.user.forcePasswordChange) {
        return res.redirect(302, '/change-password');
      }
      if (req.auth.user.role === 'office_admin') {
        return res.redirect(302, '/admin');
      }
    } else if (p.startsWith('/change-password')) {
      if (!req.auth) {
        if (config.previewIframeCompat) return next();
        return res.redirect(302, '/login');
      }
    }

    return next();
  });

  if (options.mountFrontend) {
    options.mountFrontend(app);
  }

  // Centralized error handler (never leaks stack traces or sensitive fields)
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error('http.unhandled_error', err, { method: req.method, path: req.path });
    if (res.headersSent) return;
    res.status(500).json({
      error: 'خطای داخلی سرور رخ داد. لطفاً دقایقی دیگر مجدداً تلاش کنید.',
    });
  });

  return app;
}
