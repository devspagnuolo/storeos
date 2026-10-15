import { Module } from '@nestjs/common';
import { RedirectsController } from './redirects.controller';
import { RedirectsService } from './redirects.service';

@Module({ controllers: [RedirectsController], providers: [RedirectsService] })
export class RedirectsModule {}
