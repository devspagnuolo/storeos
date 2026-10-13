import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { AntifraudService } from './application/antifraud.service';
import { PaymentGatewayService } from './application/payment-gateway.service';
import { PaymentsService } from './application/payments.service';
import { DevPaymentsController, PaymentsAdminController, PaymentWebhooksController } from './presentation/payments.controller';
import { MercadoPagoProvider } from './providers/mercadopago.provider';
import { MockPaymentProvider } from './providers/mock.provider';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentWebhooksController, DevPaymentsController, PaymentsAdminController],
  providers: [MockPaymentProvider, MercadoPagoProvider, PaymentGatewayService, PaymentsService, AntifraudService],
  exports: [PaymentsService, PaymentGatewayService, AntifraudService],
})
export class PaymentsModule {}
