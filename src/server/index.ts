import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createApiApp, getRouteMetadataFa } from './app.js';
import { loadConfig } from './config.js';
import { createDatabaseConnection } from './db/client.js';
import { seedDemoDatabase } from './db/seed.js';
import { logger } from './logger.js';
import { LocalPrivateFileStorage, SupabasePrivateFileStorage,} from './services/storage.js';

function injectPageMeta(html: string, pathname: string): string {
  const meta = getRouteMetadataFa(pathname);
  const escapedTitle = meta.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedDesc = meta.description.replace(/"/g, '&quot;');
  return html
    .replace(/<title>.*?<\/title>/s, `<title>${escapedTitle}</title>`)
    .replace(
      /<meta name="description" content=".*?"\s*\/?>/s,
      `<meta name="description" content="${escapedDesc}" />`,
    );
}

async function startServer() {
  const config = loadConfig();
  const dbConn = await createDatabaseConnection(config.databaseUrl);
  await dbConn.migrate();

  const storage = config.nodeEnv === 'production' ? new SupabasePrivateFileStorage() : new LocalPrivateFileStorage(config.privateStorageDir);
  if (config.nodeEnv === 'development') {
    await seedDemoDatabase(dbConn.db, config, storage);
  }
  const httpServer = http.createServer();

  let mountFrontend: (app: Express) => void;
  const serveBuiltClient =
    config.nodeEnv === 'production' || process.env.SERVE_BUILT_CLIENT === 'true';

  if (serveBuiltClient) {
    const clientDist = path.resolve(process.cwd(), 'dist/client');
    const templateHtml = await fs.readFile(path.join(clientDist, 'index.html'), 'utf8');

    mountFrontend = (app: Express) => {
      app.use(
        express.static(clientDist, {
          index: false,
          maxAge: '7d',
        }),
      );

      app.get('*', (req: Request, res: Response) => {
        const rendered = injectPageMeta(templateHtml, req.path);
        res
          .status(200)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
          .send(rendered);
      });
    };
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'custom',
    });

    mountFrontend = (app: Express) => {
      app.use(vite.middlewares);

      app.get('*', async (req: Request, res: Response, next: NextFunction) => {
        try {
          const indexPath = path.resolve(process.cwd(), 'index.html');
          const rawHtml = await fs.readFile(indexPath, 'utf8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
          const rendered = injectPageMeta(transformed, req.path);
          res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(rendered);
        } catch (err) {
          next(err);
        }
      });
    };
  }

  const app = createApiApp({ db: dbConn.db, config, storage, mountFrontend });
  httpServer.on('request', app);

  httpServer.listen(config.port, config.host, () => {
    logger.info('server.listening', {
      host: config.host,
      port: config.port,
      env: config.nodeEnv,
      currencyUnit: config.currencyUnit,
    });
  });

  const shutdown = async () => {
    logger.info('server.shutting_down');
    httpServer.close();
    await dbConn.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  logger.error('server.startup_failed', err);
  process.exit(1);
});
