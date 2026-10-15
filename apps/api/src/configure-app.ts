import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Configuração HTTP compartilhada entre o servidor e os testes de integração. */
export function configureApp(app: NestExpressApplication) {
  // Render e outros proxies repassam o IP real em X-Forwarded-For; o rate limit depende dele.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // Planilhas de produtos (CSV) chegam como texto puro e podem passar dos 100 kb padrão do JSON.
  app.useBodyParser('text', { type: ['text/csv', 'text/plain'], limit: '4mb' });
  const allowed = process.env.WEB_ORIGIN?.split(',').map(origin => origin.trim()) ?? ['http://localhost:3000'];
  // Lojas sem domínio próprio ficam em subdomínios do STORE_BASE_DOMAIN (https://loja.base).
  const baseDomain = (process.env.STORE_BASE_DOMAIN ?? '').trim().toLowerCase();
  const platformOrigin = baseDomain ? new RegExp(`^https://[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?\\.${baseDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : null;
  app.enableCors({
    origin: (origin, done) => done(null, !origin || allowed.includes(origin) || Boolean(platformOrigin?.test(origin))),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  return app;
}
