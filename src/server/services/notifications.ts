import { and, eq, lt, notInArray } from 'drizzle-orm';
import type { AppDb } from '../db/client.js';
import { customers, notifications, requests, users } from '../db/schema.js';
import { formatJalaliPeriod } from '../../shared/jalali.js';

export interface NotificationPayload {
  notificationType: string;
  requestId?: string | null;
  titleFa: string;
  bodyFa: string;
  dedupeKey?: string | null;
}

/**
 * Sends an in-app notification to the user account owning a specific customer profile.
 * Uses `dedupeKey` with `onConflictDoNothing` to prevent duplicates on retry.
 */
export async function notifyCustomerByCustomerId(
  dbOrTx: AppDb,
  customerId: string,
  payload: NotificationPayload,
): Promise<void> {
  const [cust] = await dbOrTx
    .select({ userId: customers.userId })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!cust) return;

  await dbOrTx
    .insert(notifications)
    .values({
      recipientUserId: cust.userId,
      recipientRole: 'customer',
      notificationType: payload.notificationType,
      requestId: payload.requestId ?? null,
      titleFa: payload.titleFa,
      bodyFa: payload.bodyFa,
      dedupeKey: payload.dedupeKey ?? null,
    })
    .onConflictDoNothing();
}

/**
 * Sends an in-app notification to all active `office_admin` accounts.
 */
export async function notifyAllOfficeAdmins(
  dbOrTx: AppDb,
  payload: NotificationPayload,
): Promise<void> {
  const admins = await dbOrTx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'office_admin'), eq(users.isActive, true)));

  if (admins.length === 0) return;

  for (const admin of admins) {
    const adminDedupe = payload.dedupeKey ? `${admin.id}:${payload.dedupeKey}` : null;
    await dbOrTx
      .insert(notifications)
      .values({
        recipientUserId: admin.id,
        recipientRole: 'office_admin',
        notificationType: payload.notificationType,
        requestId: payload.requestId ?? null,
        titleFa: payload.titleFa,
        bodyFa: payload.bodyFa,
        dedupeKey: adminDedupe,
      })
      .onConflictDoNothing();
  }
}

/**
 * Generates persistent office notifications for requests that remain incomplete past
 * the configured threshold (`incompleteAlertHours`), deduplicated per request so
 * staff are alerted cleanly without spam.
 */
export async function syncIncompleteRequestAlerts(
  db: AppDb,
  incompleteAlertHours: number,
): Promise<void> {
  const cutoff = new Date(Date.now() - incompleteAlertHours * 60 * 60 * 1000);
  const staleRequests = await db
    .select({
      id: requests.id,
      referenceCode: requests.referenceCode,
      jalaliYear: requests.jalaliYear,
      jalaliMonth: requests.jalaliMonth,
    })
    .from(requests)
    .where(
      and(
        notInArray(requests.status, ['completed', 'rejected', 'cancelled']),
        lt(requests.createdAt, cutoff),
      ),
    )
    .limit(50);

  for (const reqRow of staleRequests) {
    const periodLabel = formatJalaliPeriod(reqRow.jalaliYear, reqRow.jalaliMonth);
    await notifyAllOfficeAdmins(db, {
      notificationType: 'incomplete_request_alert',
      requestId: reqRow.id,
      titleFa: `درخواست تکمیل‌نشده (${reqRow.referenceCode})`,
      bodyFa: `درخواست شماره ${reqRow.referenceCode} مربوط به دوره ${periodLabel} هنوز به وضعیت انجام‌شده نرسیده است.`,
      dedupeKey: `incomplete_alert:${reqRow.id}`,
    });
  }
}
