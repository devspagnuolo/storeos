import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { RemoteImageService } from './remote-image.service';
@Module({ imports: [StoreModule], controllers: [MediaController], providers: [MediaService, RemoteImageService], exports: [MediaService, RemoteImageService] }) export class MediaModule {}
