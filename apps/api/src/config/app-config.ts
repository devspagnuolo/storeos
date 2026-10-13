import { Global, Injectable, Module } from '@nestjs/common';
import { Env, loadEnv } from './env';

@Injectable()
export class AppConfig {
  readonly env: Env = loadEnv();

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }
  get webOrigins(): string[] {
    return this.env.WEB_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  }
}

@Global()
@Module({ providers: [AppConfig], exports: [AppConfig] })
export class AppConfigModule {}
