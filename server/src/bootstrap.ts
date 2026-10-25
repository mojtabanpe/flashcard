import { NestExpressApplication } from '@nestjs/platform-express';
import { raw } from 'express';
import { resolve } from 'node:path';
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { McpService } from './mcp/mcp.service';
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: process.env['NODE_ENV'] === 'test' ? false : undefined,
  });
  const origins = (
    process.env['APP_ORIGINS'] ?? 'http://localhost:4333,http://127.0.0.1:4333'
  )
    .split(',')
    .map((s) => s.trim());
  if (process.env['NODE_ENV'] === 'production' && !process.env['APP_ORIGINS'])
    throw new Error('APP_ORIGINS is required in production.');
  app.use('/api/ai/practice/transcribe', raw({ type: ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav'], limit: '1500kb' }));
  app.setGlobalPrefix('api');
  app.set('trust proxy', 'loopback');
  app.get(McpService).mount(app.getHttpAdapter().getInstance());
  app.enableCors({
    origin: origins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Recall-Client'],
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers['x-recall-client'] !== 'web' ||
        (req.headers.origin && !origins.includes(req.headers.origin)))
    ) {
      res.status(403).json({ message: 'Request origin is not allowed.' });
      return;
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const frontend = process.env['FRONTEND_PATH'];
  if (frontend) {
    const root = resolve(frontend);
    app.useStaticAssets(root, {
      // Hashed build files never change; index.html, ngsw.json, the service
      // worker and the manifest must always be revalidated.
      setHeaders: (response: Response, path: string) =>
        response.setHeader(
          'Cache-Control',
          /-[A-Za-z0-9_-]{8}\.(?:js|css)$/.test(path)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        ),
    });
    app
      .getHttpAdapter()
      .getInstance()
      .get(/^(?!\/api(?:\/|$)).*/, (_request: Request, response: Response) => {
        response.sendFile('index.html', { root });
      });
  }
  app.enableShutdownHooks();
  return app;
}
