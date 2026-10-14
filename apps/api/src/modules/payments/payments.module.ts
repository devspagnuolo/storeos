import { Module } from '@nestjs/common';
import { ManualPaymentProvider } from './manual-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
@Module({ providers: [{ provide: PAYMENT_PROVIDER, useClass: ManualPaymentProvider }], exports: [PAYMENT_PROVIDER] }) export class PaymentsModule {}
