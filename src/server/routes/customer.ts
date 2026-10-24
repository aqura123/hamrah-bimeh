import { and, count, desc, eq, isNull, notInArray } from 'drizzle-orm';
import { Router } from 'express';
import { maskNationalId } from '../../shared/iran-identifiers.js';
import { formatJalaliPeriod } from '../../shared/jalali.js';
import {
  createDriverRequestSchema,
  createWorkshopRequestSchema,
  jalaliMonthSchema,
  jalaliYearSchema,
} from '../../shared/validation.js';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db/client.js';
import {
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

const FORBIDDEN_CREDENTIAL_FIELDS = [
  'taminPassword',
  'tamin_password',
  'esTaminPassword',
  'portalPassword',
  'portal_password',
  'ssoPassword',
];

function hasForbiddenCredentialField(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (FORBIDDEN_CREDENTIAL_FIELDS.includes(k)) return true;
    if (v && typeof v === 'object' && hasForbiddenCredentialField(v)) return true;
  }
  return false;
}

export function createCustomerPortalRouter(
  db: AppDb,
  config: AppConfig,
  storage: FileStorageProvider,
): Router {
  const router = Router();
  router.use(requireCustomer);

  const upload = createMemoryUpload(config.maxUploadBytes, 10);

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

      if (hasForbiddenCredentialField(rawPayload)) {
        return res.status(400).json({
          error: 'ارسال رمز عبور سامانه تامین اجتماعی مجاز نیست.',
        });
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
              .limit(1);

            if (!existingDriver) {
              throw new DriverOwnershipError(
                'راننده انتخاب‌شده متعلق به حساب شما نیست یا یافت نشد.',
              );
            }
            targetDriverId = existingDriver.id;
            targetDriverName = existingDriver.fullName;
          } else {
            const newDriverInput = data.newDriver!;
            const [createdDriver] = await tx
              .insert(drivers)
              .values({
                customerId: customer.id,
                fullName: newDriverInput.fullName,
                nationalId: newDriverInput.nationalId,
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

      if (hasForbiddenCredentialField(rawPayload)) {
        return res.status(400).json({
          error:
            'این سامانه رمز عبور درگاه تامین اجتماعی (es.tamin.ir) را دریافت یا ذخیره نمی‌کند.',
        });
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
              .limit(1);

            if (!existingWorkshop) {
              throw new DriverOwnershipError(
                'کارگاه انتخاب‌شده متعلق به حساب شما نیست یا یافت نشد.',
              );
            }
            targetWorkshopId = existingWorkshop.id;
            targetWorkshopName = existingWorkshop.workshopName;
          } else {
            const nw = data.newWorkshop!;
            const [createdWorkshop] = await tx
              .insert(workshops)
              .values({
                customerId: customer.id,
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
