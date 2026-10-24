import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PhotoBackgroundService } from './photo-background.service';
import { PhotoroomClient } from './photoroom.client';
import { RemoteImageService } from './remote-image.service';
@Module({ imports: [StoreModule], controllers: [MediaController], providers: [MediaService, RemoteImageService, PhotoroomClient, PhotoBackgroundService], exports: [MediaService, RemoteImageService, PhotoBackgroundService] }) export class MediaModule {}
