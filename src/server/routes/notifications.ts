import { and, count, desc, eq, isNull, notInArray } from 'drizzle-orm';
import { Router } from 'express';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import { notifications, requests } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { syncIncompleteRequestAlerts } from '../services/notifications.js';
import { asyncHandler, isValidUuid } from './helpers.js';

export function createNotificationsRouter(db: AppDb, config: AppConfig): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      const isAdmin = auth.user.role === 'office_admin';

      if (isAdmin) {
        await syncIncompleteRequestAlerts(db, config.incompleteAlertHours);
      }

      const [items, [unreadRow], incompleteCountResult] = await Promise.all([
        db
          .select({
            id: notifications.id,
            notificationType: notifications.notificationType,
            requestId: notifications.requestId,
            titleFa: notifications.titleFa,
            bodyFa: notifications.bodyFa,
            readAt: notifications.readAt,
            createdAt: notifications.createdAt,
          })
          .from(notifications)
          .where(eq(notifications.recipientUserId, auth.user.id))
          .orderBy(desc(notifications.createdAt))
          .limit(50),
        db
          .select({ value: count() })
          .from(notifications)
          .where(
            and(eq(notifications.recipientUserId, auth.user.id), isNull(notifications.readAt)),
          ),
        isAdmin
          ? db
              .select({ value: count() })
              .from(requests)
              .where(notInArray(requests.status, ['completed', 'rejected', 'cancelled']))
          : Promise.resolve([{ value: 0 }]),
      ]);

      return res.json({
        unreadCount: Number(unreadRow?.value ?? 0),
        incompleteRequestsCount: isAdmin ? Number(incompleteCountResult[0]?.value ?? 0) : undefined,
        notifications: items,
      });
    }),
  );

  router.post(
    '/:notificationId/read',
    asyncHandler(async (req, res) => {
      const { notificationId } = req.params;
      if (!isValidUuid(notificationId)) {
        return res.status(404).json({ error: 'اعلان مورد نظر یافت نشد.' });
      }
      const auth = req.auth!;

      const updated = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.recipientUserId, auth.user.id),
          ),
        )
        .returning({ id: notifications.id });

      if (updated.length === 0) {
        return res.status(404).json({ error: 'اعلان مورد نظر یافت نشد.' });
      }
      return res.json({ ok: true });
    }),
  );

  router.post(
    '/read-all',
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.recipientUserId, auth.user.id), isNull(notifications.readAt)));

      return res.json({ ok: true });
    }),
  );

  return router;
}
