import { and, asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { ALLOWED_STATUS_TRANSITIONS, type RequestStatus } from '../../shared/domain.js';
import { maskNationalId } from '../../shared/iran-identifiers.js';
import {
  portalPasswordSchema,
  postMessageSchema,
  requestCancellationSchema,
} from '../../shared/validation.js';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import {
  auditEvents,
  customers,
  customerCards,
  customerMobiles,
  drivers,
  insuredEmployees,
  requestEmployeeSubmissions,
  requestFiles,
  requestMessages,
  requests,
  users,
  workshops,
} from '../db/schema.js';
import { requireAuth, requireCustomer, requireAdmin } from '../middleware/auth.js';
import { decryptCard } from '../services/card-vault.js';
import { decryptPortalPassword, encryptPortalPassword } from '../services/portal-credential.js';
import { identifyBank } from '../../shared/banks.js';
import { recordAuditEvent } from '../services/audit.js';
import { notifyAllOfficeAdmins, notifyCustomerByCustomerId } from '../services/notifications.js';
import {
  FileValidationError,
  type FileStorageProvider,
  type StoredFileMetadata,
  validateAndStorePrivateFile,
} from '../services/storage.js';
import { isRequestTerminal } from '../services/workflow.js';
import { asyncHandler, formatZodError, isValidUuid } from './helpers.js';
import { createMemoryUpload, runMulterMiddleware } from './upload-helper.js';

export function createRequestsAndFilesRouter(
  db: AppDb,
  config: AppConfig,
  storage: FileStorageProvider,
): Router {
  const router = Router();
  const upload = createMemoryUpload(config.maxUploadBytes, 5);

  // 1. Authorized Request Detail (Enforces ownership for customer; full context for office_admin)
  router.get(
    '/requests/:requestId',
    requireAuth(),
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      if (!isValidUuid(requestId)) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const auth = req.auth!;
      const [reqRow] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);

      if (!reqRow) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const isAdmin = auth.user.role === 'office_admin';
      if (!isAdmin && reqRow.customerId !== auth.customer?.id) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      let cardDetails = null;
      let mobileDetails = null;
      if (isAdmin && reqRow.cardId) {
        const [card] = await db
          .select()
          .from(customerCards)
          .where(
            and(
              eq(customerCards.id, reqRow.cardId),
              eq(customerCards.customerId, reqRow.customerId),
            ),
          )
          .limit(1);
        if (card) {
          const data = decryptCard(config, card.customerId, card.encryptedData);
          cardDetails = {
            ...data,
            id: card.id,
            bankName: identifyBank(data.number)?.name_fa ?? 'بانک ناشناخته',
          };
        }
      }
      if (isAdmin && reqRow.mobileId) {
        const [mobile] = await db
          .select()
          .from(customerMobiles)
          .where(
            and(
              eq(customerMobiles.id, reqRow.mobileId),
              eq(customerMobiles.customerId, reqRow.customerId),
            ),
          )
          .limit(1);
        if (mobile)
          mobileDetails = {
            id: mobile.id,
            mobile: mobile.mobile,
            ownerName: mobile.ownerName,
            verified: mobile.verified,
          };
      }

      const [customerRow] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, reqRow.customerId))
        .limit(1);

      let driverData = null;
      if (reqRow.driverId) {
        const [d] = await db
          .select()
          .from(drivers)
          .where(and(eq(drivers.id, reqRow.driverId), eq(drivers.customerId, reqRow.customerId)))
          .limit(1);
        if (d) {
          driverData = {
            id: d.id,
            fullName: d.fullName,
            maskedNationalId: maskNationalId(d.nationalId),
            // Reveal full national ID ONLY to authorized office staff performing manual portal tasks
            nationalId: isAdmin ? d.nationalId : undefined,
            portalPassword:
              isAdmin && d.portalPasswordEncrypted
                ? decryptPortalPassword(
                    config,
                    d.customerId,
                    'driver',
                    d.id,
                    d.portalPasswordEncrypted,
                  )
                : undefined,
            reviewState: d.reviewState,
          };
        }
      }

      let workshopData = null;
      if (reqRow.workshopId) {
        const [w] = await db
          .select()
          .from(workshops)
          .where(
            and(eq(workshops.id, reqRow.workshopId), eq(workshops.customerId, reqRow.customerId)),
          )
          .limit(1);
        if (w) {
          workshopData = {
            id: w.id,
            workshopName: w.workshopName,
            workshopCode: w.workshopCode,
            contactFullName: w.contactFullName,
            maskedContactNationalId: maskNationalId(w.contactNationalId),
            contactNationalId: isAdmin ? w.contactNationalId : undefined,
            portalPassword:
              isAdmin && w.portalPasswordEncrypted
                ? decryptPortalPassword(
                    config,
                    w.customerId,
                    'workshop',
                    w.id,
                    w.portalPasswordEncrypted,
                  )
                : undefined,
            reviewState: w.reviewState,
          };
        }
      }

      const employeeSubmissionsRaw = await db
        .select({
          submissionId: requestEmployeeSubmissions.id,
          fullNameSnapshot: requestEmployeeSubmissions.fullNameSnapshot,
          insuranceNumberSnapshot: requestEmployeeSubmissions.insuranceNumberSnapshot,
          createdAt: requestEmployeeSubmissions.createdAt,
          nationalId: insuredEmployees.nationalId,
          employeeId: insuredEmployees.id,
        })
        .from(requestEmployeeSubmissions)
        .innerJoin(
          insuredEmployees,
          eq(requestEmployeeSubmissions.insuredEmployeeId, insuredEmployees.id),
        )
        .where(eq(requestEmployeeSubmissions.requestId, reqRow.id));

      const messagesRaw = await db
        .select({
          id: requestMessages.id,
          authorRole: requestMessages.authorRole,
          authorName: users.displayName,
          messageKind: requestMessages.messageKind,
          body: requestMessages.body,
          createdAt: requestMessages.createdAt,
        })
        .from(requestMessages)
        .innerJoin(users, eq(requestMessages.authorUserId, users.id))
        .where(eq(requestMessages.requestId, reqRow.id))
        .orderBy(asc(requestMessages.createdAt));

      const filesRaw = await db
        .select()
        .from(requestFiles)
        .where(and(eq(requestFiles.requestId, reqRow.id), eq(requestFiles.isDeleted, false)))
        .orderBy(asc(requestFiles.createdAt));

      const timelineEvents = await db
        .select({
          id: auditEvents.id,
          actorRole: auditEvents.actorRole,
          eventType: auditEvents.eventType,
          summaryFa: auditEvents.summaryFa,
          oldValues: auditEvents.oldValues,
          newValues: auditEvents.newValues,
          createdAt: auditEvents.createdAt,
        })
        .from(auditEvents)
        .where(
          isAdmin
            ? eq(auditEvents.requestId, reqRow.id)
            : and(eq(auditEvents.requestId, reqRow.id), eq(auditEvents.customerVisible, true)),
        )
        .orderBy(asc(auditEvents.createdAt));

      return res.json({
        request: {
          id: reqRow.id,
          referenceCode: reqRow.referenceCode,
          requestType: reqRow.requestType,
          jalaliYear: reqRow.jalaliYear,
          jalaliMonth: reqRow.jalaliMonth,
          calendarSystem: reqRow.calendarSystem,
          status: reqRow.status,
          awaitingCustomerInfo: reqRow.awaitingCustomerInfo,
          awaitingCustomerInfoNote: reqRow.awaitingCustomerInfoNote,
          cancellationRequested: reqRow.cancellationRequested,
          cancellationRequestReason: reqRow.cancellationRequestReason,
          cancellationRequestedAt: reqRow.cancellationRequestedAt,
          cancellationDecision: reqRow.cancellationDecision,
          cancellationDecisionNote: reqRow.cancellationDecisionNote,
          cancellationDecidedAt: reqRow.cancellationDecidedAt,
          finalAmount: reqRow.finalAmount,
          paymentCardNumber: isAdmin ? reqRow.paymentCardNumber : undefined,
          currencyUnit: reqRow.currencyUnit,
          initialExplanation: reqRow.initialExplanation,
          hasNewEmployeeSubmission: reqRow.hasNewEmployeeSubmission,
          submittedAt: reqRow.submittedAt,
          completedAt: reqRow.completedAt,
          rejectedAt: reqRow.rejectedAt,
          cancelledAt: reqRow.cancelledAt,
          lastActivityAt: reqRow.lastActivityAt,
          allowedNextStatuses: isAdmin
            ? ALLOWED_STATUS_TRANSITIONS[reqRow.status as RequestStatus]
            : [],
        },
        customer: customerRow
          ? {
              id: customerRow.id,
              fullName: customerRow.fullName,
              mobile: customerRow.mobile,
              maskedNationalId: maskNationalId(customerRow.nationalId),
              nationalId: isAdmin ? customerRow.nationalId : undefined,
              phone: customerRow.phone,
            }
          : null,
        cardDetails,
        mobileDetails,
        driver: driverData,
        workshop: workshopData,
        employeeSubmissions: employeeSubmissionsRaw.map((emp) => ({
          id: emp.submissionId,
          employeeId: emp.employeeId,
          fullName: emp.fullNameSnapshot,
          insuranceNumber: emp.insuranceNumberSnapshot,
          maskedNationalId: maskNationalId(emp.nationalId),
          nationalId: isAdmin ? emp.nationalId : undefined,
          createdAt: emp.createdAt,
        })),
        messages: messagesRaw,
        // Never include `storageKey` in API responses
        files: filesRaw.map((f) => ({
          id: f.id,
          messageId: f.messageId,
          employeeSubmissionId: f.employeeSubmissionId,
          uploaderRole: f.uploaderRole,
          classification: f.classification,
          displayFilename: f.displayFilename,
          detectedMimeType: f.detectedMimeType,
          byteSize: f.byteSize,
          createdAt: f.createdAt,
          downloadUrl: `/api/files/${f.id}/download`,
        })),
        timeline: timelineEvents.map((ev) => ({
          id: ev.id,
          actorRole: ev.actorRole,
          eventType: ev.eventType,
          summaryFa: ev.summaryFa,
          oldValues: isAdmin ? ev.oldValues : undefined,
          newValues: isAdmin ? ev.newValues : undefined,
          createdAt: ev.createdAt,
        })),
      });
    }),
  );

  // Only office staff can change a stored profile credential. All request history uses the current value.
  router.patch(
    '/requests/:requestId/profile-portal-password',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      if (!isValidUuid(requestId)) return res.status(404).json({ error: 'درخواست یافت نشد.' });
      const parsed = z.object({ password: portalPasswordSchema }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json(formatZodError(parsed.error));
      const [request] = await db
        .select({
          customerId: requests.customerId,
          driverId: requests.driverId,
          workshopId: requests.workshopId,
        })
        .from(requests)
        .where(eq(requests.id, requestId))
        .limit(1);
      if (!request) return res.status(404).json({ error: 'درخواست یافت نشد.' });
      if (request.driverId) {
        const [row] = await db
          .update(drivers)
          .set({
            portalPasswordEncrypted: encryptPortalPassword(
              config,
              request.customerId,
              'driver',
              request.driverId,
              parsed.data.password,
            ),
            updatedAt: new Date(),
          })
          .where(and(eq(drivers.id, request.driverId), eq(drivers.customerId, request.customerId)))
          .returning({ id: drivers.id });
        if (!row) return res.status(404).json({ error: 'پرونده راننده یافت نشد.' });
      } else if (request.workshopId) {
        const [row] = await db
          .update(workshops)
          .set({
            portalPasswordEncrypted: encryptPortalPassword(
              config,
              request.customerId,
              'workshop',
              request.workshopId,
              parsed.data.password,
            ),
            updatedAt: new Date(),
          })
          .where(
            and(eq(workshops.id, request.workshopId), eq(workshops.customerId, request.customerId)),
          )
          .returning({ id: workshops.id });
        if (!row) return res.status(404).json({ error: 'پرونده کارگاه یافت نشد.' });
      } else return res.status(404).json({ error: 'پرونده یافت نشد.' });
      await recordAuditEvent(db, {
        actorUserId: req.auth!.user.id,
        actorRole: 'office_admin',
        entityType: 'request',
        entityId: requestId,
        requestId,
        eventType: 'profile_portal_password_updated',
        summaryFa: 'رمز سامانه تأمین اجتماعی پرونده توسط دفتر به‌روزرسانی شد.',
      });
      return res.json({ ok: true });
    }),
  );

  // Verification is a manual office flag shared by all requests that reference this mobile.
  router.patch(
    '/requests/:requestId/mobile-verification',
    requireAdmin,
    asyncHandler(async (req, res) => {
      if (!isValidUuid(req.params.requestId)) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }
      const parsed = z.object({ verified: z.boolean() }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json(formatZodError(parsed.error));
      const [request] = await db
        .select({ mobileId: requests.mobileId, customerId: requests.customerId })
        .from(requests)
        .where(eq(requests.id, req.params.requestId))
        .limit(1);
      if (!request?.mobileId) {
        return res.status(404).json({ error: 'شماره موبایل برای این درخواست ثبت نشده است.' });
      }
      const [mobile] = await db
        .update(customerMobiles)
        .set({ verified: parsed.data.verified })
        .where(
          and(
            eq(customerMobiles.id, request.mobileId),
            eq(customerMobiles.customerId, request.customerId),
          ),
        )
        .returning({ verified: customerMobiles.verified });
      if (!mobile) return res.status(404).json({ error: 'شماره موبایل یافت نشد.' });
      return res.json({ verified: mobile.verified });
    }),
  );

  // Remove the link only on this request; archive the reusable entry so history remains intact.
  router.delete(
    '/requests/:requestId/saved-contacts/:kind',
    requireAdmin,
    asyncHandler(async (req, res) => {
      const { requestId, kind } = req.params;
      if (!requestId || !kind || !isValidUuid(requestId) || !['card', 'mobile'].includes(kind)) {
        return res.status(404).json({ error: 'اطلاعات مورد نظر یافت نشد.' });
      }
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select({
            id: requests.id,
            customerId: requests.customerId,
            cardId: requests.cardId,
            mobileId: requests.mobileId,
          })
          .from(requests)
          .where(eq(requests.id, requestId))
          .limit(1)
          .for('update');
        if (!row) return false;
        if (kind === 'card' && row.cardId) {
          const [card] = await tx
            .update(customerCards)
            .set({ isArchived: true })
            .where(
              and(eq(customerCards.id, row.cardId), eq(customerCards.customerId, row.customerId)),
            )
            .returning({ id: customerCards.id });
          if (!card) return false;
          await tx.update(requests).set({ cardId: null }).where(eq(requests.id, row.id));
          // When no historical request references this card, erase the encrypted record as well.
          const [remaining] = await tx
            .select({ id: requests.id })
            .from(requests)
            .where(eq(requests.cardId, card.id))
            .limit(1);
          if (!remaining) await tx.delete(customerCards).where(eq(customerCards.id, card.id));
          return true;
        }
        if (kind === 'mobile' && row.mobileId) {
          const [mobile] = await tx
            .update(customerMobiles)
            .set({ isArchived: true })
            .where(
              and(
                eq(customerMobiles.id, row.mobileId),
                eq(customerMobiles.customerId, row.customerId),
              ),
            )
            .returning({ id: customerMobiles.id });
          if (!mobile) return false;
          await tx.update(requests).set({ mobileId: null }).where(eq(requests.id, row.id));
          const [remaining] = await tx
            .select({ id: requests.id })
            .from(requests)
            .where(eq(requests.mobileId, mobile.id))
            .limit(1);
          if (!remaining) await tx.delete(customerMobiles).where(eq(customerMobiles.id, mobile.id));
          return true;
        }
        return false;
      });
      if (!result) return res.status(404).json({ error: 'اطلاعات مورد نظر یافت نشد.' });
      return res.json({ ok: true });
    }),
  );

  // 2. Post Explanation / Message (+ Optional Permitted Attachments)
  router.post(
    '/requests/:requestId/messages',
    requireAuth(),
    runMulterMiddleware(upload.array('attachments', 5), config.maxUploadMb),
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      if (!isValidUuid(requestId)) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const auth = req.auth!;
      const isAdmin = auth.user.role === 'office_admin';

      const [reqRow] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);

      if (!reqRow || (!isAdmin && reqRow.customerId !== auth.customer?.id)) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      if (!isAdmin && isRequestTerminal(reqRow.status as RequestStatus)) {
        return res.status(400).json({
          error: 'این درخواست بسته شده است و امکان ارسال پیام جدید برای آن وجود ندارد.',
        });
      }

      const parsed = postMessageSchema.safeParse({ body: req.body?.body ?? '' });
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
      const storedFiles: StoredFileMetadata[] = [];

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
        const classification = isAdmin ? 'office_output' : 'customer_attachment';

        await db.transaction(async (tx) => {
          const [msgRow] = await tx
            .insert(requestMessages)
            .values({
              requestId: reqRow.id,
              authorUserId: auth.user.id,
              authorRole: auth.user.role,
              messageKind: 'explanation',
              body: parsed.data.body,
            })
            .returning();

          await tx
            .update(requests)
            .set({
              lastActivityAt: now,
              updatedAt: now,
            })
            .where(eq(requests.id, reqRow.id));

          await recordAuditEvent(tx as unknown as AppDb, {
            actorUserId: auth.user.id,
            actorRole: auth.user.role,
            entityType: 'request',
            entityId: reqRow.id,
            requestId: reqRow.id,
            eventType: 'request.message_added',
            customerVisible: true,
            summaryFa: isAdmin
              ? 'توضیح جدید توسط کارشناس دفتر ثبت شد.'
              : 'توضیح جدید توسط مشتری ثبت شد.',
          });

          for (const fileMeta of storedFiles) {
            const [fileRow] = await tx
              .insert(requestFiles)
              .values({
                requestId: reqRow.id,
                messageId: msgRow!.id,
                uploaderUserId: auth.user.id,
                uploaderRole: auth.user.role,
                classification,
                storageKey: fileMeta.storageKey,
                displayFilename: fileMeta.displayFilename,
                detectedMimeType: fileMeta.detectedMimeType,
                byteSize: fileMeta.byteSize,
                sha256Checksum: fileMeta.sha256Checksum,
                scanState: fileMeta.scanState,
              })
              .returning();

            await recordAuditEvent(tx as unknown as AppDb, {
              actorUserId: auth.user.id,
              actorRole: auth.user.role,
              entityType: 'file',
              entityId: fileRow!.id,
              requestId: reqRow.id,
              eventType: 'request.file_uploaded',
              customerVisible: true,
              summaryFa: isAdmin
                ? `فایل خروجی دفتر «${fileMeta.displayFilename}» بارگذاری شد.`
                : `فایل پیوست مشتری «${fileMeta.displayFilename}» بارگذاری شد.`,
            });
          }

          if (isAdmin) {
            await notifyCustomerByCustomerId(tx as unknown as AppDb, reqRow.customerId, {
              notificationType: 'office_message',
              requestId: reqRow.id,
              titleFa: `توضیح جدید دفتر در درخواست ${reqRow.referenceCode}`,
              bodyFa: 'پیام جدیدی از سوی دفتر در پرونده درخواست شما ثبت شده است.',
              dedupeKey: `cust_office_msg:${msgRow!.id}`,
            });

            if (storedFiles.length > 0) {
              await notifyCustomerByCustomerId(tx as unknown as AppDb, reqRow.customerId, {
                notificationType: 'office_file_uploaded',
                requestId: reqRow.id,
                titleFa: `فایل خروجی جدید (${reqRow.referenceCode})`,
                bodyFa: 'فایل جدیدی توسط دفتر در پرونده درخواست شما قرار گرفت.',
                dedupeKey: `cust_office_file_msg:${msgRow!.id}`,
              });
            }
          } else {
            await notifyAllOfficeAdmins(tx as unknown as AppDb, {
              notificationType: 'customer_message',
              requestId: reqRow.id,
              titleFa: `توضیح جدید مشتری (${reqRow.referenceCode})`,
              bodyFa: `مشتری توضیح جدیدی در درخواست شماره ${reqRow.referenceCode} ثبت کرد.`,
              dedupeKey: `admin_cust_msg:${msgRow!.id}`,
            });
          }
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

  // 3. Customer Cancellation Request (Does NOT cancel directly; awaits office decision)
  router.post(
    '/requests/:requestId/request-cancellation',
    requireCustomer,
    asyncHandler(async (req, res) => {
      const { requestId } = req.params;
      if (!isValidUuid(requestId)) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      const customer = req.auth!.customer!;
      const user = req.auth!.user;

      const [reqRow] = await db
        .select()
        .from(requests)
        .where(and(eq(requests.id, requestId), eq(requests.customerId, customer.id)))
        .limit(1);

      if (!reqRow) {
        return res.status(404).json({ error: 'درخواست مورد نظر یافت نشد.' });
      }

      if (isRequestTerminal(reqRow.status as RequestStatus)) {
        return res.status(400).json({
          error: 'این درخواست در وضعیت پایانی قرار دارد و امکان ثبت درخواست لغو وجود ندارد.',
        });
      }

      if (reqRow.cancellationDecision === 'pending') {
        return res.status(400).json({
          error: 'درخواست لغو شما پیش‌تر ثبت شده و در انتظار تصمیم دفتر است.',
        });
      }

      const parsed = requestCancellationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }

      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(requests)
          .set({
            cancellationRequested: true,
            cancellationRequestReason: parsed.data.reason,
            cancellationRequestedAt: now,
            cancellationDecision: 'pending',
            cancellationDecisionNote: null,
            cancellationDecidedAt: null,
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(eq(requests.id, reqRow.id));

        const [msgRow] = await tx
          .insert(requestMessages)
          .values({
            requestId: reqRow.id,
            authorUserId: user.id,
            authorRole: 'customer',
            messageKind: 'cancellation_request',
            body: `درخواست لغو توسط مشتری: ${parsed.data.reason}`,
          })
          .returning();

        await recordAuditEvent(tx as unknown as AppDb, {
          actorUserId: user.id,
          actorRole: 'customer',
          entityType: 'request',
          entityId: reqRow.id,
          requestId: reqRow.id,
          eventType: 'request.cancellation_requested',
          customerVisible: true,
          summaryFa: 'درخواست لغو توسط مشتری ثبت شد (در انتظار بررسی و تصمیم دفتر).',
        });

        await notifyAllOfficeAdmins(tx as unknown as AppDb, {
          notificationType: 'cancellation_requested',
          requestId: reqRow.id,
          titleFa: `درخواست لغو از سوی مشتری (${reqRow.referenceCode})`,
          bodyFa: `مشتری تقاضای لغو درخواست شماره ${reqRow.referenceCode} را ثبت کرده است.`,
          dedupeKey: `admin_cancel_req:${msgRow!.id}`,
        });
      });

      return res.json({ ok: true });
    }),
  );

  // 4. Protected File Download (Re-verifies ownership/role on every download)
  router.get(
    '/files/:fileId/download',
    requireAuth(),
    asyncHandler(async (req, res) => {
      const { fileId } = req.params;
      if (!isValidUuid(fileId)) {
        return res.status(404).json({ error: 'فایل مورد نظر یافت نشد.' });
      }

      const auth = req.auth!;
      const [fileRow] = await db
        .select()
        .from(requestFiles)
        .where(and(eq(requestFiles.id, fileId), eq(requestFiles.isDeleted, false)))
        .limit(1);

      if (!fileRow) {
        return res.status(404).json({ error: 'فایل مورد نظر یافت نشد.' });
      }

      const [parentRequest] = await db
        .select({ id: requests.id, customerId: requests.customerId })
        .from(requests)
        .where(eq(requests.id, fileRow.requestId))
        .limit(1);

      if (!parentRequest) {
        return res.status(404).json({ error: 'فایل مورد نظر یافت نشد.' });
      }

      const isAdmin = auth.user.role === 'office_admin';
      if (!isAdmin && parentRequest.customerId !== auth.customer?.id) {
        return res.status(404).json({ error: 'فایل مورد نظر یافت نشد.' });
      }

      const exists = await storage.exists(fileRow.storageKey);
      if (!exists) {
        return res.status(404).json({ error: 'فایل فیزیکی در مخزن خصوصی یافت نشد.' });
      }

      const buffer = await storage.read(fileRow.storageKey);

      const asciiFallback = fileRow.displayFilename.replace(/[^\x20-\x7E]/g, '_') || 'document';
      const encodedUtf8 = encodeURIComponent(fileRow.displayFilename);

      res.setHeader('Content-Type', fileRow.detectedMimeType);
      res.setHeader('Content-Length', String(buffer.byteLength));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`,
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');

      return res.send(buffer);
    }),
  );

  return router;
}
