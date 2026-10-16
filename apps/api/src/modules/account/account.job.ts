import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AccountService } from './account.service';

@Injectable()
export class AccountCleanupJob {
  private readonly logger = new Logger(AccountCleanupJob.name);
  constructor(private readonly account: AccountService) {}

  @Interval(6 * 3_600_000)
  async run() {
    try {
      await this.account.purgeExpired();
    } catch (error) {
      this.logger.error('Falha ao limpar códigos e sessões de clientes', error as Error);
    }
  }
}
