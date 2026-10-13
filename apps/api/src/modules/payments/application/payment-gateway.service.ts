import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config';
import { ExternalServiceError } from '../../../shared/domain/errors';
import { EncryptionService } from '../../../shared/infrastructure/crypto/encryption.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { MercadoPagoProvider } from '../providers/mercadopago.provider';
import { MockPaymentProvider } from '../providers/mock.provider';
import { PaymentProvider } from '../providers/payment-provider';

export interface ResolvedGateway {
  provider: PaymentProvider;
  credentials: Record<string, string>;
}

/** Escolhe o provedor de pagamento e as credenciais (por loja, cifradas) com fallback para variáveis de ambiente. */
@Injectable()
export class PaymentGatewayService {
  private readonly registry: Map<string, PaymentProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EncryptionService,
    private readonly config: AppConfig,
    mock: MockPaymentProvider,
    mercadopago: MercadoPagoProvider,
  ) {
    this.registry = new Map<string, PaymentProvider>([mock, mercadopago].map((p) => [p.key, p]));
  }

  get mock(): MockPaymentProvider {
    return this.registry.get('mock') as MockPaymentProvider;
  }

  provider(key: string): PaymentProvider | undefined {
    return this.registry.get(key);
  }

  async resolve(storeId: string, preferredKey?: string): Promise<ResolvedGateway> {
    const integration = await this.prisma.integration.findFirst({
      where: { storeId, kind: 'PAYMENT', status: 'CONNECTED', ...(preferredKey ? { provider: preferredKey } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
    if (integration) {
      const provider = this.registry.get(integration.provider);
      if (!provider) throw new ExternalServiceError(`Provedor de pagamento não suportado: ${integration.provider}`, 'PAYMENT_NOT_SUPPORTED');
      const credentials = integration.credentialsEnc ? this.crypto.decryptJson<Record<string, string>>(integration.credentialsEnc) : {};
      return { provider, credentials };
    }

    const key = preferredKey ?? this.config.env.PAYMENT_PROVIDER;
    const provider = this.registry.get(key);
    if (!provider) throw new ExternalServiceError('Nenhum provedor de pagamento configurado', 'PAYMENT_NOT_CONFIGURED');
    if (key === 'mock' && this.config.isProduction) {
      throw new ExternalServiceError('Configure um provedor de pagamento para receber pedidos', 'PAYMENT_NOT_CONFIGURED');
    }
    const credentials = key === 'mercadopago' && this.config.env.MERCADOPAGO_ACCESS_TOKEN ? { accessToken: this.config.env.MERCADOPAGO_ACCESS_TOKEN } : {};
    return { provider, credentials };
  }
}
