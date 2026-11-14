import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule, ObserveInstrument } from './app.module';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Security headers. The API only returns JSON, so it gets a CSP that allows
  // nothing and can't be framed. Swagger UI at /api/docs is a real HTML page
  // and needs its own scripts, inline styles and data: images.
  const apiHeaders = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
  });
  const docsHeaders = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/api/docs')
      ? docsHeaders(req, res, next)
      : apiHeaders(req, res, next),
  );

  // Browser frontends allowed to call the API, comma-separated. Read through
  // ConfigService, which always sees .env. A browser's Origin never ends in
  // "/", so a trailing slash (e.g. "https://app.example.com/") is dropped.
  const corsOrigins = app
    .get(ConfigService)
    .get<string>('CORS_ORIGINS', 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });
  Logger.log(`CORS allows: ${corsOrigins.join(', ')}`, 'Bootstrap');

  setupSwagger(app);
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
