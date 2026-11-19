import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, isNull, notInArray } from 'drizzle-orm';
import { Router } from 'express';
import { maskNationalId } from '../../shared/iran-identifiers.js';
import { identifyBank } from '../../shared/banks.js';
import { encryptCard } from '../services/card-vault.js';
import { encryptPortalPassword } from '../services/portal-credential.js';
import type { z } from 'zod';
import type { cardSelectionSchema, mobileSelectionSchema } from '../../shared/validation.js';
import { formatJalaliPeriod } from '../../shared/jalali.js';
import {
  createDriverRequestSchema,
  createWorkshopRequestSchema,
  jalaliMonthSchema,
  jalaliYearSchema,
  paymentPreviewSchema,
} from '../../shared/validation.js';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import {
  customerCards,
  customerMobiles,
  drivers,
  insuredEmployees,
  notifications,
  requestEmployeeSubmissions,
  requestFiles,
  requestMessages,
  requests,
  workshops,
} from '../db/schema.js';
import { requireCustomer } from '../middleware/auth.js';
import { recordAuditEvent } from '../services/audit.js';
import { notifyAllOfficeAdmins, notifyCustomerByCustomerId } from '../services/notifications.js';
import { generateRequestReference } from '../services/security.js';
import {
  FileValidationError,
  type FileStorageProvider,
  type StoredFileMetadata,
  validateAndStorePrivateFile,
} from '../services/storage.js';
import { asyncHandler, formatZodError, isValidUuid } from './helpers.js';
import { createMemoryUpload, runMulterMiddleware } from './upload-helper.js';

