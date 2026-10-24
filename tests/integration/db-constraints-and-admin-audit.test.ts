import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildValidNationalIdFromPrefix } from '../../src/shared/iran-identifiers.js';
import { createApiApp } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config.js';
import { createDatabaseConnection, type DatabaseConnection } from '../../src/server/db/client.js';
import * as schema from '../../src/server/db/schema.js';
import { hashPassword } from '../../src/server/services/security.js';
import { LocalPrivateFileStorage } from '../../src/server/services/storage.js';

describe('Database Integrity Constraints, Masked Profile Audits & XSS Escaping', () => {
  let dbConn: DatabaseConnection;
  let tempStorageDir: string;
  let app: ReturnType<typeof createApiApp>;

  const adminMobile = '09120000055';
  const adminPw = 'Admin#AuditPass2026';
  const custMobile = '09125556677';
  const custPw = 'Cust#AuditPass2026';

  let customerId = '';
  let driverId = '';
  let workshopId = '';

  beforeAll(async () => {
    tempStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-db-test-'));
    dbConn = await createDatabaseConnection('pglite://memory');
    await dbConn.migrate();

    await dbConn.db.insert(schema.users).values({
      username: adminMobile,
      displayName: 'مدیر ممیزی',
      role: 'office_admin',
      passwordHash: await hashPassword(adminPw),
      forcePasswordChange: false,
      isActive: true,
    });

    const [uCust] = await dbConn.db
      .insert(schema.users)
      .values({
        username: custMobile,
        displayName: 'مشتری تست',
        role: 'customer',
        passwordHash: await hashPassword(custPw),
        forcePasswordChange: false,
        isActive: true,
      })
      .returning();

    const [cust] = await dbConn.db
      .insert(schema.customers)
      .values({
        userId: uCust!.id,
        fullName: 'مشتری تست',
        mobile: custMobile,
        nationalId: buildValidNationalIdFromPrefix('009111222'),
        isActive: true,
      })
      .returning();
    customerId = cust!.id;

    const [drv] = await dbConn.db
      .insert(schema.drivers)
      .values({
        customerId,
        fullName: 'راننده اولیه',
        nationalId: buildValidNationalIdFromPrefix('009222333'),
      })
      .returning();
    driverId = drv!.id;

    const [ws] = await dbConn.db
      .insert(schema.workshops)
      .values({
        customerId,
        workshopName: 'کارگاه اولیه',
        workshopCode: '55667788',
        contactFullName: 'رابط اولیه',
        contactNationalId: buildValidNationalIdFromPrefix('009333444'),
      })
      .returning();
    workshopId = ws!.id;

    const config = loadConfig({
      NODE_ENV: 'test',
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

  it('enforces PostgreSQL CHECK constraints against invalid request-profile relationships and invalid months', async () => {
    // 1. Driver request without driverId must fail DB constraint
    await expect(
      dbConn.db.insert(schema.requests).values({
        referenceCode: 'HB-1405-BAD001',
        customerId,
        requestType: 'driver',
        driverId: null,
        workshopId,
        jalaliYear: 1405,
        jalaliMonth: 8,
      }),
    ).rejects.toThrow();

    // 2. Invalid month (13) must fail DB constraint
    await expect(
      dbConn.db.insert(schema.requests).values({
        referenceCode: 'HB-1405-BAD002',
        customerId,
        requestType: 'driver',
        driverId,
        workshopId: null,
        jalaliYear: 1405,
        jalaliMonth: 13,
      }),
    ).rejects.toThrow();

    // 3. Negative finalAmount must fail DB constraint
    await expect(
      dbConn.db.insert(schema.requests).values({
        referenceCode: 'HB-1405-BAD003',
        customerId,
        requestType: 'driver',
        driverId,
        workshopId: null,
        jalaliYear: 1405,
        jalaliMonth: 8,
        finalAmount: -5000,
      }),
    ).rejects.toThrow();
  });

  it('records masked audit diffs when admin edits driver/workshop profiles and handles cancellation rejection + XSS payloads safely', async () => {
    const adminAgent = request.agent(app);
    const adminLogin = await adminAgent
      .post('/api/auth/login')
      .send({ mobile: adminMobile, password: adminPw });
    const adminCsrf = adminLogin.body.csrfToken as string;

    const newNid = buildValidNationalIdFromPrefix('009444555');
    const editDriver = await adminAgent
      .patch(`/api/admin/drivers/${driverId}`)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        fullName: 'راننده ویرایش‌شده',
        nationalId: newNid,
        reviewState: 'confirmed',
        isArchived: false,
      });
    expect(editDriver.status).toBe(200);

    // Check audit trail masks middle digits of national ID
    const auditRes = await adminAgent.get('/api/admin/audit-events?entityType=driver');
    expect(auditRes.status).toBe(200);
    const auditJson = JSON.stringify(auditRes.body.items);
    expect(auditJson).toContain('profile.driver_updated');
    expect(auditJson).not.toContain(newNid);

    // Customer submits request with HTML/XSS string in explanation & requests cancellation; Office rejects cancellation
    const custAgent = request.agent(app);
    const custLogin = await custAgent
      .post('/api/auth/login')
      .send({ mobile: custMobile, password: custPw });
    const custCsrf = custLogin.body.csrfToken as string;

    const xssPayload = '<img src=x onerror="alert(1)">توضیح تست';
    const reqRes = await custAgent
      .post('/api/portal/requests/driver')
      .set('X-CSRF-Token', custCsrf)
      .field(
        'payload',
        JSON.stringify({
          driverMode: 'existing',
          driverId,
          jalaliYear: 1405,
          jalaliMonth: 5,
          explanation: xssPayload,
        }),
      );
    expect(reqRes.status).toBe(201);
    const reqId = reqRes.body.request.id as string;

    await custAgent
      .post(`/api/requests/${reqId}/request-cancellation`)
      .set('X-CSRF-Token', custCsrf)
      .send({ reason: 'تقاضای لغو آزمایشی' });

    // Rejecting cancellation WITHOUT explanation fails validation
    const missingReasonReject = await adminAgent
      .post(`/api/admin/requests/${reqId}/cancellation-decision`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ decision: 'rejected', explanation: '' });
    expect(missingReasonReject.status).toBe(400);

    // Rejecting cancellation WITH explanation keeps request active
    const validRejectCancel = await adminAgent
      .post(`/api/admin/requests/${reqId}/cancellation-decision`)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        decision: 'rejected',
        explanation: 'عملیات ثبت در مرحله پایانی است و امکان لغو وجود ندارد.',
      });
    expect(validRejectCancel.status).toBe(200);

    const detailAfter = await custAgent.get(`/api/requests/${reqId}`);
    expect(detailAfter.body.request.status).toBe('registered');
    expect(detailAfter.body.request.cancellationDecision).toBe('rejected');
  });
});
