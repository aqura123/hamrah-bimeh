import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildValidNationalIdFromPrefix } from '../../src/shared/iran-identifiers.js';
import { createApiApp } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config.js';
import { createDatabaseConnection, type DatabaseConnection } from '../../src/server/db/client.js';
import { users } from '../../src/server/db/schema.js';
import { hashPassword } from '../../src/server/services/security.js';
import { LocalPrivateFileStorage } from '../../src/server/services/storage.js';

function makeValidPdf(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% ${label}\n%%EOF`, 'utf8');
}

describe('End-to-End Functional Regression (Flows 1 through 11)', () => {
  let dbConn: DatabaseConnection;
  let tempStorageDir: string;
  let app: ReturnType<typeof createApiApp>;

  const adminMobile = '09120000001';
  const adminPassword = 'AdminStrong#Password2026';

  const custAMobile = '09121110001';
  const custANationalId = buildValidNationalIdFromPrefix('001472583');
  const custANewPassword = 'AliSafePassword2026';

  const driverNationalId = buildValidNationalIdFromPrefix('002583691');
  const workshopContactNid = buildValidNationalIdFromPrefix('003691472');
  const employeeNid = buildValidNationalIdFromPrefix('004712589');

  beforeAll(async () => {
    tempStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-e2e-storage-'));
    dbConn = await createDatabaseConnection('pglite://memory');
    await dbConn.migrate();

    const adminHash = await hashPassword(adminPassword);
    await dbConn.db.insert(users).values({
      username: adminMobile,
      displayName: 'مدیر دفتر تست',
      role: 'office_admin',
      passwordHash: adminHash,
      forcePasswordChange: false,
      initialPasswordMode: 'manual_bootstrap',
      isActive: true,
    });

    const config = loadConfig({
      NODE_ENV: 'test',
      CURRENCY_UNIT: 'TOMAN',
      INITIAL_PASSWORD_MODE: 'national_id',
      PRIVATE_STORAGE_DIR: tempStorageDir,
    });

    app = createApiApp({
      db: dbConn.db,
      config,
      storage: new LocalPrivateFileStorage(tempStorageDir),
    });
  });

  afterAll(async () => {
    await dbConn.close();
    await fs.rm(tempStorageDir, { recursive: true, force: true });
  });

  it('executes complete lifecycle: onboarding -> forced password change -> driver & workshop requests -> awaiting info while in progress -> messages -> amount & output file -> completion -> cancellation workflows', async () => {
    const adminAgent = request.agent(app);
    const custAgent = request.agent(app);

    // 1. Admin logs in & creates Customer A (National ID initial password policy)
    const adminLogin = await adminAgent
      .post('/api/auth/login')
      .send({ mobile: adminMobile, password: adminPassword });
    expect(adminLogin.status).toBe(200);
    const adminCsrf = adminLogin.body.csrfToken as string;
    expect(adminCsrf).toBeTruthy();

    const createCustRes = await adminAgent
      .post('/api/admin/customers')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        fullName: 'رضا محمدی',
        mobile: '۰۹۱۲ ۱۱۱ ۰۰۰۱', // Persian digits & spaces normalized automatically
        nationalId: custANationalId,
        isActive: true,
        initialPasswordMode: 'national_id',
      });
    expect(createCustRes.status).toBe(201);
    expect(createCustRes.body.onboarding.forcePasswordChange).toBe(true);
    // National ID is NEVER returned as plaintext password
    expect(createCustRes.body.onboarding.oneTimeTemporaryPassword).toBeNull();
    expect(JSON.stringify(createCustRes.body)).not.toContain(custANationalId);

    const customerAId = createCustRes.body.customer.id as string;

    // 2. Customer A logs in with initial password -> blocked from portal until changed
    const custLogin = await custAgent
      .post('/api/auth/login')
      .send({ mobile: custAMobile, password: custANationalId });
    expect(custLogin.status).toBe(200);
    expect(custLogin.body.user.forcePasswordChange).toBe(true);
    const custCsrf = custLogin.body.csrfToken as string;

    const blockedPortal = await custAgent.get('/api/portal/overview');
    expect(blockedPortal.status).toBe(403);
    expect(blockedPortal.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // Reject setting new password equal to mobile number
    const badPwChange = await custAgent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', custCsrf)
      .send({
        currentPassword: custANationalId,
        newPassword: `${custAMobile}`, // invalid (no letters / equals username)
        confirmPassword: `${custAMobile}`,
      });
    expect(badPwChange.status).toBe(400);

    const goodPwChange = await custAgent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', custCsrf)
      .send({
        currentPassword: custANationalId,
        newPassword: custANewPassword,
        confirmPassword: custANewPassword,
      });
    expect(goodPwChange.status).toBe(200);

    const initialPortal = await custAgent.get('/api/portal/overview');
    expect(initialPortal.status).toBe(200);
    expect(initialPortal.body.drivers).toHaveLength(0);
    expect(initialPortal.body.workshops).toHaveLength(0);

    // 3. Customer A introduces a new driver + creates a one-month driver request + uploads PDF
    const driverPayload = {
      driverMode: 'new',
      newDriver: {
        fullName: 'حسین رضوی',
        nationalId: driverNationalId,
      },
      jalaliYear: 1405,
      jalaliMonth: 8,
      explanation: 'ثبت حق بیمه آبان ۱۴۰۵',
    };

    const createDriverReq = await custAgent
      .post('/api/portal/requests/driver')
      .set('X-CSRF-Token', custCsrf)
      .field('payload', JSON.stringify(driverPayload))
      .attach('attachments', makeValidPdf('Customer Driver Doc'), {
        filename: 'driver-note.pdf',
        contentType: 'application/pdf',
      });

    expect(createDriverReq.status).toBe(201);
    const driverReqId = createDriverReq.body.request.id as string;
    expect(createDriverReq.body.request.referenceCode).toMatch(/^HB-1405-/);

    // Check duplicate warning endpoint for same driver & month
    const afterDriverPortal = await custAgent.get('/api/portal/overview');
    const savedDriverId = afterDriverPortal.body.drivers[0].id as string;
    const dupCheck = await custAgent.get(
      `/api/portal/check-duplicate?requestType=driver&profileId=${savedDriverId}&jalaliYear=1405&jalaliMonth=8`,
    );
    expect(dupCheck.status).toBe(200);
    expect(dupCheck.body.duplicateExists).toBe(true);

    // 4 & 5. Customer A creates a workshop request WITH optional new insured employee + employee PDF
    const workshopPayload = {
      workshopMode: 'new',
      newWorkshop: {
        workshopName: 'کارگاه نساجی البرز',
        workshopCode: '0499887766',
        contactFullName: 'رضا محمدی',
        contactNationalId: workshopContactNid,
      },
      jalaliYear: 1405,
      jalaliMonth: 8,
      explanation: 'ارسال لیست آبان به همراه نیروی جدید',
      includeNewEmployee: true,
      newEmployee: {
        fullName: 'سعید کریمی',
        nationalId: employeeNid,
        insuranceNumber: '0091827364',
      },
    };

    const createWorkshopReq = await custAgent
      .post('/api/portal/requests/workshop')
      .set('X-CSRF-Token', custCsrf)
      .field('payload', JSON.stringify(workshopPayload))
      .attach('employeeDocuments', makeValidPdf('Employee ID Doc'), {
        filename: 'saeed-id.pdf',
        contentType: 'application/pdf',
      });
    expect(createWorkshopReq.status).toBe(201);
    const workshopReqId = createWorkshopReq.body.request.id as string;

    // Also verify existing workshop can submit next month WITHOUT re-sending fixed fields or employee fields
    const portalWithWorkshop = await custAgent.get('/api/portal/overview');
    const savedWorkshopId = portalWithWorkshop.body.workshops[0].id as string;

    const secondMonthWorkshopReq = await custAgent
      .post('/api/portal/requests/workshop')
      .set('X-CSRF-Token', custCsrf)
      .field(
        'payload',
        JSON.stringify({
          workshopMode: 'existing',
          workshopId: savedWorkshopId,
          jalaliYear: 1405,
          jalaliMonth: 9,
          explanation: 'لیست آذر بدون تغییر نیرو',
          includeNewEmployee: false,
        }),
      );
    expect(secondMonthWorkshopReq.status).toBe(201);

    // Verify workshop monthly history is sorted newest insurance month first (1405/09 before 1405/08)
    const wsHistory = await custAgent.get(`/api/portal/workshops/${savedWorkshopId}`);
    expect(wsHistory.status).toBe(200);
    expect(wsHistory.body.requests[0].jalaliMonth).toBe(9);
    expect(wsHistory.body.requests[1].jalaliMonth).toBe(8);

    // 6. Office searches by workshop code, moves to `in_progress`, AND requests missing info simultaneously
    const searchByCode = await adminAgent.get('/api/admin/requests?q=0499887766');
    expect(searchByCode.status).toBe(200);
    expect(searchByCode.body.totalCount).toBe(2);

    const moveInProgress = await adminAgent
      .post(`/api/admin/requests/${workshopReqId}/status`)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        newStatus: 'in_progress',
        explanation: 'لیست اصلی کارگاه در حال ثبت توسط دفتر است.',
      });
    expect(moveInProgress.status).toBe(200);

    const requestMoreInfo = await adminAgent
      .post(`/api/admin/requests/${workshopReqId}/awaiting-info`)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        awaitingCustomerInfo: true,
        note: 'لطفاً تاریخ دقیق شروع به کار آقای سعید کریمی را اعلام کنید.',
      });
    expect(requestMoreInfo.status).toBe(200);

    // Verify status remains `in_progress` while `awaitingCustomerInfo === true`
    const detailWhileCoexisting = await custAgent.get(`/api/requests/${workshopReqId}`);
    expect(detailWhileCoexisting.status).toBe(200);
    expect(detailWhileCoexisting.body.request.status).toBe('in_progress');
    expect(detailWhileCoexisting.body.request.awaitingCustomerInfo).toBe(true);

    // Cannot mark `completed` while `awaitingCustomerInfo` is still true
    const prematureComplete = await adminAgent
      .post(`/api/admin/requests/${workshopReqId}/status`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ newStatus: 'completed' });
    expect(prematureComplete.status).toBe(400);

    // 7. Customer replies and sees office messages
    const custReply = await custAgent
      .post(`/api/requests/${workshopReqId}/messages`)
      .set('X-CSRF-Token', custCsrf)
      .field('body', 'تاریخ شروع به کار ایشان ۱ آبان ۱۴۰۵ بوده است.');
    expect(custReply.status).toBe(201);

    // 8 & 9. Office clears awaiting flag, enters final amount, uploads output PDF, and marks Completed
    const clearAwaiting = await adminAgent
      .post(`/api/admin/requests/${workshopReqId}/awaiting-info`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ awaitingCustomerInfo: false, note: 'پاسخ دریافت شد.' });
    expect(clearAwaiting.status).toBe(200);

    const setAmount = await adminAgent
      .post(`/api/admin/requests/${workshopReqId}/amount`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ finalAmount: 1450000, note: 'مبلغ نهایی خدمات لیست آبان' });
    expect(setAmount.status).toBe(200);

    const uploadOutput = await adminAgent
      .post(`/api/admin/requests/${workshopReqId}/files`)
      .set('X-CSRF-Token', adminCsrf)
      .field('note', 'رسید نهایی لیست بیمه پیوست شد.')
      .attach('files', makeValidPdf('Final Receipt Output'), {
        filename: 'workshop-receipt-1405-08.pdf',
        contentType: 'application/pdf',
      });
    expect(uploadOutput.status).toBe(201);

    const markCompleted = await adminAgent
      .post(`/api/admin/requests/${workshopReqId}/status`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ newStatus: 'completed', explanation: 'عملیات لیست آبان به اتمام رسید.' });
    expect(markCompleted.status).toBe(200);

    // Customer verifies final status, amount, output file download, notifications & timeline
    const completedView = await custAgent.get(`/api/requests/${workshopReqId}`);
    expect(completedView.status).toBe(200);
    expect(completedView.body.request.status).toBe('completed');
    expect(completedView.body.request.finalAmount).toBe(1450000);
    expect(completedView.body.request.currencyUnit).toBe('TOMAN');
    // Storage keys must NEVER be leaked
    expect(JSON.stringify(completedView.body.files)).not.toContain('.bin');

    const outputFile = completedView.body.files.find(
      (f: { classification: string }) => f.classification === 'office_output',
    );
    expect(outputFile).toBeTruthy();

    const downloadRes = await custAgent.get(outputFile.downloadUrl);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-disposition']).toContain('attachment;');
    expect(downloadRes.headers['x-content-type-options']).toBe('nosniff');

    const custNotifs = await custAgent.get('/api/notifications');
    expect(custNotifs.status).toBe(200);
    expect(custNotifs.body.notifications.length).toBeGreaterThanOrEqual(4);

    // 10 & 11. Customer requests cancellation on `driverReqId`; Office decides; history & files retained
    const reqCancel = await custAgent
      .post(`/api/requests/${driverReqId}/request-cancellation`)
      .set('X-CSRF-Token', custCsrf)
      .send({ reason: 'اشتباهاً ماه آبان انتخاب شده و قصد ثبت مهرماه را داشتم.' });
    expect(reqCancel.status).toBe(200);

    const afterCancelReq = await custAgent.get(`/api/requests/${driverReqId}`);
    // Status is NOT cancelled directly by customer
    expect(afterCancelReq.body.request.status).toBe('registered');
    expect(afterCancelReq.body.request.cancellationDecision).toBe('pending');

    // Admin accepts cancellation with mandatory explanation
    const acceptCancel = await adminAgent
      .post(`/api/admin/requests/${driverReqId}/cancellation-decision`)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        decision: 'accepted',
        explanation: 'پیش از شروع عملیات بررسی شد و با لغو درخواست موافقت گردید.',
      });
    expect(acceptCancel.status).toBe(200);

    const cancelledDetail = await custAgent.get(`/api/requests/${driverReqId}`);
    expect(cancelledDetail.status).toBe(200);
    expect(cancelledDetail.body.request.status).toBe('cancelled');
    // Messages, files, and timeline remain intact after cancellation
    expect(cancelledDetail.body.messages.length).toBeGreaterThanOrEqual(2);
    expect(cancelledDetail.body.files).toHaveLength(1);
    expect(cancelledDetail.body.timeline.length).toBeGreaterThanOrEqual(3);

    // Office-mediated password reset revokes customer session & never reveals old password
    const resetRes = await adminAgent
      .post(`/api/admin/customers/${customerAId}/reset-password`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ mode: 'generated' });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.oneTimeTemporaryPassword).toHaveLength(12);
    expect(JSON.stringify(resetRes.body)).not.toContain(custANewPassword);

    // Old customer session is immediately invalidated
    const revokedCheck = await custAgent.get('/api/portal/overview');
    expect(revokedCheck.status).toBe(401);
  });
});