export function createCustomerPortalRouter(
  db: AppDb,
  config: AppConfig,
  storage: FileStorageProvider,
): Router {
  const router = Router();
  router.use(requireCustomer);

  const upload = createMemoryUpload(config.maxUploadBytes, 10);

  // Reusable options belong to the authenticated customer, never to a driver/workshop.
  router.get(
    '/saved-contacts',
    asyncHandler(async (req, res) => {
      const id = req.auth!.customer!.id;
      const [cards, mobiles] = await Promise.all([
        db
          .select({
            id: customerCards.id,
            holderName: customerCards.holderName,
            lastFour: customerCards.lastFour,
            bankId: customerCards.bankId,
          })
          .from(customerCards)
          .where(and(eq(customerCards.customerId, id), eq(customerCards.isArchived, false)))
          .orderBy(desc(customerCards.createdAt)),
        db
          .select({
            id: customerMobiles.id,
            mobile: customerMobiles.mobile,
            ownerName: customerMobiles.ownerName,
            verified: customerMobiles.verified,
          })
          .from(customerMobiles)
          .where(and(eq(customerMobiles.customerId, id), eq(customerMobiles.isArchived, false)))
          .orderBy(desc(customerMobiles.createdAt)),
      ]);
      return res.json({ cards, mobiles });
    }),
  );

  // This is a transfer instruction, not a payment transaction or proof of payment.
  const getPendingPayments = async (customerId: string) =>
    db
      .select({
        id: requests.id,
        referenceCode: requests.referenceCode,
        requestType: requests.requestType,
        jalaliYear: requests.jalaliYear,
        jalaliMonth: requests.jalaliMonth,
        finalAmount: requests.finalAmount,
        currencyUnit: requests.currencyUnit,
        paymentCardNumber: requests.paymentCardNumber,
        driverName: drivers.fullName,
        workshopName: workshops.workshopName,
      })
      .from(requests)
      .leftJoin(drivers, and(eq(requests.driverId, drivers.id), eq(drivers.customerId, customerId)))
      .leftJoin(
        workshops,
        and(eq(requests.workshopId, workshops.id), eq(workshops.customerId, customerId)),
      )
      .where(and(eq(requests.customerId, customerId), eq(requests.status, 'awaiting_payment')))
      .orderBy(desc(requests.submittedAt));

  router.get(
    '/pending-payments',
    asyncHandler(async (req, res) => {
      const rows = await getPendingPayments(req.auth!.customer!.id);
      return res.json({ items: rows });
    }),
  );

  router.post(
    '/payment-preview',
    asyncHandler(async (req, res) => {
      const parsed = paymentPreviewSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(formatZodError(parsed.error));
      const pending = await getPendingPayments(req.auth!.customer!.id);
      const byId = new Map(pending.map((row) => [row.id, row]));
      const selected = parsed.data.requestIds.map((id) => byId.get(id));
      if (
        selected.some(
          (row) =>
            !row ||
            row.finalAmount === null ||
            !row.paymentCardNumber ||
            !['TOMAN', 'RIAL'].includes(row.currencyUnit),
        )
      )
        return res.status(409).json({
          error:
            'یک یا چند درخواست تغییر کرده یا دیگر قابل انتخاب نیستند. فهرست را دوباره بارگذاری کنید.',
        });
      const groups = new Map<
        string,
        { cardNumber: string; items: typeof pending; totals: Map<string, bigint> }
      >();
      const grandTotals = new Map<string, bigint>();
      for (const row of selected) {
        if (!row || row.finalAmount === null || !row.paymentCardNumber) continue;
        let group = groups.get(row.paymentCardNumber);
        if (!group) {
          group = { cardNumber: row.paymentCardNumber, items: [], totals: new Map() };
          groups.set(row.paymentCardNumber, group);
        }
        group.items.push(row);
        group.totals.set(
          row.currencyUnit,
          (group.totals.get(row.currencyUnit) ?? 0n) + BigInt(row.finalAmount),
        );
        grandTotals.set(
          row.currencyUnit,
          (grandTotals.get(row.currencyUnit) ?? 0n) + BigInt(row.finalAmount),
        );
      }
      const serialize = (map: Map<string, bigint>) =>
        Array.from(map, ([currencyUnit, amount]) => ({ currencyUnit, amount: amount.toString() }));
      return res.json({
        groups: Array.from(groups.values(), (group) => ({
          cardNumber: group.cardNumber,
          items: group.items,
          totals: serialize(group.totals),
        })),
        totals: serialize(grandTotals),
      });
    }),
  );

  // 1. Customer Portal Overview (Drivers + Workshops + Monthly History newest-first)
  router.get(
    '/overview',
    asyncHandler(async (req, res) => {
      const customer = req.auth!.customer!;
      const user = req.auth!.user;

      const [myDrivers, myWorkshops, myRequests, myEmployees, [unreadRow]] = await Promise.all([
        db
          .select()
          .from(drivers)
          .where(and(eq(drivers.customerId, customer.id), eq(drivers.isArchived, false)))
          .orderBy(desc(drivers.createdAt)),
        db
          .select()
          .from(workshops)
          .where(and(eq(workshops.customerId, customer.id), eq(workshops.isArchived, false)))
          .orderBy(desc(workshops.createdAt)),
        db
          .select()
          .from(requests)
          .where(eq(requests.customerId, customer.id))
          .orderBy(desc(requests.jalaliYear), desc(requests.jalaliMonth), desc(requests.createdAt)),
        db.select().from(insuredEmployees).where(eq(insuredEmployees.customerId, customer.id)),
        db
          .select({ value: count() })
          .from(notifications)
          .where(and(eq(notifications.recipientUserId, user.id), isNull(notifications.readAt))),
      ]);

      const requestsByDriver = new Map<string, typeof myRequests>();
      const requestsByWorkshop = new Map<string, typeof myRequests>();

      for (const r of myRequests) {
        if (r.driverId) {
          const list = requestsByDriver.get(r.driverId) ?? [];
          list.push(r);
          requestsByDriver.set(r.driverId, list);
        }
        if (r.workshopId) {
          const list = requestsByWorkshop.get(r.workshopId) ?? [];
          list.push(r);
          requestsByWorkshop.set(r.workshopId, list);
        }
      }

      const employeeCountByWorkshop = new Map<string, number>();
      for (const emp of myEmployees) {
        employeeCountByWorkshop.set(
          emp.workshopId,
          (employeeCountByWorkshop.get(emp.workshopId) ?? 0) + 1,
        );
      }

      return res.json({
        account: {
          fullName: customer.fullName,
          mobile: customer.mobile,
          maskedNationalId: maskNationalId(customer.nationalId),
          phone: customer.phone ?? null,
        },
        unreadNotificationsCount: Number(unreadRow?.value ?? 0),
        drivers: myDrivers.map((d) => ({
          id: d.id,
          fullName: d.fullName,
          maskedNationalId: maskNationalId(d.nationalId),
          hasPortalPassword: Boolean(d.portalPasswordEncrypted),
          reviewState: d.reviewState,
          createdAt: d.createdAt,
          requests: (requestsByDriver.get(d.id) ?? []).map((r) => ({
            id: r.id,
            referenceCode: r.referenceCode,
            jalaliYear: r.jalaliYear,
            jalaliMonth: r.jalaliMonth,
            status: r.status,
            awaitingCustomerInfo: r.awaitingCustomerInfo,
            finalAmount: r.finalAmount,
            currencyUnit: r.currencyUnit,
            submittedAt: r.submittedAt,
          })),
        })),
        workshops: myWorkshops.map((w) => ({
          id: w.id,
          workshopName: w.workshopName,
          workshopCode: w.workshopCode,
          contactFullName: w.contactFullName,
          maskedContactNationalId: maskNationalId(w.contactNationalId),
          hasPortalPassword: Boolean(w.portalPasswordEncrypted),
          reviewState: w.reviewState,
          employeesCount: employeeCountByWorkshop.get(w.id) ?? 0,
          createdAt: w.createdAt,
          requests: (requestsByWorkshop.get(w.id) ?? []).map((r) => ({
            id: r.id,
            referenceCode: r.referenceCode,
            jalaliYear: r.jalaliYear,
            jalaliMonth: r.jalaliMonth,
            status: r.status,
            awaitingCustomerInfo: r.awaitingCustomerInfo,
            hasNewEmployeeSubmission: r.hasNewEmployeeSubmission,
            finalAmount: r.finalAmount,
            currencyUnit: r.currencyUnit,
            submittedAt: r.submittedAt,
          })),
        })),
      });
    }),
  );

  // 2. Single Driver Profile & Full Monthly History (Strict Ownership Check)
  router.get(
    '/drivers/:driverId',
    asyncHandler(async (req, res) => {
      const { driverId } = req.params;
      if (!isValidUuid(driverId)) {
        return res.status(404).json({ error: 'پرونده راننده مورد نظر یافت نشد.' });
      }
      const customer = req.auth!.customer!;
      const [driverRow] = await db
        .select()
        .from(drivers)
        .where(and(eq(drivers.id, driverId), eq(drivers.customerId, customer.id)))
        .limit(1);

      if (!driverRow) {
        return res.status(404).json({ error: 'پرونده راننده مورد نظر یافت نشد.' });
      }

      const history = await db
        .select()
        .from(requests)
        .where(and(eq(requests.driverId, driverRow.id), eq(requests.customerId, customer.id)))
        .orderBy(desc(requests.jalaliYear), desc(requests.jalaliMonth), desc(requests.createdAt));

      return res.json({
        driver: {
          id: driverRow.id,
          fullName: driverRow.fullName,
          maskedNationalId: maskNationalId(driverRow.nationalId),
          reviewState: driverRow.reviewState,
          isArchived: driverRow.isArchived,
          createdAt: driverRow.createdAt,
        },
        requests: history.map((r) => ({
          id: r.id,
          referenceCode: r.referenceCode,
          jalaliYear: r.jalaliYear,
          jalaliMonth: r.jalaliMonth,
          status: r.status,
          awaitingCustomerInfo: r.awaitingCustomerInfo,
          finalAmount: r.finalAmount,
          currencyUnit: r.currencyUnit,
          submittedAt: r.submittedAt,
          completedAt: r.completedAt,
        })),
      });
    }),
  );

  // 3. Single Workshop Profile & Full Monthly History (Strict Ownership Check)
  router.get(
    '/workshops/:workshopId',
    asyncHandler(async (req, res) => {
      const { workshopId } = req.params;
      if (!isValidUuid(workshopId)) {
        return res.status(404).json({ error: 'پرونده کارگاه مورد نظر یافت نشد.' });
      }
      const customer = req.auth!.customer!;
      const [workshopRow] = await db
        .select()
        .from(workshops)
        .where(and(eq(workshops.id, workshopId), eq(workshops.customerId, customer.id)))
        .limit(1);

      if (!workshopRow) {
        return res.status(404).json({ error: 'پرونده کارگاه مورد نظر یافت نشد.' });
      }

      const [history, employees] = await Promise.all([
        db
          .select()
          .from(requests)
          .where(and(eq(requests.workshopId, workshopRow.id), eq(requests.customerId, customer.id)))
          .orderBy(desc(requests.jalaliYear), desc(requests.jalaliMonth), desc(requests.createdAt)),
        db
          .select()
          .from(insuredEmployees)
          .where(
            and(
              eq(insuredEmployees.workshopId, workshopRow.id),
              eq(insuredEmployees.customerId, customer.id),
            ),
          )
          .orderBy(desc(insuredEmployees.createdAt)),
      ]);

      return res.json({
        workshop: {
          id: workshopRow.id,
          workshopName: workshopRow.workshopName,
          workshopCode: workshopRow.workshopCode,
          contactFullName: workshopRow.contactFullName,
          maskedContactNationalId: maskNationalId(workshopRow.contactNationalId),
          reviewState: workshopRow.reviewState,
          isArchived: workshopRow.isArchived,
          createdAt: workshopRow.createdAt,
        },
        employees: employees.map((e) => ({
          id: e.id,
          fullName: e.fullName,
          maskedNationalId: maskNationalId(e.nationalId),
          insuranceNumber: e.insuranceNumber,
          state: e.state,
          createdAt: e.createdAt,
        })),
        requests: history.map((r) => ({
          id: r.id,
          referenceCode: r.referenceCode,
          jalaliYear: r.jalaliYear,
          jalaliMonth: r.jalaliMonth,
          status: r.status,
          awaitingCustomerInfo: r.awaitingCustomerInfo,
          hasNewEmployeeSubmission: r.hasNewEmployeeSubmission,
          finalAmount: r.finalAmount,
          currencyUnit: r.currencyUnit,
          submittedAt: r.submittedAt,
          completedAt: r.completedAt,
        })),
      });
    }),
  );

  // 4. Duplicate Insurance Month Check (Warns without hard-blocking per Phase 2B)
  router.get(
    '/check-duplicate',
    asyncHandler(async (req, res) => {
      const customer = req.auth!.customer!;
      const requestType = req.query.requestType === 'workshop' ? 'workshop' : 'driver';
      const profileId = String(req.query.profileId ?? '');
      const yearParsed = jalaliYearSchema.safeParse(req.query.jalaliYear);
      const monthParsed = jalaliMonthSchema.safeParse(req.query.jalaliMonth);

      if (!isValidUuid(profileId) || !yearParsed.success || !monthParsed.success) {
        return res.json({ duplicateExists: false, existingRequests: [] });
      }

      const existing = await db
        .select({
          id: requests.id,
          referenceCode: requests.referenceCode,
          status: requests.status,
        })
        .from(requests)
        .where(
          and(
            eq(requests.customerId, customer.id),
            requestType === 'driver'
              ? eq(requests.driverId, profileId)
              : eq(requests.workshopId, profileId),
            eq(requests.jalaliYear, yearParsed.data),
            eq(requests.jalaliMonth, monthParsed.data),
            notInArray(requests.status, ['cancelled', 'rejected']),
          ),
        );

      return res.json({
        duplicateExists: existing.length > 0,
        existingRequests: existing,
      });
    }),
  );

  // 5. Submit Driver Monthly Insurance Request
  router.post(
    '/requests/driver',
    runMulterMiddleware(upload.array('attachments', 5), config.maxUploadMb),
    asyncHandler(async (req, res) => {
      const customer = req.auth!.customer!;
      const user = req.auth!.user;

      let rawPayload: unknown = req.body;
      if (typeof req.body?.payload === 'string') {
        try {
          rawPayload = JSON.parse(req.body.payload);
        } catch {
          return res.status(400).json({ error: 'ساختار اطلاعات ارسالی معتبر نیست.' });
        }
      }

      const parsed = createDriverRequestSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }
      const data = parsed.data;

      // Validate and store uploaded files before DB transaction; clean up on rollback
      const uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
      const storedAttachments: StoredFileMetadata[] = [];

      try {
        for (const f of uploadedFiles) {
          const meta = await validateAndStorePrivateFile({
            storage,
            originalName: f.originalname,
            buffer: f.buffer,
            maxUploadBytes: config.maxUploadBytes,
            allowedMimes: config.allowedUploadMimes,
            antivirusMode: config.antivirusMode,
          });
          storedAttachments.push(meta);
        }

        const result = await db.transaction(async (tx) => {
          const selected = await saveSelectedContacts(
            tx as unknown as AppDb,
            config,
            customer.id,
            data.cardSelection,
            data.mobileSelection,
          );
          let targetDriverId: string;
          let targetDriverName: string;

          if (data.driverMode === 'existing') {
            const [existingDriver] = await tx
              .select()
              .from(drivers)
              .where(
                and(
                  eq(drivers.id, data.driverId!),
                  eq(drivers.customerId, customer.id),
                  eq(drivers.isArchived, false),
                ),
              )
              .limit(1)
              .for('update');

            if (!existingDriver) {
              throw new DriverOwnershipError(
                'راننده انتخاب‌شده متعلق به حساب شما نیست یا یافت نشد.',
              );
            }
            if (
              existingDriver.portalPasswordEncrypted &&
              data.initialPortalPassword !== undefined
            ) {
              throw new DriverOwnershipError('تغییر رمز ثبت‌شده فقط توسط دفتر مجاز است.');
            }
            if (!existingDriver.portalPasswordEncrypted) {
              if (!data.initialPortalPassword) throw new PortalPasswordRequiredError();
              await tx
                .update(drivers)
                .set({
                  portalPasswordEncrypted: encryptPortalPassword(
                    config,
                    customer.id,
                    'driver',
                    existingDriver.id,
                    data.initialPortalPassword,
                  ),
                })
                .where(eq(drivers.id, existingDriver.id));
            }
            targetDriverId = existingDriver.id;
            targetDriverName = existingDriver.fullName;
          } else {
            const newDriverInput = data.newDriver!;
            const newDriverId = randomUUID();
            const [createdDriver] = await tx
              .insert(drivers)
              .values({
                id: newDriverId,
                customerId: customer.id,
                fullName: newDriverInput.fullName,
                nationalId: newDriverInput.nationalId,
                portalPasswordEncrypted: encryptPortalPassword(
                  config,
                  customer.id,
                  'driver',
                  newDriverId,
                  newDriverInput.portalPassword,
                ),
                reviewState: 'pending_office_review',
              })
              .returning();

            targetDriverId = createdDriver!.id;
            targetDriverName = createdDriver!.fullName;

            await recordAuditEvent(tx as unknown as AppDb, {
              actorUserId: user.id,
              actorRole: 'customer',
              entityType: 'driver',
              entityId: targetDriverId,
              eventType: 'profile.driver_created',
              customerVisible: false,
              summaryFa: `پرونده راننده جدید «${targetDriverName}» توسط مشتری معرفی شد.`,
              newValues: {
                fullName: targetDriverName,
                maskedNationalId: maskNationalId(newDriverInput.nationalId, false),
              },
            });
          }

          // Check duplicate warning metadata
          const duplicateRows = await tx
            .select({ referenceCode: requests.referenceCode })
            .from(requests)
            .where(
              and(
                eq(requests.customerId, customer.id),
                eq(requests.driverId, targetDriverId),
                eq(requests.jalaliYear, data.jalaliYear),
                eq(requests.jalaliMonth, data.jalaliMonth),
                notInArray(requests.status, ['cancelled', 'rejected']),
              ),
            );

          const referenceCode = generateRequestReference(data.jalaliYear);
          const now = new Date();
          const trimmedExplanation = data.explanation.trim();

          const [createdReq] = await tx
            .insert(requests)
            .values({
              referenceCode,
              customerId: customer.id,
              cardId: selected.cardId,
              mobileId: selected.mobileId,
              requestType: 'driver',
              driverId: targetDriverId,
              workshopId: null,
              jalaliYear: data.jalaliYear,
              jalaliMonth: data.jalaliMonth,
              calendarSystem: 'jalali',
              status: 'registered',
              currencyUnit: config.currencyUnit,
              initialExplanation: trimmedExplanation || null,
              submittedAt: now,
              lastActivityAt: now,
            })
            .returning();

          const reqRow = createdReq!;
          let initialMessageId: string | null = null;

          if (trimmedExplanation) {
            const [msgRow] = await tx
              .insert(requestMessages)
              .values({
                requestId: reqRow.id,
                authorUserId: user.id,
                authorRole: 'customer',
                messageKind: 'explanation',
                body: trimmedExplanation,
              })
              .returning();
            initialMessageId = msgRow?.id ?? null;
          }

          for (const fileMeta of storedAttachments) {
            const [fileRow] = await tx
              .insert(requestFiles)
              .values({
                requestId: reqRow.id,
                messageId: initialMessageId,
                uploaderUserId: user.id,
                uploaderRole: 'customer',
                classification: 'customer_attachment',
                storageKey: fileMeta.storageKey,
                displayFilename: fileMeta.displayFilename,
                detectedMimeType: fileMeta.detectedMimeType,
                byteSize: fileMeta.byteSize,
                sha256Checksum: fileMeta.sha256Checksum,
                scanState: fileMeta.scanState,
              })
              .returning();

            await recordAuditEvent(tx as unknown as AppDb, {
              actorUserId: user.id,
              actorRole: 'customer',
              entityType: 'file',
              entityId: fileRow!.id,
              requestId: reqRow.id,
              eventType: 'request.file_uploaded',
              customerVisible: true,
              summaryFa: `فایل پیوست «${fileMeta.displayFilename}» توسط مشتری بارگذاری شد.`,
            });
          }

          const periodLabel = formatJalaliPeriod(data.jalaliYear, data.jalaliMonth);

          await recordAuditEvent(tx as unknown as AppDb, {
            actorUserId: user.id,
            actorRole: 'customer',
            entityType: 'request',
            entityId: reqRow.id,
            requestId: reqRow.id,
            eventType: 'request.created',
            customerVisible: true,
            summaryFa: `درخواست حق بیمه راننده برای دوره ${periodLabel} ثبت شد.`,
            newValues: {
              referenceCode,
              requestType: 'driver',
              jalaliYear: data.jalaliYear,
              jalaliMonth: data.jalaliMonth,
              status: 'registered',
            },
          });

          await notifyCustomerByCustomerId(tx as unknown as AppDb, customer.id, {
            notificationType: 'request_created',
            requestId: reqRow.id,
            titleFa: `ثبت درخواست شماره ${referenceCode}`,
            bodyFa: `درخواست حق بیمه راننده (${targetDriverName}) برای دوره ${periodLabel} با موفقیت ثبت شد.`,
            dedupeKey: `cust_req_created:${reqRow.id}`,
          });

          await notifyAllOfficeAdmins(tx as unknown as AppDb, {
            notificationType: 'new_customer_request',
            requestId: reqRow.id,
            titleFa: `درخواست جدید راننده (${referenceCode})`,
            bodyFa: `درخواست جدید توسط «${customer.fullName}» برای دوره ${periodLabel} ثبت شد.`,
            dedupeKey: `admin_req_created:${reqRow.id}`,
          });

          return {
            request: reqRow,
            duplicateWarning:
              duplicateRows.length > 0
                ? `توجه: برای این راننده و ماه ${periodLabel} پیش‌تر نیز درخواست فعال ثبت شده بود.`
                : null,
          };
        });

        return res.status(201).json({
          request: {
            id: result.request.id,
            referenceCode: result.request.referenceCode,
            status: result.request.status,
            jalaliYear: result.request.jalaliYear,
            jalaliMonth: result.request.jalaliMonth,
          },
          duplicateWarning: result.duplicateWarning,
        });
      } catch (err) {
        // Clean up stored files if DB transaction rolled back
        await Promise.all(storedAttachments.map((f) => storage.remove(f.storageKey)));
        if (err instanceof FileValidationError) {
          return res.status(400).json({ error: err.message });
        }
        if (err instanceof PortalPasswordRequiredError) {
          return res
            .status(400)
            .json({ error: err.message, fieldErrors: { initialPortalPassword: err.message } });
        }
        if (err instanceof DriverOwnershipError) {
          return res.status(403).json({ error: err.message });
        }
        throw err;
      }
    }),
  );

  // 6. Submit Workshop Monthly Insurance List Request (+ optional new insured employee)
  router.post(
    '/requests/workshop',
    runMulterMiddleware(
      upload.fields([
        { name: 'attachments', maxCount: 5 },
        { name: 'employeeDocuments', maxCount: 5 },
      ]),
      config.maxUploadMb,
    ),
    asyncHandler(async (req, res) => {
      const customer = req.auth!.customer!;
      const user = req.auth!.user;

      let rawPayload: unknown = req.body;
      if (typeof req.body?.payload === 'string') {
        try {
          rawPayload = JSON.parse(req.body.payload);
        } catch {
          return res.status(400).json({ error: 'ساختار اطلاعات ارسالی معتبر نیست.' });
        }
      }

      const parsed = createWorkshopRequestSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return res.status(400).json(formatZodError(parsed.error));
      }
      const data = parsed.data;

      const fileMap = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
      const generalFiles = fileMap.attachments ?? [];
      const empFiles = data.includeNewEmployee ? (fileMap.employeeDocuments ?? []) : [];

      const storedGeneral: StoredFileMetadata[] = [];
      const storedEmployeeDocs: StoredFileMetadata[] = [];

      try {
        for (const f of generalFiles) {
          storedGeneral.push(
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
        for (const f of empFiles) {
          storedEmployeeDocs.push(
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

        const result = await db.transaction(async (tx) => {
          const selected = await saveSelectedContacts(
            tx as unknown as AppDb,
            config,
            customer.id,
            data.cardSelection,
            data.mobileSelection,
          );
          let targetWorkshopId: string;
          let targetWorkshopName: string;

          if (data.workshopMode === 'existing') {
            const [existingWorkshop] = await tx
              .select()
              .from(workshops)
              .where(
                and(
                  eq(workshops.id, data.workshopId!),
                  eq(workshops.customerId, customer.id),
                  eq(workshops.isArchived, false),
                ),
              )
              .limit(1)
              .for('update');

            if (!existingWorkshop) {
              throw new DriverOwnershipError(
                'کارگاه انتخاب‌شده متعلق به حساب شما نیست یا یافت نشد.',
              );
            }
            if (
              existingWorkshop.portalPasswordEncrypted &&
              data.initialPortalPassword !== undefined
            ) {
              throw new DriverOwnershipError('تغییر رمز ثبت‌شده فقط توسط دفتر مجاز است.');
            }
            if (!existingWorkshop.portalPasswordEncrypted) {
              if (!data.initialPortalPassword) throw new PortalPasswordRequiredError();
              await tx
                .update(workshops)
                .set({
                  portalPasswordEncrypted: encryptPortalPassword(
                    config,
                    customer.id,
                    'workshop',
                    existingWorkshop.id,
                    data.initialPortalPassword,
                  ),
                })
                .where(eq(workshops.id, existingWorkshop.id));
            }
            targetWorkshopId = existingWorkshop.id;
            targetWorkshopName = existingWorkshop.workshopName;
          } else {
            const nw = data.newWorkshop!;
            const newWorkshopId = randomUUID();
            const [createdWorkshop] = await tx
              .insert(workshops)
              .values({
                id: newWorkshopId,
                customerId: customer.id,
                portalPasswordEncrypted: encryptPortalPassword(
                  config,
                  customer.id,
                  'workshop',
                  newWorkshopId,
                  nw.portalPassword,
                ),
                workshopName: nw.workshopName,
                workshopCode: nw.workshopCode,
                contactFullName: nw.contactFullName,
                contactNationalId: nw.contactNationalId,
                reviewState: 'pending_office_review',
              })
              .returning();

            targetWorkshopId = createdWorkshop!.id;
            targetWorkshopName = createdWorkshop!.workshopName;

            await recordAuditEvent(tx as unknown as AppDb, {
              actorUserId: user.id,
              actorRole: 'customer',
              entityType: 'workshop',
              entityId: targetWorkshopId,
              eventType: 'profile.workshop_created',
              customerVisible: false,
              summaryFa: `پرونده کارگاه جدید «${targetWorkshopName}» (کد: ${nw.workshopCode}) توسط مشتری معرفی شد.`,
              newValues: {
                workshopName: nw.workshopName,
                workshopCode: nw.workshopCode,
                contactFullName: nw.contactFullName,
                maskedContactNationalId: maskNationalId(nw.contactNationalId, false),
              },
            });
          }

          const duplicateRows = await tx
            .select({ referenceCode: requests.referenceCode })
            .from(requests)
            .where(
              and(
                eq(requests.customerId, customer.id),
                eq(requests.workshopId, targetWorkshopId),
                eq(requests.jalaliYear, data.jalaliYear),
                eq(requests.jalaliMonth, data.jalaliMonth),
                notInArray(requests.status, ['cancelled', 'rejected']),
              ),
            );

          const referenceCode = generateRequestReference(data.jalaliYear);
          const now = new Date();
          const trimmedExplanation = data.explanation.trim();

          const [createdReq] = await tx
            .insert(requests)
            .values({
              referenceCode,
              customerId: customer.id,
              cardId: selected.cardId,
              mobileId: selected.mobileId,
              requestType: 'workshop',
              driverId: null,
              workshopId: targetWorkshopId,
              jalaliYear: data.jalaliYear,
              jalaliMonth: data.jalaliMonth,
              calendarSystem: 'jalali',
              status: 'registered',
              currencyUnit: config.currencyUnit,
              initialExplanation: trimmedExplanation || null,
              hasNewEmployeeSubmission: Boolean(data.includeNewEmployee && data.newEmployee),
              submittedAt: now,
              lastActivityAt: now,
            })
            .returning();

          const reqRow = createdReq!;
          let initialMessageId: string | null = null;

          if (trimmedExplanation) {
            const [msgRow] = await tx
              .insert(requestMessages)
              .values({
                requestId: reqRow.id,
                authorUserId: user.id,
                authorRole: 'customer',
                messageKind: 'explanation',
                body: trimmedExplanation,
              })
              .returning();
            initialMessageId = msgRow?.id ?? null;
          }

          let employeeSubmissionId: string | null = null;
          if (data.includeNewEmployee && data.newEmployee) {
            const ne = data.newEmployee;
            const [createdEmp] = await tx
              .insert(insuredEmployees)
              .values({
                workshopId: targetWorkshopId,
                customerId: customer.id,
                fullName: ne.fullName,
                nationalId: ne.nationalId,
                insuranceNumber: ne.insuranceNumber,
                state: 'introduced',
              })
              .returning();

            const [subRow] = await tx
              .insert(requestEmployeeSubmissions)
              .values({
                requestId: reqRow.id,
                insuredEmployeeId: createdEmp!.id,
                fullNameSnapshot: ne.fullName,
                insuranceNumberSnapshot: ne.insuranceNumber,
              })
              .returning();

            employeeSubmissionId = subRow!.id;

            await recordAuditEvent(tx as unknown as AppDb, {
              actorUserId: user.id,
              actorRole: 'customer',
              entityType: 'insured_employee',
              entityId: createdEmp!.id,
              requestId: reqRow.id,
              eventType: 'request.employee_introduced',
              customerVisible: true,
              summaryFa: `بیمه‌شده جدید «${ne.fullName}» به همراه درخواست کارگاه معرفی شد.`,
            });
          }

          for (const fileMeta of storedGeneral) {
            const [fileRow] = await tx
              .insert(requestFiles)
              .values({
                requestId: reqRow.id,
                messageId: initialMessageId,
                uploaderUserId: user.id,
                uploaderRole: 'customer',
                classification: 'customer_attachment',
                storageKey: fileMeta.storageKey,
                displayFilename: fileMeta.displayFilename,
                detectedMimeType: fileMeta.detectedMimeType,
                byteSize: fileMeta.byteSize,
                sha256Checksum: fileMeta.sha256Checksum,
                scanState: fileMeta.scanState,
              })
              .returning();

            await recordAuditEvent(tx as unknown as AppDb, {
              actorUserId: user.id,
              actorRole: 'customer',
              entityType: 'file',
              entityId: fileRow!.id,
              requestId: reqRow.id,
              eventType: 'request.file_uploaded',
              customerVisible: true,
              summaryFa: `فایل پیوست «${fileMeta.displayFilename}» توسط مشتری بارگذاری شد.`,
            });
          }

          for (const fileMeta of storedEmployeeDocs) {
            const [fileRow] = await tx
              .insert(requestFiles)
              .values({
                requestId: reqRow.id,
                employeeSubmissionId,
                uploaderUserId: user.id,
                uploaderRole: 'customer',
                classification: 'employee_document',
                storageKey: fileMeta.storageKey,
                displayFilename: fileMeta.displayFilename,
                detectedMimeType: fileMeta.detectedMimeType,
                byteSize: fileMeta.byteSize,
                sha256Checksum: fileMeta.sha256Checksum,
                scanState: fileMeta.scanState,
              })
              .returning();

            await recordAuditEvent(tx as unknown as AppDb, {
              actorUserId: user.id,
              actorRole: 'customer',
              entityType: 'file',
              entityId: fileRow!.id,
              requestId: reqRow.id,
              eventType: 'request.file_uploaded',
              customerVisible: true,
              summaryFa: `مدرک بیمه‌شده جدید «${fileMeta.displayFilename}» بارگذاری شد.`,
            });
          }

          const periodLabel = formatJalaliPeriod(data.jalaliYear, data.jalaliMonth);

          await recordAuditEvent(tx as unknown as AppDb, {
            actorUserId: user.id,
            actorRole: 'customer',
            entityType: 'request',
            entityId: reqRow.id,
            requestId: reqRow.id,
            eventType: 'request.created',
            customerVisible: true,
            summaryFa: `درخواست لیست بیمه کارگاه برای دوره ${periodLabel} ثبت شد.`,
            newValues: {
              referenceCode,
              requestType: 'workshop',
              jalaliYear: data.jalaliYear,
              jalaliMonth: data.jalaliMonth,
              hasNewEmployeeSubmission: reqRow.hasNewEmployeeSubmission,
            },
          });

          await notifyCustomerByCustomerId(tx as unknown as AppDb, customer.id, {
            notificationType: 'request_created',
            requestId: reqRow.id,
            titleFa: `ثبت درخواست شماره ${referenceCode}`,
            bodyFa: `درخواست لیست بیمه کارگاه «${targetWorkshopName}» برای دوره ${periodLabel} با موفقیت ثبت شد.`,
            dedupeKey: `cust_req_created:${reqRow.id}`,
          });

          await notifyAllOfficeAdmins(tx as unknown as AppDb, {
            notificationType: 'new_customer_request',
            requestId: reqRow.id,
            titleFa: `درخواست جدید کارگاه (${referenceCode})`,
            bodyFa: `درخواست لیست بیمه کارگاه «${targetWorkshopName}» توسط «${customer.fullName}» برای دوره ${periodLabel} ثبت شد.`,
            dedupeKey: `admin_req_created:${reqRow.id}`,
          });

          return {
            request: reqRow,
            duplicateWarning:
              duplicateRows.length > 0
                ? `توجه: برای این کارگاه و ماه ${periodLabel} پیش‌تر نیز درخواست فعال ثبت شده بود.`
                : null,
          };
        });

        return res.status(201).json({
          request: {
            id: result.request.id,
            referenceCode: result.request.referenceCode,
            status: result.request.status,
            jalaliYear: result.request.jalaliYear,
            jalaliMonth: result.request.jalaliMonth,
          },
          duplicateWarning: result.duplicateWarning,
        });
      } catch (err) {
        await Promise.all(
          [...storedGeneral, ...storedEmployeeDocs].map((f) => storage.remove(f.storageKey)),
        );
        if (err instanceof FileValidationError) {
          return res.status(400).json({ error: err.message });
        }
        if (err instanceof PortalPasswordRequiredError) {
          return res
            .status(400)
            .json({ error: err.message, fieldErrors: { initialPortalPassword: err.message } });
        }
        if (err instanceof DriverOwnershipError) {
          return res.status(403).json({ error: err.message });
        }
        throw err;
      }
    }),
  );

  return router;
}

class DriverOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriverOwnershipError';
  }
}

