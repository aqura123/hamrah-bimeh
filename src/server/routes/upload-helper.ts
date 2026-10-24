import type { Request, RequestHandler, Response } from 'express';
import multer, { MulterError } from 'multer';
import { toPersianDigits } from '../../shared/jalali.js';

export function createMemoryUpload(maxUploadBytes: number, maxFiles = 10) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes,
      files: maxFiles,
      fieldSize: 64 * 1024,
    },
  });
}

export function runMulterMiddleware(mw: RequestHandler, maxUploadMb: number): RequestHandler {
  return (req: Request, res: Response, next) => {
    mw(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: `حجم هر فایل نباید بیشتر از ${toPersianDigits(maxUploadMb)} مگابایت باشد.`,
            code: 'FILE_TOO_LARGE',
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: 'تعداد فایل‌های انتخاب‌شده بیش از حد مجاز است.',
            code: 'TOO_MANY_FILES',
          });
        }
        return res.status(400).json({
          error: 'خطا در دریافت فایل‌های پیوست. لطفاً مجدداً بررسی کنید.',
          code: 'UPLOAD_ERROR',
        });
      }
      return next(err);
    });
  };
}
