import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CheckoutDraftService } from './checkout-draft.service';

/** Apaga rascunhos de checkout esquecidos (dados pessoais não ficam guardados sem uso). */
@Injectable()
export class CheckoutDraftCleanupJob {
  private readonly logger = new Logger(CheckoutDraftCleanupJob.name);

  constructor(private readonly drafts: CheckoutDraftService) {}

  @Interval(6 * 60 * 60_000)
  async run() {
    try {
      const removed = await this.drafts.purgeStale();
      if (removed) this.logger.log(`${removed} rascunho(s) de checkout antigos apagados`);
    } catch (error) {
      this.logger.error('Falha ao limpar rascunhos de checkout', error as Error);
    }
  }
}