async function saveSelectedContacts(
  db: AppDb,
  config: AppConfig,
  customerId: string,
  card: z.infer<typeof cardSelectionSchema>,
  mobile: z.infer<typeof mobileSelectionSchema>,
) {
  let cardId: string;
  if (card.mode === 'existing') {
    const [row] = await db
      .select({ id: customerCards.id })
      .from(customerCards)
      .where(
        and(
          eq(customerCards.id, card.id),
          eq(customerCards.customerId, customerId),
          eq(customerCards.isArchived, false),
        ),
      )
      .limit(1)
      .for('update');
    if (!row) throw new DriverOwnershipError('کارت انتخاب‌شده متعلق به حساب شما نیست یا یافت نشد.');
    cardId = row.id;
  } else {
    const data = card.card;
    const [row] = await db
      .insert(customerCards)
      .values({
        customerId,
        encryptedData: encryptCard(config, customerId, data),
        holderName: data.holderName,
        lastFour: data.number.slice(-4),
        bankId: identifyBank(data.number)?.id ?? null,
      })
      .returning({ id: customerCards.id });
    cardId = row!.id;
  }
  let mobileId: string;
  if (mobile.mode === 'existing') {
    const [row] = await db
      .select({ id: customerMobiles.id })
      .from(customerMobiles)
      .where(
        and(
          eq(customerMobiles.id, mobile.id),
          eq(customerMobiles.customerId, customerId),
          eq(customerMobiles.isArchived, false),
        ),
      )
      .limit(1)
      .for('update');
    if (!row)
      throw new DriverOwnershipError('شماره انتخاب‌شده متعلق به حساب شما نیست یا یافت نشد.');
    mobileId = row.id;
  } else {
    const [row] = await db
      .insert(customerMobiles)
      .values({ customerId, mobile: mobile.mobile, ownerName: mobile.ownerName })
      .returning({ id: customerMobiles.id });
    mobileId = row!.id;
  }
  return { cardId, mobileId };
}

class PortalPasswordRequiredError extends Error {
  constructor() {
    super('برای این پرونده، ثبت اولیه رمز سامانه تأمین اجتماعی الزامی است.');
    this.name = 'PortalPasswordRequiredError';
  }
}
