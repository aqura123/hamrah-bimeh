
import type { Request, Response } from "express";
import { createApiApp } from "../src/server/app.js";
import { loadConfig } from "../src/server/config.js";
import { createDatabaseConnection } from "../src/server/db/client.js";
import {
  LocalPrivateFileStorage,
  SupabasePrivateFileStorage,
} from "../src/server/services/storage.js";

async function createApp() {
  const config = loadConfig();

  // Connect to the existing database without running migrations.
  const dbConn = await createDatabaseConnection(config.databaseUrl);

  const storage =
    config.nodeEnv === "production"
      ? new SupabasePrivateFileStorage()
      : new LocalPrivateFileStorage(config.privateStorageDir);

  return createApiApp({
    db: dbConn.db,
    config,
    storage,
  });
}

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: Request, res: Response) {
  try {
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error("API initialization failed:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
      });
    }
  }
}
