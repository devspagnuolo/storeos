import { Module } from '@nestjs/common';
import { StoreAssetsService } from './store-assets.service';
import { StoreController } from './store.controller';

@Module({ controllers: [StoreController], providers: [StoreAssetsService] })
export class StoreModule {}
