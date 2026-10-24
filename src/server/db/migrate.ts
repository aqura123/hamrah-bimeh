import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { createDatabaseConnection } from './client.js';

async function main() {
  const config = loadConfig();
  logger.info('db.migrate.starting', { mode: config.databaseUrl.split(':')[0] });
  const conn = await createDatabaseConnection(config.databaseUrl);
  try {
    await conn.migrate();
    logger.info('db.migrate.completed');
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  logger.error('db.migrate.failed', err);
  process.exit(1);
});
