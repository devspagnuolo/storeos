import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OnboardingController } from './onboarding.controller';
import { UnverifiedCleanupJob } from './unverified-cleanup.job';
import { OnboardingService } from './onboarding.service';

@Module({ imports: [NotificationsModule], controllers: [OnboardingController], providers: [OnboardingService, UnverifiedCleanupJob] })
export class OnboardingModule {}
