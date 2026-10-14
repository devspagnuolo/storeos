import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true }));
  // Encerra com SIGTERM (deploys do Render): termina requisições em curso e fecha o banco.
  app.enableShutdownHooks();
  // A documentação da API só fica pública quando pedido explicitamente.
  if (process.env.SWAGGER_ENABLED === 'true' || process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder().setTitle('STOREOS API').setDescription('Enterprise commerce API').setVersion('1.0').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
