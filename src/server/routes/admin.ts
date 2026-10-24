import { and, count, desc, eq, ilike, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import {
  formatMoney,
  REQUEST_STATUS_LABELS,
  type CurrencyUnit,
  type RequestStatus,
} from '../../shared/domain.js';
import { maskNationalId } from '../../shared/iran-identifiers.js';
import { normalizeDigits } from '../../shared/jalali.js';
import {
  adminAwaitingInfoSchema,
  adminCancellationDecisionSchema,
  adminCreateCustomerSchema,
  adminRequestFilterSchema,
  adminResetPasswordSchema,
  adminStatusTransitionSchema,
  adminUpdateAmountSchema,
  adminUpdateCustomerSchema,
  adminUpdateDriverSchema,
  adminUpdateWorkshopSchema,
  explanationSchema,
} from '../../shared/validation.js';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import {
  auditEvents,
  customers,
  drivers,
  insuredEmployees,
  requestFiles,
  requestMessages,
  requests,
  sessions,
  users,
  workshops,
} from '../db/schema.js';
import { requireAdmin } from '../middleware/auth.js';
import { recordAuditEvent } from '../services/audit.js';
import { notifyCustomerByCustomerId } from '../services/notifications.js';
import { generateTemporaryPassword, hashPassword } from '../services/security.js';
import {
  FileValidationError,
  type FileStorageProvider,
  type StoredFileMetadata,
  validateAndStorePrivateFile,
} from '../services/storage.js';
import {
  assertStatusTransitionAllowed,
  isRequestTerminal,
  WorkflowError,
} from '../services/workflow.js';
import { asyncHandler, formatZodError, isValidUuid } from './helpers.js';
import { createMemoryUpload, runMulterMiddleware } from './upload-helper.js';

export function createAdminRouter(
  db: AppDb,
  config: AppConfig,
  storage: FileStorageProvider,
): Router {
  const router = Router();
  router.use(requireAdmin);

  const upload = createMemoryUpload(config.maxUploadBytes, 5);

  // 1. Unified Paginated & Filtered Request List
  router.get(
    '/requests',
    asyncHandler(async (req, res) => {
      const parsed = adminRequestFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const filters = parsed.data;
      const conditions: SQL[] = [];

      if (filters.status) {
        conditions.push(eq(requests.status, filters.status));
      }
      if (filters.requestType) {
        conditions.push(eq(requests.requestType, filters.requestType));
      }
      if (filters.jalaliYear) {
        conditions.push(eq(requests.jalaliYear, filters.jalaliYear));
      }
      if (filters.jalaliMonth) {
        conditions.push(eq(requests.jalaliMonth, filters.jalaliMonth));
      }
      if (filters.awaitingInfoOnly) {
        conditions.push(eq(requests.awaitingCustomerInfo, true));
      }
      if (filters.incompleteOnly) {
        conditions.push(notInArray(requests.status, ['completed', 'rejected', 'cancelled']));
      }

      if (filters.q && filters.q.length > 0) {
        const normalizedQ = normalizeDigits(filters.q.trim());
        const pattern = `%${normalizedQ}%`;
        const rawPattern = `%${filters.q.trim()}%`;
        conditions.push(
          or(
            ilike(requests.referenceCode, pattern),
            ilike(customers.fullName, rawPattern),
            ilike(customers.mobile, pattern),
            ilike(customers.nationalId, pattern),
            ilike(drivers.fullName, rawPattern),
            ilike(drivers.nationalId, pattern),
            ilike(workshops.workshopName, rawPattern),
            ilike(workshops.workshopCode, pattern),
          )!,
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (filters.page - 1) * filters.pageSize;

      const orderByClauses =
        filters.sort === 'period_desc'
          ? [desc(requests.jalaliYear), desc(requests.jalaliMonth), desc(requests.createdAt)]
          : filters.sort === 'newest_activity'
            ? [desc(requests.lastActivityAt)]
            : [desc(requests.createdAt)];

      const [rows, [totalRow], [activeCounter], [awaitingCounter], [cancelCounter]] =
        await Promise.all([
          db
            .select({
              id: requests.id,
              referenceCode: requests.referenceCode,
              requestType: requests.requestType,
              jalaliYear: requests.jalaliYear,
              jalaliMonth: requests.jalaliMonth,
              status: requests.status,
              awaitingCustomerInfo: requests.awaitingCustomerInfo,
              cancellationDecision: requests.cancellationDecision,
              finalAmount: requests.finalAmount,
              currencyUnit: requests.currencyUnit,
              hasNewEmployeeSubmission: requests.hasNewEmployeeSubmission,
              submittedAt: requests.submittedAt,
              lastActivityAt: requests.lastActivityAt,
              customerId: customers.id,
              customerName: customers.fullName,
              customerMobile: customers.mobile,
              customerMaskedNationalId: customers.nationalId,
              driverId: drivers.id,
              driverName: drivers.fullName,
              driverMaskedNationalId: drivers.nationalId,
              workshopId: workshops.id,
              workshopName: workshops.workshopName,
              workshopCode: workshops.workshopCode,
            })
            .from(requests)
            .innerJoin(customers, eq(requests.customerId, customers.id))
            .leftJoin(drivers, eq(requests.driverId, drivers.id))
            .leftJoin(workshops, eq(requests.workshopId, workshops.id))
            .where(whereClause)
            .orderBy(...orderByClauses)
            .limit(filters.pageSize)
            .offset(offset),
          db
            .select({ value: count() })
            .from(requests)
            .innerJoin(customers, eq(requests.customerId, customers.id))
            .leftJoin(drivers, eq(requests.driverId, drivers.id))
            .leftJoin(workshops, eq(requests.workshopId, workshops.id))
            .where(whereClause),
          db
            .select({ value: count() })
            .from(requests)
            .where(notInArray(requests.status, ['completed', 'rejected', 'cancelled'])),
          db
            .select({ value: count() })
            .from(requests)
            .where(
              and(
                eq(requests.awaitingCustomerInfo, true),
                notInArray(requests.status, ['completed', 'rejected', 'cancelled']),
              ),
            ),
          db
            .select({ value: count() })
            .from(requests)
            .where(eq(requests.cancellationDecision, 'pending')),
        ]);

      const totalCount = Number(totalRow?.value ?? 0);

      return res.json({
        page: filters.page,
        pageSize: filters.pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / filters.pageSize)),
        counters: {
          activeRequests: Number(activeCounter?.value ?? 0),
          awaitingCustomerInfo: Number(awaitingCounter?.value ?? 0),
          pendingCancellation: Number(cancelCounter?.value ?? 0),
        },
        items: rows.map((r) => ({
          id: r.id,
          referenceCode: r.referenceCode,
          requestType: r.requestType,
          jalaliYear: r.jalaliYear,
          jalaliMonth: r.jalaliMonth,
          status: r.status,
          awaitingCustomerInfo: r.awaitingCustomerInfo,
          cancellationDecision: r.cancellationDecision,
          finalAmount: r.finalAmount,
          currencyUnit: r.currencyUnit,
          hasNewEmployeeSubmission: r.hasNewEmployeeSubmission,
          submittedAt: r.submittedAt,
          lastActivityAt: r.lastActivityAt,
          customer: {
            id: r.customerId,
            fullName: r.customerName,
            mobile: r.customerMobile,
            maskedNationalId: maskNationalId(r.customerMaskedNationalId),
          },
          driver: r.driverId
            ? {
                id: r.driverId,
                fullName: r.driverName!,
                maskedNationalId: maskNationalId(r.driverMaskedNationalId),
              }
            : null,
          workshop: r.workshopId
            ? {
                id: r.workshopId,
                workshopName: r.workshopName!,
                workshopCode: r.workshopCode!,
              }
            : null,
        })),
      });
    }),
  );

  // 2. Change Request Status (Through Validated Workflow Service)
  router.post(
    '/requests/:requestId/status',
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      if (!isValidUuid(requestId)) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const parsed = adminStatusTransitionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const adminUser = req.auth!.user;
      const { newStatus, explanation, awaitingCustomerInfo, awaitingCustomerInfoNote } =
        parsed.data;

      const [reqRow] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);

      if (!reqRow) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const nextAwaitingFlag =
        newStatus === 'needs_customer_info'
          ? true
          : isRequestTerminal(newStatus)
            ? false
            : (awaitingCustomerInfo ?? reqRow.awaitingCustomerInfo);

      try {
        assertStatusTransitionAllowed({
          currentStatus: reqRow.status as RequestStatus,
          newStatus,
          finalAmount: reqRow.finalAmount,
          awaitingCustomerInfo:
            newStatus === 'completed' ? reqRow.awaitingCustomerInfo : nextAwaitingFlag,
          cancellationDecision: reqRow.cancellationDecision,
          explanation,
        });
      } catch (err) {
        if (err instanceof WorkflowError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        throw err;
      }

      const now = new Date();
      const oldStatus = reqRow.status as RequestStatus;
      const effectiveInfoNote = nextAwaitingFlag
        ? awaitingCustomerInfoNote.trim() || explanation.trim() || reqRow.awaitingCustomerInfoNote
        : null;

      await db.transaction(async (tx) => {
        await tx
          .update(requests)
          .set({
            status: newStatus,
            awaitingCustomerInfo: nextAwaitingFlag,
            awaitingCustomerInfoNote: effectiveInfoNote,
            completedAt: newStatus === 'completed' ? now : reqRow.completedAt,
            rejectedAt: newStatus === 'rejected' ? now : reqRow.rejectedAt,
            cancelledAt: newStatus === 'cancelled' ? now : reqRow.cancelledAt,
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(eq(requests.id, reqRow.id));

        if (explanation.trim().length > 0) {
          await tx.insert(requestMessages).values({
            requestId: reqRow.id,
            authorUserId: adminUser.id,
            authorRole: 'office_admin',
            messageKind:
              newStatus === 'rejected'
                ? 'rejection_reason'
                : newStatus === 'needs_customer_info'
                  ? 'info_request'
                  : 'explanation',
            body: explanation.trim(),
          });
        }

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: adminUser.id,
          actorRole: 'office_admin',
          entityType: 'request',
          entityId: reqRow.id,
          requestId: reqRow.id,
          eventType: 'request.status_changed',
          customerVisible: true,
          summaryFa: `وضعیت درخواست از «${REQUEST_STATUS_LABELS[oldStatus]}» به «${REQUEST_STATUS_LABELS[newStatus]}» تغییر یافت.`,
          oldValues: { status: oldStatus },
          newValues: { status: newStatus, awaitingCustomerInfo: nextAwaitingFlag },
        });

        await notifyCustomerByCustomerId(tx as unknown as AppDb, reqRow.customerId, {
          notificationType: 'status_changed',
          requestId: reqRow.id,
          titleFa: `تغییر وضعیت درخواست ${reqRow.referenceCode}`,
          bodyFa: `وضعیت درخواست شما به «${REQUEST_STATUS_LABELS[newStatus]}» تغییر کرد.`,
          dedupeKey: `cust_status:${reqRow.id}:${newStatus}:${now.getTime()}`,
        });
      });

      return res.json({ ok: true, status: newStatus });
    }),
  );

  // 3. Toggle `awaiting_customer_info` Independently of Ongoing Work Status
  router.post(
    '/requests/:requestId/awaiting-info',
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      if (!isValidUuid(requestId)) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const parsed = adminAwaitingInfoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const [reqRow] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);

      if (!reqRow) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      if (isRequestTerminal(reqRow.status as RequestStatus)) {
        return res.status(400).json({
          error: 'این درخواست در وضعیت پایانی است و امکان تغییر پرچم تکمیل اطلاعات ندارد.',
        });
      }

      const adminUser = req.auth!.user;
      const { awaitingCustomerInfo, note } = parsed.data;
      const now = new Date();

      await db.transaction(async (tx) => {
        // If clearing awaiting info while primary status was `needs_customer_info`, move cleanly to `office_reviewing`
        const nextStatus: RequestStatus =
          !awaitingCustomerInfo && reqRow.status === 'needs_customer_info'
            ? 'office_reviewing'
            : (reqRow.status as RequestStatus);

        await tx
          .update(requests)
          .set({
            status: nextStatus,
            awaitingCustomerInfo,
            awaitingCustomerInfoNote: awaitingCustomerInfo ? note.trim() : null,
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(eq(requests.id, reqRow.id));

        if (note.trim().length > 0) {
          await tx.insert(requestMessages).values({
            requestId: reqRow.id,
            authorUserId: adminUser.id,
            authorRole: 'office_admin',
            messageKind: awaitingCustomerInfo ? 'info_request' : 'explanation',
            body: awaitingCustomerInfo
              ? `درخواست تکمیل اطلاعات توسط مشتری: ${note.trim()}`
              : note.trim(),
          });
        }

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: adminUser.id,
          actorRole: 'office_admin',
          entityType: 'request',
          entityId: reqRow.id,
          requestId: reqRow.id,
          eventType: awaitingCustomerInfo
            ? 'request.awaiting_info_set'
            : 'request.awaiting_info_cleared',
          customerVisible: true,
          summaryFa: awaitingCustomerInfo
            ? 'نیاز به تکمیل اطلاعات یا مدرک از سوی مشتری ثبت شد (امکان ادامه هم‌زمان کار توسط دفتر برقرار است).'
            : 'مورد تکمیل اطلاعات مشتری برطرف شد.',
          oldValues: { awaitingCustomerInfo: reqRow.awaitingCustomerInfo },
          newValues: { awaitingCustomerInfo },
        });

        if (awaitingCustomerInfo) {
          await notifyCustomerByCustomerId(tx as unknown as AppDb, reqRow.customerId, {
            notificationType: 'office_message',
            requestId: reqRow.id,
            titleFa: `نیاز به تکمیل اطلاعات در درخواست ${reqRow.referenceCode}`,
            bodyFa: 'دفتر برای تکمیل پرونده شما توضیح یا مدرک تکمیلی درخواست کرده است.',
            dedupeKey: `cust_awaiting_info:${reqRow.id}:${now.getTime()}`,
          });
        }
      });

      return res.json({ ok: true });
    }),
  );

  // 4. Record or Update Final Service Amount
  router.post(
    '/requests/:requestId/amount',
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      if (!isValidUuid(requestId)) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const parsed = adminUpdateAmountSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const [reqRow] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);

      if (!reqRow) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      if (reqRow.status === 'cancelled' || reqRow.status === 'rejected') {
        return res.status(400).json({
          error: 'امکان ثبت مبلغ برای درخواست لغوشده یا ردشده وجود ندارد.',
        });
      }

      const adminUser = req.auth!.user;
      const { finalAmount, note } = parsed.data;
      const unit = config.currencyUnit as CurrencyUnit;
      const formattedNew = formatMoney(finalAmount, unit);
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(requests)
          .set({
            finalAmount,
            currencyUnit: unit,
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(eq(requests.id, reqRow.id));

        if (note.trim().length > 0) {
          await tx.insert(requestMessages).values({
            requestId: reqRow.id,
            authorUserId: adminUser.id,
            authorRole: 'office_admin',
            messageKind: 'explanation',
            body: note.trim(),
          });
        }

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: adminUser.id,
          actorRole: 'office_admin',
          entityType: 'request',
          entityId: reqRow.id,
          requestId: reqRow.id,
          eventType: 'request.amount_updated',
          customerVisible: true,
          summaryFa:
            reqRow.finalAmount === null
              ? `مبلغ نهایی خدمات به میزان ${formattedNew} توسط دفتر ثبت شد.`
              : `مبلغ نهایی خدمات به ${formattedNew} به‌روزرسانی شد.`,
          oldValues: { finalAmount: reqRow.finalAmount, currencyUnit: reqRow.currencyUnit },
          newValues: { finalAmount, currencyUnit: unit },
        });

        await notifyCustomerByCustomerId(tx as unknown as AppDb, reqRow.customerId, {
          notificationType: 'final_amount_recorded',
          requestId: reqRow.id,
          titleFa: `ثبت مبلغ نهایی درخواست ${reqRow.referenceCode}`,
          bodyFa: `مبلغ نهایی خدمات (${formattedNew}) در پرونده درخواست شما ثبت شد.`,
          dedupeKey: `cust_amount:${reqRow.id}:${finalAmount}:${now.getTime()}`,
        });
      });

      return res.json({ ok: true, finalAmount, currencyUnit: unit });
    }),
  );

  // 5. Upload Office Output Document(s)
  router.post(
    '/requests/:requestId/files',
    runMulterMiddleware(upload.array('files', 5), config.maxUploadMb),
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      if (!isValidUuid(requestId)) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const [reqRow] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);

      if (!reqRow) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (uploadedFiles.length === 0) {
        return res.status(400).json({ error: 'لطفاً حداقل یک فایل خروجی انتخاب کنید.' });
      }

      const noteParsed = explanationSchema.safeParse(req.body?.note ?? '');
      if (!noteParsed.success) {
        return res.status(400).json(formatZodError(noteParsed.error));
      }

      const storedFiles: StoredFileMetadata[] = [];
      const adminUser = req.auth!.user;

      try {
        for (const f of uploadedFiles) {
          storedFiles.push(
            await validateAndStorePrivateFile({
              storage,
              originalName: f.originalname,
              buffer: f.buffer,
              maxUploadBytes: config.maxUploadBytes,
              allowedMimes: config.allowedUploadMimes,
              antivirusMode: config.antivirusMode,
            }),
          );
        }

        const now = new Date();
        await db.transaction(async (tx) => {
          let msgId: string | null = null;
          if (noteParsed.data.trim().length > 0) {
            const [m] = await tx
              .insert(requestMessages)
              .values({
                requestId: reqRow.id,
                authorUserId: adminUser.id,
                authorRole: 'office_admin',
                messageKind: 'explanation',
                body: noteParsed.data.trim(),
              })
              .returning();
            msgId = m?.id ?? null;
          }

          for (const meta of storedFiles) {
            const [fileRow] = await tx
              .insert(requestFiles)
              .values({
                requestId: reqRow.id,
                messageId: msgId,
                uploaderUserId: adminUser.id,
                uploaderRole: 'office_admin',
                classification: 'office_output',
                storageKey: meta.storageKey,
                displayFilename: meta.displayFilename,
                detectedMimeType: meta.detectedMimeType,
                byteSize: meta.byteSize,
                sha256Checksum: meta.sha256Checksum,
                scanState: meta.scanState,
              })
              .returning();

            await recordAuditEvent(tx as unknown as AppDb, {
              actorUserId: adminUser.id,
              actorRole: 'office_admin',
              entityType: 'file',
              entityId: fileRow!.id,
              requestId: reqRow.id,
              eventType: 'request.file_uploaded',
              customerVisible: true,
              summaryFa: `فایل خروجی دفتر «${meta.displayFilename}» بارگذاری شد.`,
            });
          }

          await tx
            .update(requests)
            .set({ lastActivityAt: now, updatedAt: now })
            .where(eq(requests.id, reqRow.id));

          await notifyCustomerByCustomerId(tx as unknown as AppDb, reqRow.customerId, {
            notificationType: 'office_file_uploaded',
            requestId: reqRow.id,
            titleFa: `فایل خروجی جدید در درخواست ${reqRow.referenceCode}`,
            bodyFa: 'مدرک یا رسید خروجی جدید توسط دفتر در پرونده درخواست شما بارگذاری شد.',
            dedupeKey: `cust_office_upload:${reqRow.id}:${now.getTime()}`,
          });
        });

        return res.status(201).json({ ok: true });
      } catch (err) {
        await Promise.all(storedFiles.map((f) => storage.remove(f.storageKey)));
        if (err instanceof FileValidationError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
    }),
  );

  // 6. Decide on Customer Cancellation Request (Accept -> Cancelled; Reject -> Keep Active)
  router.post(
    '/requests/:requestId/cancellation-decision',
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      if (!isValidUuid(requestId)) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const parsed = adminCancellationDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const [reqRow] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);

      if (!reqRow) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      if (reqRow.cancellationDecision !== 'pending') {
        return res.status(400).json({
          error: 'درخواست لغو در انتظار بررسی برای این پرونده وجود ندارد.',
        });
      }

      const adminUser = req.auth!.user;
      const { decision, explanation } = parsed.data;
      const now = new Date();
      const accepted = decision === 'accepted';

      await db.transaction(async (tx) => {
        await tx
          .update(requests)
          .set({
            status: accepted ? 'cancelled' : reqRow.status,
            awaitingCustomerInfo: accepted ? false : reqRow.awaitingCustomerInfo,
            cancellationRequested: accepted,
            cancellationDecision: decision,
            cancellationDecisionNote: explanation,
            cancellationDecidedAt: now,
            cancelledAt: accepted ? now : reqRow.cancelledAt,
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(eq(requests.id, reqRow.id));

        await tx.insert(requestMessages).values({
          requestId: reqRow.id,
          authorUserId: adminUser.id,
          authorRole: 'office_admin',
          messageKind: 'cancellation_decision',
          body: accepted
            ? `موافقت دفتر با لغو درخواست: ${explanation}`
            : `عدم موافقت دفتر با لغو درخواست: ${explanation}`,
        });

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: adminUser.id,
          actorRole: 'office_admin',
          entityType: 'request',
          entityId: reqRow.id,
          requestId: reqRow.id,
          eventType: 'request.cancellation_decided',
          customerVisible: true,
          summaryFa: accepted
            ? 'درخواست لغو مشتری توسط دفتر پذیرفته شد و درخواست به وضعیت «لغوشده» تغییر یافت.'
            : 'درخواست لغو مشتری توسط دفتر پذیرفته نشد و رسیدگی به درخواست ادامه دارد.',
          oldValues: { cancellationDecision: 'pending', status: reqRow.status },
          newValues: {
            cancellationDecision: decision,
            status: accepted ? 'cancelled' : reqRow.status,
          },
        });

        await notifyCustomerByCustomerId(tx as unknown as AppDb, reqRow.customerId, {
          notificationType: accepted ? 'status_changed' : 'office_message',
          requestId: reqRow.id,
          titleFa: accepted
            ? `لغو درخواست شماره ${reqRow.referenceCode}`
            : `پاسخ دفتر به درخواست لغو (${reqRow.referenceCode})`,
          bodyFa: accepted
            ? 'با درخواست لغو شما موافقت شد و وضعیت درخواست به «لغوشده» تغییر یافت.'
            : 'درخواست لغو شما بررسی شد و با توضیح دفتر، رسیدگی به پرونده ادامه دارد.',
          dedupeKey: `cust_cancel_dec:${reqRow.id}:${now.getTime()}`,
        });
      });

      return res.json({ ok: true, decision });
    }),
  );

  // 7. Customer Accounts List & Search
  router.get(
    '/customers',
    asyncHandler(async (req, res) => {
      const qRaw = String(req.query.q ?? '').trim();
      const page = Math.max(1, Number(req.query.page ?? 1));
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 20)));
      const offset = (page - 1) * pageSize;

      let whereClause: SQL | undefined;
      if (qRaw.length > 0) {
        const normQ = normalizeDigits(qRaw);
        whereClause = or(
          ilike(customers.fullName, `%${qRaw}%`),
          ilike(customers.mobile, `%${normQ}%`),
          ilike(customers.nationalId, `%${normQ}%`),
        );
      }

      const [rows, [totalRow]] = await Promise.all([
        db
          .select({
            id: customers.id,
            userId: customers.userId,
            fullName: customers.fullName,
            mobile: customers.mobile,
            nationalId: customers.nationalId,
            phone: customers.phone,
            isActive: customers.isActive,
            createdAt: customers.createdAt,
            forcePasswordChange: users.forcePasswordChange,
            lastLoginAt: users.lastLoginAt,
            driversCount: sql<number>`(SELECT count(*)::int FROM drivers d WHERE d.customer_id = ${customers.id} AND d.is_archived = false)`,
            workshopsCount: sql<number>`(SELECT count(*)::int FROM workshops w WHERE w.customer_id = ${customers.id} AND w.is_archived = false)`,
            requestsCount: sql<number>`(SELECT count(*)::int FROM requests r WHERE r.customer_id = ${customers.id})`,
          })
          .from(customers)
          .innerJoin(users, eq(customers.userId, users.id))
          .where(whereClause)
          .orderBy(desc(customers.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ value: count() }).from(customers).where(whereClause),
      ]);

      const totalCount = Number(totalRow?.value ?? 0);

      return res.json({
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        defaultInitialPasswordMode: config.initialPasswordMode,
        items: rows.map((c) => ({
          id: c.id,
          userId: c.userId,
          fullName: c.fullName,
          mobile: c.mobile,
          maskedNationalId: maskNationalId(c.nationalId),
          phone: c.phone,
          isActive: c.isActive,
          forcePasswordChange: c.forcePasswordChange,
          lastLoginAt: c.lastLoginAt,
          driversCount: Number(c.driversCount ?? 0),
          workshopsCount: Number(c.workshopsCount ?? 0),
          requestsCount: Number(c.requestsCount ?? 0),
          createdAt: c.createdAt,
        })),
      });
    }),
  );

  // 8. Create Customer Account (Protected Office Onboarding)
  router.post(
    '/customers',
    asyncHandler(async (req, res) => {
      const parsed = adminCreateCustomerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const data = parsed.data;
      const mode = data.initialPasswordMode ?? config.initialPasswordMode;

      if (mode === 'national_id' && !data.nationalId) {
        return res.status(400).json({
          error:
            'در حالت رمز عبور اولیه مبتنی بر کد ملی، ثبت کد ملی معتبر ۱۰ رقمی برای مشتری الزامی است.',
          fieldErrors: {
            nationalId: 'کد ملی معتبر ۱۰ رقمی الزامی است.',
          },
        });
      }

      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, data.mobile))
        .limit(1);

      if (existingUser) {
        return res.status(409).json({
          error: 'این شماره همراه پیش‌تر در سامانه ثبت شده است.',
          fieldErrors: { mobile: 'این شماره همراه قبلاً ثبت شده است.' },
        });
      }

      const generatedOneTimePassword = mode === 'generated' ? generateTemporaryPassword() : null;
      const rawInitialSecret = mode === 'generated' ? generatedOneTimePassword! : data.nationalId!;

      const passwordHash = await hashPassword(rawInitialSecret);
      const adminUser = req.auth!.user;

      const created = await db.transaction(async (tx) => {
        const [newUser] = await tx
          .insert(users)
          .values({
            username: data.mobile,
            displayName: data.fullName,
            role: 'customer',
            passwordHash,
            forcePasswordChange: true,
            initialPasswordMode: mode,
            isActive: data.isActive,
          })
          .returning();

        const [newCustomer] = await tx
          .insert(customers)
          .values({
            userId: newUser!.id,
            fullName: data.fullName,
            mobile: data.mobile,
            nationalId: data.nationalId ?? null,
            phone: data.phone || null,
            officeNotes: data.officeNotes || null,
            isActive: data.isActive,
          })
          .returning();

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: adminUser.id,
          actorRole: 'office_admin',
          entityType: 'customer',
          entityId: newCustomer!.id,
          eventType: 'customer.created',
          customerVisible: false,
          summaryFa: `حساب مشتری «${data.fullName}» (${data.mobile}) توسط دفتر ایجاد شد.`,
          newValues: {
            fullName: data.fullName,
            mobile: data.mobile,
            maskedNationalId: maskNationalId(data.nationalId, false),
            isActive: data.isActive,
            initialPasswordMode: mode,
            forcePasswordChange: true,
          },
        });

        return newCustomer!;
      });

      // Never return or redisplay nationalId as plaintext password
      return res.status(201).json({
        customer: {
          id: created.id,
          fullName: created.fullName,
          mobile: created.mobile,
          isActive: created.isActive,
        },
        onboarding: {
          mode,
          forcePasswordChange: true,
          oneTimeTemporaryPassword: generatedOneTimePassword,
        },
      });
    }),
  );

  // 9. Inspect Customer Detail, Profiles, Requests, and Audit History
  router.get(
    '/customers/:customerId',
    asyncHandler(async (req, res) => {
      const { customerId } = req.params;
      if (!isValidUuid(customerId)) {
        return res.status(404).json({ error: 'پرونده مشتری یافت نشد.' });
      }

      const [custRow] = await db
        .select({
          customer: customers,
          user: {
            id: users.id,
            username: users.username,
            forcePasswordChange: users.forcePasswordChange,
            initialPasswordMode: users.initialPasswordMode,
            isActive: users.isActive,
            failedLoginCount: users.failedLoginCount,
            lockedUntil: users.lockedUntil,
            lastLoginAt: users.lastLoginAt,
          },
        })
        .from(customers)
        .innerJoin(users, eq(customers.userId, users.id))
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!custRow) {
        return res.status(404).json({ error: 'پرونده مشتری یافت نشد.' });
      }

      const [custDrivers, custWorkshops, custEmployees, custRequests, custAudit] =
        await Promise.all([
          db
            .select()
            .from(drivers)
            .where(eq(drivers.customerId, customerId))
            .orderBy(desc(drivers.createdAt)),
          db
            .select()
            .from(workshops)
            .where(eq(workshops.customerId, customerId))
            .orderBy(desc(workshops.createdAt)),
          db
            .select()
            .from(insuredEmployees)
            .where(eq(insuredEmployees.customerId, customerId))
            .orderBy(desc(insuredEmployees.createdAt)),
          db
            .select()
            .from(requests)
            .where(eq(requests.customerId, customerId))
            .orderBy(
              desc(requests.jalaliYear),
              desc(requests.jalaliMonth),
              desc(requests.createdAt),
            ),
          db
            .select()
            .from(auditEvents)
            .where(
              and(eq(auditEvents.entityType, 'customer'), eq(auditEvents.entityId, customerId)),
            )
            .orderBy(desc(auditEvents.createdAt))
            .limit(30),
        ]);

      return res.json({
        customer: {
          id: custRow.customer.id,
          userId: custRow.customer.userId,
          fullName: custRow.customer.fullName,
          mobile: custRow.customer.mobile,
          nationalId: custRow.customer.nationalId,
          maskedNationalId: maskNationalId(custRow.customer.nationalId),
          phone: custRow.customer.phone,
          officeNotes: custRow.customer.officeNotes,
          isActive: custRow.customer.isActive,
          createdAt: custRow.customer.createdAt,
          updatedAt: custRow.customer.updatedAt,
        },
        authStatus: custRow.user,
        drivers: custDrivers,
        workshops: custWorkshops,
        employees: custEmployees,
        requests: custRequests,
        auditHistory: custAudit,
      });
    }),
  );

  // 10. Update Customer Account Profile & Active/Disabled State
  router.patch(
    '/customers/:customerId',
    asyncHandler(async (req, res) => {
      const { customerId } = req.params;
      if (!isValidUuid(customerId)) {
        return res.status(404).json({ error: 'پرونده مشتری یافت نشد.' });
      }

      const parsed = adminUpdateCustomerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }
      const data = parsed.data;

      const [existing] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'پرونده مشتری یافت نشد.' });
      }

      if (data.mobile !== existing.mobile) {
        const [dup] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.username, data.mobile), ne(users.id, existing.userId)))
          .limit(1);
        if (dup) {
          return res.status(409).json({
            error: 'این شماره همراه متعلق به حساب دیگری است.',
            fieldErrors: { mobile: 'شماره همراه تکراری است.' },
          });
        }
      }

      const adminUser = req.auth!.user;
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(customers)
          .set({
            fullName: data.fullName,
            mobile: data.mobile,
            nationalId: data.nationalId ?? null,
            phone: data.phone || null,
            officeNotes: data.officeNotes || null,
            isActive: data.isActive,
            updatedAt: now,
          })
          .where(eq(customers.id, existing.id));

        await tx
          .update(users)
          .set({
            username: data.mobile,
            displayName: data.fullName,
            isActive: data.isActive,
            updatedAt: now,
          })
          .where(eq(users.id, existing.userId));

        if (!data.isActive) {
          await tx.delete(sessions).where(eq(sessions.userId, existing.userId));
        }

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: adminUser.id,
          actorRole: 'office_admin',
          entityType: 'customer',
          entityId: existing.id,
          eventType:
            existing.isActive !== data.isActive ? 'customer.status_changed' : 'customer.updated',
          customerVisible: false,
          summaryFa:
            existing.isActive !== data.isActive
              ? `وضعیت حساب مشتری «${data.fullName}» به «${data.isActive ? 'فعال' : 'غیرفعال'}» تغییر یافت.`
              : `اطلاعات پرونده مشتری «${data.fullName}» توسط دفتر ویرایش شد.`,
          oldValues: {
            fullName: existing.fullName,
            mobile: existing.mobile,
            maskedNationalId: maskNationalId(existing.nationalId, false),
            isActive: existing.isActive,
          },
          newValues: {
            fullName: data.fullName,
            mobile: data.mobile,
            maskedNationalId: maskNationalId(data.nationalId, false),
            isActive: data.isActive,
          },
        });
      });

      return res.json({ ok: true });
    }),
  );

  // 11. Office-Mediated Credential Reset (Never reveals old password; forces replacement at next login)
  router.post(
    '/customers/:customerId/reset-password',
    asyncHandler(async (req, res) => {
      const { customerId } = req.params;
      if (!isValidUuid(customerId)) {
        return res.status(404).json({ error: 'پرونده مشتری یافت نشد.' });
      }

      const parsed = adminResetPasswordSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const [custRow] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!custRow) {
        return res.status(404).json({ error: 'پرونده مشتری یافت نشد.' });
      }

      const mode = parsed.data.mode ?? 'generated';
      if (mode === 'national_id' && !custRow.nationalId) {
        return res.status(400).json({
          error:
            'برای این مشتری کد ملی ثبت نشده است؛ از گزینه صدور رمز موقت یک‌بارمصرف استفاده کنید.',
        });
      }

      const generatedPassword = mode === 'generated' ? generateTemporaryPassword() : null;
      const nextSecret = mode === 'generated' ? generatedPassword! : custRow.nationalId!;
      const passwordHash = await hashPassword(nextSecret);
      const adminUser = req.auth!.user;
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            passwordHash,
            forcePasswordChange: true,
            initialPasswordMode: mode,
            failedLoginCount: 0,
            lockedUntil: null,
            updatedAt: now,
          })
          .where(eq(users.id, custRow.userId));

        await tx.delete(sessions).where(eq(sessions.userId, custRow.userId));

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: adminUser.id,
          actorRole: 'office_admin',
          entityType: 'customer',
          entityId: custRow.id,
          eventType: 'auth.password_reset',
          customerVisible: false,
          summaryFa: `بازنشانی اعتبار ورود مشتری «${custRow.fullName}» توسط دفتر انجام شد (الزام تغییر در اولین ورود).`,
          newValues: { mode, forcePasswordChange: true },
        });
      });

      return res.json({
        ok: true,
        mode,
        forcePasswordChange: true,
        oneTimeTemporaryPassword: generatedPassword,
      });
    }),
  );

  // 12. Edit Driver Profile (Preserves ownership; logs masked audit diff)
  router.patch(
    '/drivers/:driverId',
    asyncHandler(async (req, res) => {
      const { driverId } = req.params;
      if (!isValidUuid(driverId)) {
        return res.status(404).json({ error: 'پرونده راننده یافت نشد.' });
      }

      const parsed = adminUpdateDriverSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const [existing] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'پرونده راننده یافت نشد.' });
      }

      const adminUser = req.auth!.user;
      const data = parsed.data;
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(drivers)
          .set({
            fullName: data.fullName,
            nationalId: data.nationalId,
            reviewState: data.reviewState,
            isArchived: data.isArchived,
            updatedAt: now,
          })
          .where(eq(drivers.id, existing.id));

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: adminUser.id,
          actorRole: 'office_admin',
          entityType: 'driver',
          entityId: existing.id,
          eventType: 'profile.driver_updated',
          customerVisible: false,
          summaryFa: `مشخصات راننده «${data.fullName}» توسط دفتر بررسی و ویرایش شد.`,
          oldValues: {
            fullName: existing.fullName,
            maskedNationalId: maskNationalId(existing.nationalId, false),
            reviewState: existing.reviewState,
            isArchived: existing.isArchived,
          },
          newValues: {
            fullName: data.fullName,
            maskedNationalId: maskNationalId(data.nationalId, false),
            reviewState: data.reviewState,
            isArchived: data.isArchived,
          },
        });
      });

      return res.json({ ok: true });
    }),
  );

  // 13. Edit Workshop Profile (Preserves ownership; logs masked audit diff)
  router.patch(
    '/workshops/:workshopId',
    asyncHandler(async (req, res) => {
      const { workshopId } = req.params;
      if (!isValidUuid(workshopId)) {
        return res.status(404).json({ error: 'پرونده کارگاه یافت نشد.' });
      }

      const parsed = adminUpdateWorkshopSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const [existing] = await db
        .select()
        .from(workshops)
        .where(eq(workshops.id, workshopId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'پرونده کارگاه یافت نشد.' });
      }

      const adminUser = req.auth!.user;
      const data = parsed.data;
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(workshops)
          .set({
            workshopName: data.workshopName,
            workshopCode: data.workshopCode,
            contactFullName: data.contactFullName,
            contactNationalId: data.contactNationalId,
            reviewState: data.reviewState,
            isArchived: data.isArchived,
            updatedAt: now,
          })
          .where(eq(workshops.id, existing.id));

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: adminUser.id,
          actorRole: 'office_admin',
          entityType: 'workshop',
          entityId: existing.id,
          eventType: 'profile.workshop_updated',
          customerVisible: false,
          summaryFa: `مشخصات کارگاه «${data.workshopName}» (کد: ${data.workshopCode}) توسط دفتر ویرایش شد.`,
          oldValues: {
            workshopName: existing.workshopName,
            workshopCode: existing.workshopCode,
            contactFullName: existing.contactFullName,
            maskedContactNationalId: maskNationalId(existing.contactNationalId, false),
            reviewState: existing.reviewState,
            isArchived: existing.isArchived,
          },
          newValues: {
            workshopName: data.workshopName,
            workshopCode: data.workshopCode,
            contactFullName: data.contactFullName,
            maskedContactNationalId: maskNationalId(data.contactNationalId, false),
            reviewState: data.reviewState,
            isArchived: data.isArchived,
          },
        });
      });

      return res.json({ ok: true });
    }),
  );

  // 14. System Audit Trail Viewer
  router.get(
    '/audit-events',
    asyncHandler(async (req, res) => {
      const page = Math.max(1, Number(req.query.page ?? 1));
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 25)));
      const entityType = String(req.query.entityType ?? '').trim();
      const offset = (page - 1) * pageSize;

      const whereClause = entityType ? eq(auditEvents.entityType, entityType) : undefined;

      const [rows, [totalRow]] = await Promise.all([
        db
          .select({
            id: auditEvents.id,
            actorRole: auditEvents.actorRole,
            actorName: users.displayName,
            entityType: auditEvents.entityType,
            entityId: auditEvents.entityId,
            requestId: auditEvents.requestId,
            eventType: auditEvents.eventType,
            summaryFa: auditEvents.summaryFa,
            oldValues: auditEvents.oldValues,
            newValues: auditEvents.newValues,
            createdAt: auditEvents.createdAt,
          })
          .from(auditEvents)
          .leftJoin(users, eq(auditEvents.actorUserId, users.id))
          .where(whereClause)
          .orderBy(desc(auditEvents.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ value: count() }).from(auditEvents).where(whereClause),
      ]);

      const totalCount = Number(totalRow?.value ?? 0);

      return res.json({
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        items: rows,
      });
    }),
  );

  return router;
}
