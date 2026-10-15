import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ManualPaymentProvider } from './manual-payment.provider';
import { MercadoPagoClient } from './mercado-pago.client';
import { MercadoPagoProvider } from './mercado-pago.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentRouter } from './payment-router';
import { RedeClient } from './rede.client';
import { RedeProvider } from './rede.provider';
import { PaymentsConfigController } from './payments-config.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsWebhookService } from './payments-webhook.service';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
@Module({ imports: [OrdersModule], controllers: [PaymentsWebhookController, PaymentsConfigController, RefundsController], providers: [ManualPaymentProvider, MercadoPagoClient, MercadoPagoProvider, RedeClient, RedeProvider, PaymentRouter, PaymentsWebhookService, RefundsService, { provide: PAYMENT_PROVIDER, useExisting: PaymentRouter }], exports: [PAYMENT_PROVIDER, MercadoPagoClient] }) export class PaymentsModule {}
