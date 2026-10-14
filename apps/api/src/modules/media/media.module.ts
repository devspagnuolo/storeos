import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
@Module({ imports: [StoreModule], controllers: [MediaController], providers: [MediaService] }) export class MediaModule {}
