import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';
import { setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfig);
  setupApp(app, config);
  await app.listen(config.env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`API em http://localhost:${config.env.PORT}/api/v1 — docs em /api/docs`);
}

void bootstrap();
