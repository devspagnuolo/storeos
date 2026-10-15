import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OnboardingService } from './onboarding.service';

@Injectable()
export class UnverifiedCleanupJob {
  private readonly logger = new Logger(UnverifiedCleanupJob.name);
  private running = false;

  constructor(private readonly onboarding: OnboardingService) {}

  @Interval(6 * 3_600_000)
  async run() {
    if (this.running || process.env.SIGNUP_CLEANUP_JOB === 'off') return;
    this.running = true;
    try {
      const removed = await this.onboarding.purgeUnverified();
      if (removed) this.logger.log(`${removed} cadastro(s) nunca confirmado(s) removido(s)`);
    } catch (error) {
      this.logger.error('Falha ao limpar cadastros não confirmados', error as Error);
    } finally {
      this.running = false;
    }
  }
}
