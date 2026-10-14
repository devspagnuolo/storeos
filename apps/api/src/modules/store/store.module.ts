import { Module } from '@nestjs/common';
import { DnsResolver, TlsProbe } from './domain-probes';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { StoreAssetsService } from './store-assets.service';
import { StoreController } from './store.controller';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { StoreSetupController } from './store-setup.controller';

@Module({ controllers: [StoreController, StorefrontController, StoreSetupController, DomainsController], providers: [StoreAssetsService, StorefrontService, DomainsService, DnsResolver, TlsProbe], exports: [StoreAssetsService] })
export class StoreModule {}
