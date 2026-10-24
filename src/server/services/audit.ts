import type { AppDb } from '../db/client.js';
import { auditEvents } from '../db/schema.js';
import { sanitizeForLog } from '../logger.js';

export interface AuditEventInput {
  actorUserId: string | null;
  actorRole: 'customer' | 'office_admin' | 'system';
  entityType: 'request' | 'customer' | 'driver' | 'workshop' | 'insured_employee' | 'user' | 'file';
  entityId: string;
  requestId?: string | null;
  eventType: string;
  customerVisible?: boolean;
  summaryFa: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordAuditEvent(dbOrTx: AppDb, input: AuditEventInput): Promise<void> {
  await dbOrTx.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: input.requestId ?? null,
    eventType: input.eventType,
    customerVisible: input.customerVisible ?? false,
    summaryFa: String(sanitizeForLog(input.summaryFa)),
    oldValues: input.oldValues
      ? (sanitizeForLog(input.oldValues) as Record<string, unknown>)
      : null,
    newValues: input.newValues
      ? (sanitizeForLog(input.newValues) as Record<string, unknown>)
      : null,
    metadata: input.metadata ? (sanitizeForLog(input.metadata) as Record<string, unknown>) : null,
  });
}
