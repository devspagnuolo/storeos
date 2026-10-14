import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Configuração HTTP compartilhada entre o servidor e os testes de integração. */
export function configureApp(app: NestExpressApplication) {
  // Render e outros proxies repassam o IP real em X-Forwarded-For; o rate limit depende dele.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:3000'], credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  return app;
}
