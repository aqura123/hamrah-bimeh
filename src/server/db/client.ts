import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema.js';

export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DatabaseConnection {
  db: AppDb;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
}

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle');

async function openPgliteWithRecovery(resolvedDir: string): Promise<PGlite> {
  // Never delete or recreate a potentially valuable database on an unclean snapshot.
  const client = new PGlite(resolvedDir);
  await client.waitReady;
  return client;
}

export async function createDatabaseConnection(databaseUrl: string): Promise<DatabaseConnection> {
  if (databaseUrl.startsWith('pglite://')) {
    const rawTarget = databaseUrl.slice('pglite://'.length).trim();
    let client: PGlite;
    if (!rawTarget || rawTarget === 'memory' || rawTarget === ':memory:') {
      const previewSnapshotPath = process.env.PREVIEW_DB_SNAPSHOT_PATH;
      if (previewSnapshotPath && process.env.NODE_ENV === 'production') {
        throw new Error('PREVIEW_DB_SNAPSHOT_PATH is only available for non-production previews.');
      }
      if (previewSnapshotPath) {
        const compressedBackup = await fs.promises.readFile(path.resolve(previewSnapshotPath));
        client = new PGlite({ loadDataDir: new Blob([new Uint8Array(compressedBackup)]) });
      } else {
        client = new PGlite();
      }
      await client.waitReady;
    } else {
      const resolvedDir = path.resolve(process.cwd(), rawTarget);
      fs.mkdirSync(path.dirname(resolvedDir), { recursive: true });
      client = await openPgliteWithRecovery(resolvedDir);
    }

    const db = drizzlePglite(client, { schema }) as unknown as AppDb;

    return {
      db,
      migrate: async () => {
        await migratePglite(drizzlePglite(client, { schema }), {
          migrationsFolder: MIGRATIONS_FOLDER,
        });
      },
      close: async () => {
        await client.close();
      },
    };
  }

  // Standard PostgreSQL server connection
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
  });
  const pgDb = drizzlePg(pool, { schema });

  return {
    db: pgDb as unknown as AppDb,
    migrate: async () => {
      await migratePg(pgDb, {
        migrationsFolder: MIGRATIONS_FOLDER,
      });
    },
    close: async () => {
      await pool.end();
    },
  };
}
