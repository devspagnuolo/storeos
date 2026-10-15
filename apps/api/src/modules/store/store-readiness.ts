export type ReadinessFacts = {
  storeName: string; hasLogo: boolean; whatsapp: boolean;
  activeProducts: number; stockedProducts: number; productsWithoutImage: number; productsWithoutPrice: number;
  storefrontCustomized: boolean; shippingRules: number; carrierConfigured: boolean;
  paymentConfigured: boolean; webhookConfigured: boolean; callbackConfigured: boolean; cardConfigured: boolean; confirmedPayments: number;
  publishedPageSlugs: string[]; emailConfigured: boolean; blingConnected: boolean; activeDomains: number;
  profileDone?: boolean;
};

export type ReadinessStep = { id: string; title: string; description: string; href: string; complete: boolean; level: 'required' | 'recommended' };

const hasPolicy = (slugs: string[], words: string[]) => slugs.some(slug => words.some(word => slug.includes(word)));

/** Regras do guia de configuração: o que bloqueia divulgar a loja ("required") e o que só melhora a operação. */
export function evaluateReadiness(f: ReadinessFacts) {
  const steps: ReadinessStep[] = [
    { id: 'profile', level: 'required', title: 'Conte sobre o seu negócio', description: 'Segmento, momento do negócio e telefone de contato. Leva um minuto.', href: '/painel/primeiros-passos#dados', complete: f.profileDone ?? true },
    { id: 'identity', level: 'required', title: 'Apresente sua marca', description: 'Defina o nome e envie a logo da loja.', href: '/painel/configuracoes', complete: Boolean(f.storeName.trim() && f.hasLogo) },
    { id: 'catalog', level: 'required', title: 'Prepare o catálogo', description: f.activeProducts + ' produtos publicados; ' + f.stockedProducts + ' com estoque disponível.', href: '/painel/produtos', complete: f.stockedProducts > 0 },
    { id: 'catalog-quality', level: 'required', title: 'Confira fotos e preços', description: f.activeProducts === 0 ? 'Publique ao menos um produto.' : f.productsWithoutImage + ' sem foto e ' + f.productsWithoutPrice + ' sem preço entre os publicados.', href: '/painel/produtos', complete: f.activeProducts > 0 && f.productsWithoutImage === 0 && f.productsWithoutPrice === 0 },
    { id: 'appearance', level: 'required', title: 'Personalize a vitrine', description: 'Monte a página inicial e publique o visual da sua loja.', href: '/painel/site', complete: f.storefrontCustomized },
    { id: 'shipping', level: 'required', title: 'Configure as entregas', description: f.shippingRules + ' regras de entrega ativas. Revise a cobertura e teste seu CEP.', href: '/painel/frete', complete: f.shippingRules > 0 },
    { id: 'policies', level: 'required', title: 'Publique as políticas', description: 'Trocas/devoluções e privacidade precisam estar publicadas em Páginas.', href: '/painel/paginas', complete: hasPolicy(f.publishedPageSlugs, ['troca', 'devolu']) && hasPolicy(f.publishedPageSlugs, ['privacidade']) },
    { id: 'payment', level: 'required', title: 'Confira o recebimento', description: f.confirmedPayments > 0 ? 'Há pagamento confirmado nesta loja.' : 'Valide o PIX e o retorno do pagamento com uma compra de teste antes de divulgar a loja.', href: '/painel/pagamentos', complete: f.paymentConfigured && f.webhookConfigured && f.callbackConfigured && f.confirmedPayments > 0 },
    { id: 'card', level: 'recommended', title: 'Habilite cartão de crédito', description: f.cardConfigured ? 'Cartão em até 12x ativo.' : 'Configure a Rede ou a chave pública do Mercado Pago.', href: '/painel/pagamentos', complete: f.cardConfigured },
    { id: 'carrier', level: 'recommended', title: 'Frete em tempo real', description: f.carrierConfigured ? 'Cotação por transportadora ativa.' : 'Conecte o SuperFrete ou o Melhor Envio para cotar Correios no checkout.', href: '/painel/frete', complete: f.carrierConfigured },
    { id: 'erp', level: 'recommended', title: 'Conecte o Bling', description: f.blingConnected ? 'Pedidos pagos seguem para o Bling.' : 'Conecte para enviar os pedidos e importar produtos.', href: '/painel/bling', complete: f.blingConnected },
    { id: 'domain', level: 'recommended', title: 'Domínio próprio', description: f.activeDomains > 0 ? 'Domínio ativo com HTTPS validado.' : 'Cadastre o endereço da sua marca e valide DNS e HTTPS.', href: '/painel/dominios', complete: f.activeDomains > 0 },
    { id: 'email', level: 'recommended', title: 'E-mails ao cliente', description: f.emailConfigured ? 'Provedor de e-mail configurado.' : 'Sem provedor, os e-mails de pedido só são simulados.', href: '/painel/emails', complete: f.emailConfigured },
    { id: 'contact', level: 'recommended', title: 'Canal de atendimento', description: f.whatsapp ? 'Botão de WhatsApp ativo.' : 'Informe o WhatsApp da loja.', href: '/painel/banners', complete: f.whatsapp },
  ];
  const required = steps.filter(step => step.level === 'required');
  // Para abrir a loja basta o recebimento estar configurado; a compra de teste só é possível com a loja aberta.
  const launchBlockers = required.filter(step => step.id === 'payment' ? !(f.paymentConfigured && f.webhookConfigured && f.callbackConfigured) : !step.complete).map(step => step.id);
  return {
    launchBlockers, steps, completed: steps.filter(step => step.complete).length, total: steps.length,
    ready: required.every(step => step.complete),
    pendingRequired: required.filter(step => !step.complete).map(step => step.id),
  };
}
