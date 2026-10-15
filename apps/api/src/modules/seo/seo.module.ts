import { Module } from '@nestjs/common';
import { ProductFeedController } from './product-feed.controller';
import { ProductFeedService } from './product-feed.service';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({ controllers: [SeoController, ProductFeedController], providers: [SeoService, ProductFeedService] })
export class SeoModule {}
