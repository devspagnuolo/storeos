export type Facts = {
  apiPublicUrl?: string; webOrigin?: string; dbOk: boolean;
  outboxPending: number; outboxOldestMinutes: number | null;
  mp: { token: boolean; webhookSecret: boolean; publicKey: boolean; ping: 'ok' | 'unauthorized' | 'error' | 'skipped' };
  carrier: { enabled: boolean; provider?: string; originZip: string | null };
  shippingRules: number;
  email: { resend: boolean; from: boolean };
  bling: { appConfigured: boolean; connected: boolean; lastError: string | null; tokenExpired: boolean; companyLinked: boolean; failedOrders: number };
  failedPayments24h: number;
};

export type Check = { id: string; area: 'Servidor' | 'Pagamentos' | 'Frete' | 'E-mail' | 'Bling' | 'Operação'; title: string; status: 'ok' | 'warn' | 'fail' | 'off' | 'manual'; detail: string; hint?: string };

const https = (value?: string) => Boolean(value && /^https:\/\//.test(value.split(',')[0].trim()));

/** Transforma medições do ambiente em verificações legíveis. Puro: toda a rede e o banco ficam no serviço. */
export function buildChecks(f: Facts): Check[] {
  const checks: Check[] = [];
  const add = (check: Check) => checks.push(check);
  add({ id: 'db', area: 'Servidor', title: 'Banco de dados', status: f.dbOk ? 'ok' : 'fail', detail: f.dbOk ? 'Respondendo.' : 'Sem resposta do banco.' });
  add({ id: 'api-url', area: 'Servidor', title: 'Endereço público da API (API_PUBLIC_URL)', status: https(f.apiPublicUrl) ? 'ok' : 'fail', detail: https(f.apiPublicUrl) ? f.apiPublicUrl! : 'Não definido ou sem HTTPS.', hint: 'Webhooks de pagamento e do Bling precisam desse endereço.' });
  add({ id: 'web-origin', area: 'Servidor', title: 'Origem da loja (WEB_ORIGIN)', status: https(f.webOrigin) ? 'ok' : 'warn', detail: f.webOrigin ?? 'Não definido.', hint: 'Usado pelo retorno do Bling e pelas regras de CORS.' });
  add({ id: 'backups', area: 'Servidor', title: 'Backups do banco', status: 'manual', detail: 'O sistema não consegue verificar isto sozinho.', hint: 'No Render, confirme o plano pago do Postgres e os backups/point-in-time recovery do banco. Teste uma restauração antes de divulgar.' });

  const stale = f.outboxOldestMinutes !== null && f.outboxOldestMinutes > 10;
  add({ id: 'outbox', area: 'Operação', title: 'Fila de eventos (e-mails e integrações)', status: stale ? 'fail' : f.outboxPending > 0 ? 'warn' : 'ok', detail: f.outboxPending === 0 ? 'Fila vazia.' : `${f.outboxPending} evento(s) pendente(s); o mais antigo espera há ${f.outboxOldestMinutes} min.`, hint: stale ? 'Eventos parados há mais de 10 minutos: o processador de fila pode estar fora do ar.' : undefined });
  add({ id: 'payment-failures', area: 'Operação', title: 'Pagamentos recusados nas últimas 24 h', status: f.failedPayments24h >= 10 ? 'warn' : 'ok', detail: `${f.failedPayments24h} pagamento(s) recusado(s) ou cancelado(s).` });

  const mpOn = f.mp.token;
  add({ id: 'mp-token', area: 'Pagamentos', title: 'Mercado Pago (PIX e boleto)', status: !mpOn ? 'off' : f.mp.ping === 'ok' ? 'ok' : f.mp.ping === 'unauthorized' ? 'fail' : f.mp.ping === 'error' ? 'warn' : 'ok', detail: !mpOn ? 'Sem token: PIX e boleto ficam manuais.' : f.mp.ping === 'ok' ? 'Credencial aceita pelo Mercado Pago.' : f.mp.ping === 'unauthorized' ? 'O Mercado Pago recusou o token.' : f.mp.ping === 'error' ? 'Não foi possível consultar o Mercado Pago agora.' : 'Token configurado.', hint: f.mp.ping === 'unauthorized' ? 'Gere um novo Access Token e atualize MERCADOPAGO_ACCESS_TOKEN.' : undefined });
  if (mpOn) add({ id: 'mp-webhook', area: 'Pagamentos', title: 'Webhook do Mercado Pago', status: f.mp.webhookSecret && https(f.apiPublicUrl) ? 'ok' : 'fail', detail: f.mp.webhookSecret ? 'Segredo configurado.' : 'MERCADOPAGO_WEBHOOK_SECRET ausente: confirmações de pagamento serão recusadas.', hint: `Cadastre ${f.apiPublicUrl ?? 'API_PUBLIC_URL'}/api/v1/payments/webhooks/mercadopago no painel do Mercado Pago.` });
  add({ id: 'card', area: 'Pagamentos', title: 'Cartão de crédito', status: mpOn && f.mp.publicKey ? 'ok' : 'off', detail: mpOn && f.mp.publicKey ? 'Cartão via Mercado Pago.' : 'Sem a chave pública do Mercado Pago, o cartão fica desativado.', hint: mpOn && !f.mp.publicKey ? 'Defina MERCADOPAGO_PUBLIC_KEY.' : undefined });

  add({ id: 'carrier', area: 'Frete', title: 'Cotação em transportadora', status: f.carrier.enabled ? 'ok' : f.shippingRules > 0 ? 'off' : 'fail', detail: f.carrier.enabled ? `${f.carrier.provider ?? 'Transportadora'} ativa; CEP de origem ${f.carrier.originZip}.` : f.shippingRules > 0 ? 'Sem transportadora; usando só as regras de entrega da loja.' : 'Sem regras de entrega nem transportadora: o checkout não consegue calcular frete.', hint: f.carrier.enabled ? 'Use "Testar cotação" abaixo com um CEP real.' : 'Defina SUPERFRETE_TOKEN (ou MELHOR_ENVIO_TOKEN) no servidor e cadastre o CEP de origem em Frete.' });
  add({ id: 'email', area: 'E-mail', title: 'E-mails ao cliente', status: f.email.resend ? (f.email.from ? 'ok' : 'warn') : 'warn', detail: f.email.resend ? (f.email.from ? 'Resend ativo.' : 'Resend ativo, mas sem MAIL_FROM: o remetente padrão é um endereço de exemplo.') : 'Sem RESEND_API_KEY: os e-mails são apenas simulados.', hint: 'Configure RESEND_API_KEY e MAIL_FROM com um domínio verificado.' });

  if (!f.bling.appConfigured) add({ id: 'bling', area: 'Bling', title: 'Bling (ERP)', status: 'off', detail: 'Aplicativo não configurado (BLING_CLIENT_ID/SECRET).' });
  else if (!f.bling.connected) add({ id: 'bling', area: 'Bling', title: 'Bling (ERP)', status: 'warn', detail: 'Aplicativo configurado, mas a conta não está conectada.', hint: 'Conecte em Bling (ERP).' });
  else {
    const bad = f.bling.lastError || f.bling.tokenExpired;
    add({ id: 'bling', area: 'Bling', title: 'Bling (ERP)', status: bad ? 'fail' : f.bling.failedOrders > 0 ? 'warn' : 'ok', detail: f.bling.lastError ? `Último erro: ${f.bling.lastError}` : f.bling.tokenExpired ? 'A autorização expirou.' : f.bling.failedOrders > 0 ? `${f.bling.failedOrders} pedido(s) com erro de envio.` : 'Conectado e sem pedidos com erro.', hint: bad ? 'Reconecte o Bling.' : f.bling.failedOrders > 0 ? 'Veja os erros em Bling (ERP) e reenvie.' : undefined });
    if (!f.bling.companyLinked) add({ id: 'bling-webhook', area: 'Bling', title: 'Webhooks do Bling', status: 'warn', detail: 'Empresa não vinculada: eventos do Bling não serão roteados.', hint: 'Reconecte para conceder a permissão de leitura da empresa.' });
  }
  return checks;
}

export const summarize = (checks: Check[]) => ({
  fail: checks.filter(c => c.status === 'fail').length,
  warn: checks.filter(c => c.status === 'warn').length,
  ok: checks.filter(c => c.status === 'ok').length,
});
