import { Global, Module } from '@nestjs/common';
import { HttpClient } from './http-client';

@Global()
@Module({ providers: [HttpClient], exports: [HttpClient] })
export class HttpModule {}
