import { eq } from 'drizzle-orm';
import { normalizeIranianMobile } from '../../shared/iran-identifiers.js';
import { loadConfig } from '../config.js';
import { createDatabaseConnection } from './client.js';
import { users } from './schema.js';
import { logger } from '../logger.js';
import { recordAuditEvent } from '../services/audit.js';
import { hashPassword } from '../services/security.js';

const FORBIDDEN_BOOTSTRAP_PASSWORDS = new Set([
  '',
  'admin',
  '12345678',
  'password',
  'REPLACE_WITH_STRONG_ADMIN_PASSWORD',
]);

async function main() {
  const config = loadConfig();
  const rawMobile = process.env.BOOTSTRAP_ADMIN_MOBILE ?? '';
  const rawPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  const displayName = (process.env.BOOTSTRAP_ADMIN_NAME ?? 'مدیر دفتر همراه بیمه').trim();

  const mobile = normalizeIranianMobile(rawMobile);
  if (!mobile) {
    throw new Error('BOOTSTRAP_ADMIN_MOBILE must be a valid Iranian mobile number (09XXXXXXXXX).');
  }
  if (rawPassword.length < 10 || FORBIDDEN_BOOTSTRAP_PASSWORDS.has(rawPassword)) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters and not a placeholder value.',
    );
  }

  const conn = await createDatabaseConnection(config.databaseUrl);
  try {
    await conn.migrate();
    const passwordHash = await hashPassword(rawPassword);

    const [existing] = await conn.db
      .select()
      .from(users)
      .where(eq(users.username, mobile))
      .limit(1);

    if (existing) {
      await conn.db
        .update(users)
        .set({
          displayName,
          role: 'office_admin',
          passwordHash,
          forcePasswordChange: false,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
      logger.info('bootstrap.admin.updated', { username: mobile });
    } else {
      const [created] = await conn.db
        .insert(users)
        .values({
          username: mobile,
          displayName,
          role: 'office_admin',
          passwordHash,
          forcePasswordChange: false,
          initialPasswordMode: 'manual_bootstrap',
          isActive: true,
        })
        .returning();

      await recordAuditEvent(conn.db, {
        actorUserId: created!.id,
        actorRole: 'system',
        entityType: 'user',
        entityId: created!.id,
        eventType: 'user.bootstrap_admin_created',
        customerVisible: false,
        summaryFa: 'حساب مدیر دفتر از طریق فرآیند راه‌اندازی امن ایجاد شد.',
      });
      logger.info('bootstrap.admin.created', { username: mobile });
    }
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  logger.error('bootstrap.admin.failed', err);
  process.exit(1);
});
