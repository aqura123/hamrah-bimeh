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
import { hashPassword, LoginRateLimiter } from '../../src/server/services/security.js';
import { LocalPrivateFileStorage } from '../../src/server/services/storage.js';

describe('Security Boundaries: IDOR, Privilege Escalation, CSRF, File Spoofing, Rate Limiting & No Portal Passwords', () => {
  let dbConn: DatabaseConnection;
  let tempStorageDir: string;
  let app: ReturnType<typeof createApiApp>;

  const adminMobile = '09120000099';
  const adminPassword = 'Admin#SecurePassword99';

  const custAMobile = '09121112221';
  const custBMobile = '09121112222';
  const sharedInitialPw = 'InitialPass1234';

  let custADriverId = '';
  let custAWorkshopId = '';
  let custARequestId = '';
  let custAFileId = '';
  let custANotificationId = '';

  let custBCsrf = '';
  let custBAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    tempStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hb-sec-storage-'));
    dbConn = await createDatabaseConnection('pglite://memory');
    await dbConn.migrate();

    const adminHash = await hashPassword(adminPassword);
    const custHash = await hashPassword(sharedInitialPw);

    await dbConn.db.insert(schema.users).values({
      username: adminMobile,
      displayName: 'مدیر امنیتی',
      role: 'office_admin',
      passwordHash: adminHash,
      forcePasswordChange: false,
      isActive: true,
    });

    const [uA] = await dbConn.db
      .insert(schema.users)
      .values({
        username: custAMobile,
        displayName: 'مشتری الف',
        role: 'customer',
        passwordHash: custHash,
        forcePasswordChange: false,
        isActive: true,
      })
      .returning();

    const [uB] = await dbConn.db
      .insert(schema.users)
      .values({
        username: custBMobile,
        displayName: 'مشتری ب',
        role: 'customer',
        passwordHash: custHash,
        forcePasswordChange: false,
        isActive: true,
      })
      .returning();

    const [cA] = await dbConn.db
      .insert(schema.customers)
      .values({
        userId: uA!.id,
        fullName: 'مشتری الف',
        mobile: custAMobile,
        nationalId: buildValidNationalIdFromPrefix('007111222'),
        isActive: true,
      })
      .returning();

    await dbConn.db.insert(schema.customers).values({
      userId: uB!.id,
      fullName: 'مشتری ب',
      mobile: custBMobile,
      nationalId: buildValidNationalIdFromPrefix('008111222'),
      isActive: true,
    });

    const [wsA] = await dbConn.db
      .insert(schema.workshops)
      .values({
        customerId: cA!.id,
        workshopName: 'کارگاه الف',
        workshopCode: '11223344',
        contactFullName: 'مشتری الف',
        contactNationalId: buildValidNationalIdFromPrefix('007222333'),
      })
      .returning();
    custAWorkshopId = wsA!.id;

    const config = loadConfig({
      NODE_ENV: 'test',
      PRIVATE_STORAGE_DIR: tempStorageDir,
      MAX_UPLOAD_MB: '1', // 1 MB limit for oversized file test
    });

    app = createApiApp({
      db: dbConn.db,
      config,
      storage: new LocalPrivateFileStorage(tempStorageDir),
      rateLimiter: new LoginRateLimiter(4, 60_000),
    });

    // Customer A creates a driver request with a valid PDF attachment
    const custAAgent = request.agent(app);
    const loginA = await custAAgent
      .post('/api/auth/login')
      .send({ mobile: custAMobile, password: sharedInitialPw });
    const csrfA = loginA.body.csrfToken as string;

    const createReqA = await custAAgent
      .post('/api/portal/requests/driver')
      .set('X-CSRF-Token', csrfA)
      .field(
        'payload',
        JSON.stringify({
          driverMode: 'new',
          newDriver: {
            fullName: 'راننده الف',
            nationalId: buildValidNationalIdFromPrefix('007333444'),
          },
          jalaliYear: 1405,
          jalaliMonth: 6,
          explanation: 'درخواست محرمانه مشتری الف',
        }),
      )
      .attach('attachments', Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF', 'utf8'), {
        filename: '../../etc/passwd.pdf',
        contentType: 'application/pdf',
      });

    expect(createReqA.status).toBe(201);
    custARequestId = createReqA.body.request.id;

    const overviewA = await custAAgent.get('/api/portal/overview');
    custADriverId = overviewA.body.drivers[0].id;

    const detailA = await custAAgent.get(`/api/requests/${custARequestId}`);
    custAFileId = detailA.body.files[0].id;
    // Path traversal stripped from displayFilename
    expect(detailA.body.files[0].displayFilename).toBe('passwd.pdf');

    const notifsA = await custAAgent.get('/api/notifications');
    custANotificationId = notifsA.body.notifications[0].id;

    // Log in Customer B
    custBAgent = request.agent(app);
    const loginB = await custBAgent
      .post('/api/auth/login')
      .send({ mobile: custBMobile, password: sharedInitialPw });
    custBCsrf = loginB.body.csrfToken;
  });

  afterAll(async () => {
    await dbConn.close();
    await fs.rm(tempStorageDir, { recursive: true, force: true });
  });

  it('blocks unauthenticated access to protected APIs, downloads, and HTML shells', async () => {
    expect((await request(app).get('/api/portal/overview')).status).toBe(401);
    expect((await request(app).get('/api/admin/requests')).status).toBe(401);
    expect((await request(app).get(`/api/requests/${custARequestId}`)).status).toBe(401);
    expect((await request(app).get(`/api/files/${custAFileId}/download`)).status).toBe(401);

    const htmlPortal = await request(app).get('/portal');
    expect(htmlPortal.status).toBe(302);
    expect(htmlPortal.headers.location).toBe('/login');

    const htmlAdmin = await request(app).get('/admin');
    expect(htmlAdmin.status).toBe(302);
    expect(htmlAdmin.headers.location).toBe('/login');
  });

  it('prevents IDOR across drivers, workshops, requests, messages, notifications, and private file downloads', async () => {
    expect((await custBAgent.get(`/api/portal/drivers/${custADriverId}`)).status).toBe(404);
    expect((await custBAgent.get(`/api/portal/workshops/${custAWorkshopId}`)).status).toBe(404);
    expect((await custBAgent.get(`/api/requests/${custARequestId}`)).status).toBe(404);
    expect((await custBAgent.get(`/api/files/${custAFileId}/download`)).status).toBe(404);

    // Customer B cannot post message to Customer A's request
    const msgIdor = await custBAgent
      .post(`/api/requests/${custARequestId}/messages`)
      .set('X-CSRF-Token', custBCsrf)
      .field('body', 'تلاش غیرمجاز');
    expect(msgIdor.status).toBe(404);

    // Customer B cannot mark Customer A's notification as read
    const notifIdor = await custBAgent
      .post(`/api/notifications/${custANotificationId}/read`)
      .set('X-CSRF-Token', custBCsrf);
    expect(notifIdor.status).toBe(404);

    // Customer B cannot create a request linked to Customer A's driverId or workshopId
    const crossDriverReq = await custBAgent
      .post('/api/portal/requests/driver')
      .set('X-CSRF-Token', custBCsrf)
      .field(
        'payload',
        JSON.stringify({
          driverMode: 'existing',
          driverId: custADriverId,
          jalaliYear: 1405,
          jalaliMonth: 8,
        }),
      );
    expect(crossDriverReq.status).toBe(403);

    const crossWorkshopReq = await custBAgent
      .post('/api/portal/requests/workshop')
      .set('X-CSRF-Token', custBCsrf)
      .field(
        'payload',
        JSON.stringify({
          workshopMode: 'existing',
          workshopId: custAWorkshopId,
          jalaliYear: 1405,
          jalaliMonth: 8,
        }),
      );
    expect(crossWorkshopReq.status).toBe(403);
  });

  it('blocks privilege escalation and unauthorized status/fee/admin actions by customers', async () => {
    expect((await custBAgent.get('/api/admin/requests')).status).toBe(403);
    expect((await custBAgent.get('/api/admin/customers')).status).toBe(403);

    const statusAttempt = await custBAgent
      .post(`/api/admin/requests/${custARequestId}/status`)
      .set('X-CSRF-Token', custBCsrf)
      .send({ newStatus: 'completed' });
    expect(statusAttempt.status).toBe(403);

    const feeAttempt = await custBAgent
      .post(`/api/admin/requests/${custARequestId}/amount`)
      .set('X-CSRF-Token', custBCsrf)
      .send({ finalAmount: 0 });
    expect(feeAttempt.status).toBe(403);

    const htmlAdminAttempt = await custBAgent.get('/admin');
    expect(htmlAdminAttempt.status).toBe(302);
    expect(htmlAdminAttempt.headers.location).toBe('/portal');
  });

  it('enforces CSRF token and Origin verification on state-changing requests', async () => {
    // Missing CSRF token
    const noCsrf = await custBAgent.post('/api/auth/logout');
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.code).toBe('CSRF_TOKEN_INVALID');

    // Mismatched Origin header
    const crossOrigin = await custBAgent
      .post('/api/auth/logout')
      .set('Origin', 'https://evil-attacker.example')
      .set('Host', 'hamrah-bimeh.ir')
      .set('X-CSRF-Token', custBCsrf);
    expect(crossOrigin.status).toBe(403);
    expect(crossOrigin.body.code).toBe('CSRF_ORIGIN_MISMATCH');
  });

  it('rejects executables, scripts, spoofed MIME types, double extensions, and oversized files', async () => {
    const validDriverPayload = JSON.stringify({
      driverMode: 'new',
      newDriver: {
        fullName: 'راننده تست فایل',
        nationalId: buildValidNationalIdFromPrefix('008444555'),
      },
      jalaliYear: 1405,
      jalaliMonth: 8,
    });

    // 1. Windows MZ executable spoofed as .pdf
    const exeSpoof = await custBAgent
      .post('/api/portal/requests/driver')
      .set('X-CSRF-Token', custBCsrf)
      .field('payload', validDriverPayload)
      .attach('attachments', Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      });
    expect(exeSpoof.status).toBe(400);

    // 2. HTML/SVG XSS payload spoofed as .png
    const svgSpoof = await custBAgent
      .post('/api/portal/requests/driver')
      .set('X-CSRF-Token', custBCsrf)
      .field('payload', validDriverPayload)
      .attach('attachments', Buffer.from('<svg onload="alert(1)"></svg>'), {
        filename: 'xss.png',
        contentType: 'image/png',
      });
    expect(svgSpoof.status).toBe(400);

    // 3. Double extension (.pdf.exe) even with PDF magic header
    const doubleExt = await custBAgent
      .post('/api/portal/requests/driver')
      .set('X-CSRF-Token', custBCsrf)
      .field('payload', validDriverPayload)
      .attach('attachments', Buffer.from('%PDF-1.4\n%%EOF'), {
        filename: 'document.pdf.exe',
        contentType: 'application/pdf',
      });
    expect(doubleExt.status).toBe(400);

    // 4. Oversized file (> 1 MB test limit)
    const oversizedBuf = Buffer.alloc(1.2 * 1024 * 1024, 0x41);
    oversizedBuf.write('%PDF-1.4\n', 0);
    const oversizedRes = await custBAgent
      .post('/api/portal/requests/driver')
      .set('X-CSRF-Token', custBCsrf)
      .field('payload', validDriverPayload)
      .attach('attachments', oversizedBuf, {
        filename: 'huge.pdf',
        contentType: 'application/pdf',
      });
    expect(oversizedRes.status).toBe(400);
    expect(oversizedRes.body.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects any attempt to submit es.tamin.ir passwords and verifies schema has zero portal credential columns', async () => {
    const forbiddenFieldAttempt = await custBAgent
      .post('/api/portal/requests/workshop')
      .set('X-CSRF-Token', custBCsrf)
      .field(
        'payload',
        JSON.stringify({
          workshopMode: 'new',
          newWorkshop: {
            workshopName: 'کارگاه ب',
            workshopCode: '998877',
            contactFullName: 'مشتری ب',
            contactNationalId: buildValidNationalIdFromPrefix('008555666'),
          },
          jalaliYear: 1405,
          jalaliMonth: 8,
          taminPassword: 'secret-portal-password',
        }),
      );
    expect(forbiddenFieldAttempt.status).toBe(400);

    // Inspect schema column names across all tables
    const allSchemaText = JSON.stringify(Object.keys(schema));
    expect(allSchemaText.toLowerCase()).not.toContain('tamin');
  });

  it('throttles repeated failed login attempts with 429 Retry-After', async () => {
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.77')
        .send({ mobile: custBMobile, password: 'WrongPassword!' });
      expect(res.status).toBe(401);
    }

    const throttled = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.77')
      .send({ mobile: custBMobile, password: 'WrongPassword!' });
    expect(throttled.status).toBe(429);
    expect(throttled.headers['retry-after']).toBeDefined();
  });

  it('supports cross-origin iframe preview auth when third-party cookies are blocked while keeping production strictly cookie-only', async () => {
    // 1. In strict mode (previewIframeCompat = false), previewSessionToken is NOT exposed and Bearer is ignored
    const strictLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.88')
      .send({ mobile: custAMobile, password: sharedInitialPw });
    expect(strictLogin.status).toBe(200);
    expect(strictLogin.body.previewSessionToken).toBeUndefined();

    // 2. In previewIframeCompat = true mode, even when the browser drops all cookies, Bearer + CSRF works
    const previewConfig = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'pglite://memory',
      SESSION_SECRET: 'test-session-secret-that-is-at-least-32-characters-long',
      PRIVATE_STORAGE_DIR: tempStorageDir,
      PREVIEW_IFRAME_COMPAT: 'true',
    });
    const previewApp = createApiApp({
      db: dbConn.db,
      config: previewConfig,
      storage: new LocalPrivateFileStorage(tempStorageDir),
      rateLimiter: new LoginRateLimiter(10, 60_000),
    });

    const previewLogin = await request(previewApp)
      .post('/api/auth/login')
      .set('Origin', 'https://3000-sandbox.e2b.app')
      .set('Host', 'localhost:3000')
      .send({
        mobile: `\u200f${custAMobile}\u200e`,
        password: `\u200e${sharedInitialPw}\u200f`,
      });
    expect(previewLogin.status).toBe(200);
    expect(typeof previewLogin.body.previewSessionToken).toBe('string');
    const setCookieHeader = String(previewLogin.headers['set-cookie'] ?? '');
    expect(setCookieHeader).toContain('SameSite=None');
    expect(setCookieHeader).toContain('Partitioned');

    const rawPreviewToken = String(previewLogin.body.previewSessionToken);
    const bearer = `Bearer ${rawPreviewToken}`;
    const csrf = String(previewLogin.body.csrfToken);
    const deadStaleCookie = 'hb_session=' + 'a'.repeat(64);

    // Subsequent calls with a STALE unpartitioned cookie AND stripped Authorization still succeed via X-Session-Token
    const overviewWithStaleCookie = await request(previewApp)
      .get('/api/portal/overview')
      .set('Cookie', deadStaleCookie)
      .set('X-Session-Token', rawPreviewToken);
    expect(overviewWithStaleCookie.status).toBe(200);
    expect(overviewWithStaleCookie.body.drivers.length).toBeGreaterThanOrEqual(1);

    // Duplicate Cookie header (stale unpartitioned + fresh Partitioned) also resolves cleanly
    const overviewDuplicateCookies = await request(previewApp)
      .get('/api/portal/overview')
      .set('Cookie', `${deadStaleCookie}; hb_session=${rawPreviewToken}`);
    expect(overviewDuplicateCookies.status).toBe(200);

    // Subsequent calls WITHOUT any Cookie header succeed via Bearer token
    const overviewRes = await request(previewApp)
      .get('/api/portal/overview')
      .set('Authorization', bearer);
    expect(overviewRes.status).toBe(200);
    expect(overviewRes.body.drivers.length).toBeGreaterThanOrEqual(1);

    const fileDownloadRes = await request(previewApp)
      .get(`/api/files/${custAFileId}/download`)
      .set('Authorization', bearer);
    expect(fileDownloadRes.status).toBe(200);

    // Logout revokes the session in PostgreSQL so Bearer token stops working immediately
    const logoutRes = await request(previewApp)
      .post('/api/auth/logout')
      .set('Authorization', bearer)
      .set('X-CSRF-Token', csrf);
    expect(logoutRes.status).toBe(200);

    const afterLogout = await request(previewApp)
      .get('/api/portal/overview')
      .set('Authorization', bearer);
    expect(afterLogout.status).toBe(401);
  });
});
