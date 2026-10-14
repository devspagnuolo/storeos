import { Module } from '@nestjs/common';
import { StoreAssetsService } from './store-assets.service';
import { StoreController } from './store.controller';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { StoreSetupController } from './store-setup.controller';

@Module({ controllers: [StoreController, StorefrontController, StoreSetupController], providers: [StoreAssetsService, StorefrontService] })
export class StoreModule {}
