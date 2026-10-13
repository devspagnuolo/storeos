import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { json, text, urlencoded } from 'express';
import { AppConfig } from './config/app-config';

/** Configuração compartilhada entre main.ts e os testes de integração. */
export function setupApp(app: INestApplication, config: AppConfig): void {
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  express.set('trust proxy', 1);

  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
  // Preserva o corpo bruto para validar assinaturas de webhooks (HMAC).
  app.use(
    json({
      limit: '2mb',
      verify: (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: false, limit: '256kb' }));
  app.use(text({ type: 'text/csv', limit: '5mb' }));
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.enableCors({
    origin: config.webOrigins,
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-store-slug', 'x-request-id', 'idempotency-key'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });
  app.enableShutdownHooks();

  if (config.env.SWAGGER_ENABLED) {
    const doc = new DocumentBuilder()
      .setTitle('STOREOS API')
      .setDescription('Plataforma de e-commerce SaaS multiempresa. Rotas /store/* são públicas (storefront) e usam o header x-store-slug.')
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'x-store-slug', in: 'header' }, 'store-slug')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc), { jsonDocumentUrl: 'api/docs-json' });
  }
}
