/**
 * DEVELOPMENT & DEMO SEED SCRIPT ONLY (`npm run db:seed`)
 * Refuses to run when `NODE_ENV === 'production'`.
 * Creates realistic Persian demo records for local inspection and verification.
 */
import url from 'node:url';
import { eq } from 'drizzle-orm';
import { buildValidNationalIdFromPrefix } from '../../shared/iran-identifiers.js';
import { formatJalaliPeriod } from '../../shared/jalali.js';
import { loadConfig, type AppConfig } from '../config.js';
import { logger } from '../logger.js';
import { recordAuditEvent } from '../services/audit.js';
import { notifyAllOfficeAdmins, notifyCustomerByCustomerId } from '../services/notifications.js';
import { hashPassword } from '../services/security.js';
import {
  LocalPrivateFileStorage,
  validateAndStorePrivateFile,
  type FileStorageProvider,
} from '../services/storage.js';
import { createDatabaseConnection, type AppDb } from './client.js';
import {
  customers,
  drivers,
  insuredEmployees,
  requestEmployeeSubmissions,
  requestFiles,
  requestMessages,
  requests,
  users,
  workshops,
} from './schema.js';

function createMinimalValidPdf(titleText: string): Buffer {
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >> endobj
4 0 obj << /Length ${44 + titleText.length} >> stream
BT /F1 12 Tf 72 750 Td (${titleText}) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f 
trailer << /Root 1 0 R /Size 5 >>
startxref
220
%%EOF`;
  return Buffer.from(content, 'utf8');
}

export async function seedDemoDatabase(
  db: AppDb,
  config: AppConfig,
  storage: FileStorageProvider,
): Promise<void> {
  if (config.nodeEnv === 'production') {
    throw new Error(
      'SEED BLOCKED: Development demo seed script cannot run in NODE_ENV=production.',
    );
  }

  const conn = { db };
  {
    const adminMobile = '09120000000';
    const [existingAdmin] = await conn.db
      .select()
      .from(users)
      .where(eq(users.username, adminMobile))
      .limit(1);

    if (existingAdmin) {
      logger.info('db.seed.already_seeded');
      return;
    }

    // Valid deterministic test national IDs (synthetic checksummed values, not real individuals)
    const nidCustomer1 = buildValidNationalIdFromPrefix('001234567');
    const nidDriver1 = buildValidNationalIdFromPrefix('002345678');
    const nidDriver2 = buildValidNationalIdFromPrefix('003456789');
    const nidWorkshopContact = buildValidNationalIdFromPrefix('004567891');
    const nidNewEmployee = buildValidNationalIdFromPrefix('005678912');
    const nidCustomer2 = buildValidNationalIdFromPrefix('006789123');

    const adminHash = await hashPassword('Admin!Hamrah2026#Safe');
    const cust1Hash = await hashPassword('Customer!1405');
    // Second demo customer uses National ID initial password policy (`forcePasswordChange = true`)
    const cust2InitialHash = await hashPassword(nidCustomer2);

    const [adminUser] = await conn.db
      .insert(users)
      .values({
        username: adminMobile,
        displayName: 'مسئول دفتر همراه بیمه (آزمایشی)',
        role: 'office_admin',
        passwordHash: adminHash,
        forcePasswordChange: false,
        initialPasswordMode: 'manual_bootstrap',
        isActive: true,
      })
      .returning();

    const [cust1User] = await conn.db
      .insert(users)
      .values({
        username: '09121112233',
        displayName: 'علی رضایی',
        role: 'customer',
        passwordHash: cust1Hash,
        forcePasswordChange: false,
        initialPasswordMode: 'national_id',
        isActive: true,
      })
      .returning();

    const [cust2User] = await conn.db
      .insert(users)
      .values({
        username: '09123334455',
        displayName: 'زهرا محمدی',
        role: 'customer',
        passwordHash: cust2InitialHash,
        forcePasswordChange: true,
        initialPasswordMode: 'national_id',
        isActive: true,
      })
      .returning();

    const [cust1] = await conn.db
      .insert(customers)
      .values({
        userId: cust1User!.id,
        fullName: 'علی رضایی',
        mobile: '09121112233',
        nationalId: nidCustomer1,
        phone: '021-00000000',
        officeNotes: 'پرونده آزمایشی محیط توسعه — رانندگان بین‌شهری و کارگاه بسته‌بندی',
        isActive: true,
      })
      .returning();

    await conn.db.insert(customers).values({
      userId: cust2User!.id,
      fullName: 'زهرا محمدی',
      mobile: '09123334455',
      nationalId: nidCustomer2,
      officeNotes: 'حساب آزمایشی تازه ایجادشده با الزام تغییر رمز اولیه',
      isActive: true,
    });

    // Customer 1 Drivers
    const [drv1] = await conn.db
      .insert(drivers)
      .values({
        customerId: cust1!.id,
        fullName: 'علی رضایی',
        nationalId: nidDriver1,
        reviewState: 'confirmed',
      })
      .returning();

    const [drv2] = await conn.db
      .insert(drivers)
      .values({
        customerId: cust1!.id,
        fullName: 'حسین کریمی',
        nationalId: nidDriver2,
        reviewState: 'confirmed',
      })
      .returning();

    // Customer 1 Workshop
    const [ws1] = await conn.db
      .insert(workshops)
      .values({
        customerId: cust1!.id,
        workshopName: 'کارگاه تولیدی و بسته‌بندی بهاران',
        workshopCode: '0412987654',
        contactFullName: 'علی رضایی',
        contactNationalId: nidWorkshopContact,
        reviewState: 'confirmed',
      })
      .returning();

    // Completed Driver Request (Mehr 1405) with Office Output PDF & Final Amount
    const outputPdfMeta = await validateAndStorePrivateFile({
      storage,
      originalName: 'رسید-ثبت-حق-بیمه-مهر-۱۴۰۵.pdf',
      buffer: createMinimalValidPdf('Hamrah Bimeh Demo Receipt Mehr 1405'),
      maxUploadBytes: config.maxUploadBytes,
      allowedMimes: config.allowedUploadMimes,
      antivirusMode: config.antivirusMode,
    });

    const [reqCompleted] = await conn.db
      .insert(requests)
      .values({
        referenceCode: 'HB-1405-M7R4K2',
        customerId: cust1!.id,
        requestType: 'driver',
        driverId: drv1!.id,
        jalaliYear: 1405,
        jalaliMonth: 7,
        calendarSystem: 'jalali',
        status: 'completed',
        awaitingCustomerInfo: false,
        finalAmount: 380000,
        currencyUnit: config.currencyUnit,
        initialExplanation: 'لطفاً حق بیمه مهرماه ۱۴۰۵ ثبت شود.',
        completedAt: new Date(),
      })
      .returning();

    await conn.db.insert(requestMessages).values([
      {
        requestId: reqCompleted!.id,
        authorUserId: cust1User!.id,
        authorRole: 'customer',
        messageKind: 'explanation',
        body: 'لطفاً حق بیمه مهرماه ۱۴۰۵ ثبت شود.',
      },
      {
        requestId: reqCompleted!.id,
        authorUserId: adminUser!.id,
        authorRole: 'office_admin',
        messageKind: 'explanation',
        body: 'عملیات ثبت درخواست مهرماه انجام شد و فایل خروجی در پیوست قرار گرفت.',
      },
    ]);

    await conn.db.insert(requestFiles).values({
      requestId: reqCompleted!.id,
      uploaderUserId: adminUser!.id,
      uploaderRole: 'office_admin',
      classification: 'office_output',
      storageKey: outputPdfMeta.storageKey,
      displayFilename: outputPdfMeta.displayFilename,
      detectedMimeType: outputPdfMeta.detectedMimeType,
      byteSize: outputPdfMeta.byteSize,
      sha256Checksum: outputPdfMeta.sha256Checksum,
      scanState: outputPdfMeta.scanState,
    });

    await recordAuditEvent(conn.db, {
      actorUserId: cust1User!.id,
      actorRole: 'customer',
      entityType: 'request',
      entityId: reqCompleted!.id,
      requestId: reqCompleted!.id,
      eventType: 'request.created',
      customerVisible: true,
      summaryFa: `درخواست حق بیمه راننده برای دوره ${formatJalaliPeriod(1405, 7)} ثبت شد.`,
    });

    await recordAuditEvent(conn.db, {
      actorUserId: adminUser!.id,
      actorRole: 'office_admin',
      entityType: 'request',
      entityId: reqCompleted!.id,
      requestId: reqCompleted!.id,
      eventType: 'request.status_changed',
      customerVisible: true,
      summaryFa: 'وضعیت درخواست به «انجام‌شده» تغییر یافت و فایل خروجی بارگذاری شد.',
    });

    // In-Progress Workshop Request (Aban 1405) WITH Coexisting `awaitingCustomerInfo = true` & New Employee
    const [reqWorkshop] = await conn.db
      .insert(requests)
      .values({
        referenceCode: 'HB-1405-W8N3P9',
        customerId: cust1!.id,
        requestType: 'workshop',
        workshopId: ws1!.id,
        jalaliYear: 1405,
        jalaliMonth: 8,
        calendarSystem: 'jalali',
        status: 'in_progress',
        awaitingCustomerInfo: true,
        awaitingCustomerInfoNote:
          'لطفاً تصویر خوانای صفحه اول شناسنامه بیمه‌شده جدید را در بخش پیام‌ها پیوست فرمایید.',
        hasNewEmployeeSubmission: true,
        currencyUnit: config.currencyUnit,
        initialExplanation: 'ارسال لیست آبان ۱۴۰۵ به همراه معرفی یک نیروی جدید.',
      })
      .returning();

    const [emp1] = await conn.db
      .insert(insuredEmployees)
      .values({
        workshopId: ws1!.id,
        customerId: cust1!.id,
        fullName: 'مهدی اکبری',
        nationalId: nidNewEmployee,
        insuranceNumber: '0048291736',
        state: 'introduced',
      })
      .returning();

    await conn.db.insert(requestEmployeeSubmissions).values({
      requestId: reqWorkshop!.id,
      insuredEmployeeId: emp1!.id,
      fullNameSnapshot: emp1!.fullName,
      insuranceNumberSnapshot: emp1!.insuranceNumber,
    });

    await conn.db.insert(requestMessages).values([
      {
        requestId: reqWorkshop!.id,
        authorUserId: cust1User!.id,
        authorRole: 'customer',
        messageKind: 'explanation',
        body: 'ارسال لیست آبان ۱۴۰۵ به همراه معرفی یک نیروی جدید (آقای مهدی اکبری).',
      },
      {
        requestId: reqWorkshop!.id,
        authorUserId: adminUser!.id,
        authorRole: 'office_admin',
        messageKind: 'info_request',
        body: 'لیست اصلی کارگاه در حال آماده‌سازی است؛ لطفاً تصویر خوانای صفحه اول شناسنامه بیمه‌شده جدید را نیز ارسال فرمایید.',
      },
    ]);

    await recordAuditEvent(conn.db, {
      actorUserId: cust1User!.id,
      actorRole: 'customer',
      entityType: 'request',
      entityId: reqWorkshop!.id,
      requestId: reqWorkshop!.id,
      eventType: 'request.created',
      customerVisible: true,
      summaryFa: `درخواست لیست بیمه کارگاه برای دوره ${formatJalaliPeriod(1405, 8)} ثبت شد.`,
    });

    await recordAuditEvent(conn.db, {
      actorUserId: adminUser!.id,
      actorRole: 'office_admin',
      entityType: 'request',
      entityId: reqWorkshop!.id,
      requestId: reqWorkshop!.id,
      eventType: 'request.status_changed',
      customerVisible: true,
      summaryFa:
        'وضعیت به «در حال انجام» تغییر یافت و هم‌زمان تکمیل مدرک بیمه‌شده جدید از مشتری درخواست شد.',
    });

    // Registered Driver 2 Request (Aban 1405)
    const [reqDriver2] = await conn.db
      .insert(requests)
      .values({
        referenceCode: 'HB-1405-D2X5Q8',
        customerId: cust1!.id,
        requestType: 'driver',
        driverId: drv2!.id,
        jalaliYear: 1405,
        jalaliMonth: 8,
        calendarSystem: 'jalali',
        status: 'registered',
        currencyUnit: config.currencyUnit,
        initialExplanation: 'ثبت کارکرد و حق بیمه آبان ۱۴۰۵ برای راننده دوم.',
      })
      .returning();

    await recordAuditEvent(conn.db, {
      actorUserId: cust1User!.id,
      actorRole: 'customer',
      entityType: 'request',
      entityId: reqDriver2!.id,
      requestId: reqDriver2!.id,
      eventType: 'request.created',
      customerVisible: true,
      summaryFa: `درخواست حق بیمه راننده برای دوره ${formatJalaliPeriod(1405, 8)} ثبت شد.`,
    });

    await notifyCustomerByCustomerId(conn.db, cust1!.id, {
      notificationType: 'office_message',
      requestId: reqWorkshop!.id,
      titleFa: `نیاز به تکمیل مدرک در درخواست ${reqWorkshop!.referenceCode}`,
      bodyFa: 'دفتر در حین انجام کار، مدرک تکمیلی بیمه‌شده جدید را درخواست کرده است.',
      dedupeKey: `seed_cust_notif:${reqWorkshop!.id}`,
    });

    await notifyAllOfficeAdmins(conn.db, {
      notificationType: 'new_customer_request',
      requestId: reqDriver2!.id,
      titleFa: `درخواست جدید راننده (${reqDriver2!.referenceCode})`,
      bodyFa: 'درخواست جدید حق بیمه آبان ۱۴۰۵ توسط علی رضایی ثبت شد.',
      dedupeKey: `seed_admin_notif:${reqDriver2!.id}`,
    });

    logger.info('db.seed.completed', {
      demoAdminUsername: adminMobile,
      demoCustomerUsername: '09121112233',
      demoForceChangeCustomerUsername: '09123334455',
    });
  }
}

async function main() {
  const config = loadConfig();
  if (config.nodeEnv === 'production') {
    throw new Error(
      'SEED BLOCKED: Development demo seed script cannot run in NODE_ENV=production.',
    );
  }
  const conn = await createDatabaseConnection(config.databaseUrl);
  const storage = new LocalPrivateFileStorage(config.privateStorageDir);
  try {
    await conn.migrate();
    await seedDemoDatabase(conn.db, config, storage);
  } finally {
    await conn.close();
  }
}

const isMainModule =
  Boolean(process.argv[1]) && import.meta.url === url.pathToFileURL(process.argv[1]!).href;

if (isMainModule) {
  main().catch((err) => {
    logger.error('db.seed.failed', err);
    process.exit(1);
  });
}
