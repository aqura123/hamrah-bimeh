import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, ZodError } from 'zod';

const uuidSchema = z.string().uuid();

export function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && uuidSchema.safeParse(id).success;
}

export function formatZodError(err: ZodError): {
  error: string;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  const firstMessage = err.issues[0]?.message ?? 'اطلاعات واردشده معتبر نیست.';
  return { error: firstMessage, fieldErrors };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
