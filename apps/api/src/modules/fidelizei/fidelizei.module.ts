import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { FidelizeiClient } from './fidelizei.client';
import { FidelizeiAccountController, FidelizeiController } from './fidelizei.controller';
import { FidelizeiService } from './fidelizei.service';
import { FidelizeiSyncService } from './fidelizei-sync.service';

@Module({ imports: [AccountModule], controllers: [FidelizeiController, FidelizeiAccountController], providers: [FidelizeiClient, FidelizeiService, FidelizeiSyncService], exports: [FidelizeiService] })
export class FidelizeiModule {}
