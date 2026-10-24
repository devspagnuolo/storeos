/** Variáveis de ambiente que a API lê. Serve para o painel mostrar o que está definido e o que o servidor tem mas o código ignora. */
export type EnvImportance = 'required' | 'recommended' | 'optional';
export type EnvVar = { name: string; group: string; importance: EnvImportance; description: string };

export const ENV_VARS: EnvVar[] = [
  { name: 'DATABASE_URL', group: 'Servidor', importance: 'required', description: 'Endereço do banco de dados.' },
  { name: 'JWT_ACCESS_SECRET', group: 'Servidor', importance: 'required', description: 'Segredo do login (também protege os tokens do Bling se INTEGRATIONS_KEY não existir).' },
  { name: 'WEB_ORIGIN', group: 'Servidor', importance: 'required', description: 'Endereço(s) da loja liberados para falar com a API (CORS).' },
  { name: 'API_PUBLIC_URL', group: 'Servidor', importance: 'recommended', description: 'Endereço público da API, usado nos retornos do Bling e do Mercado Pago.' },
  { name: 'PUBLIC_SITE_URL', group: 'Servidor', importance: 'recommended', description: 'Endereço público da loja, usado nos links dos e-mails (a menos que haja domínio próprio ativo).' },
  { name: 'STORE_BASE_DOMAIN', group: 'Domínio próprio', importance: 'optional', description: 'Domínio-base das lojas sem domínio próprio (ex.: lojas.suamarca.com.br → vivi.lojas.suamarca.com.br). Exige DNS curinga (*.domínio) apontando para a loja; defina o mesmo valor na API e na loja.' },
  { name: 'STOREOS_CNAME_TARGET', group: 'Domínio próprio', importance: 'optional', description: 'Destino do CNAME que o cliente aponta para a plataforma.' },
  { name: 'STOREOS_EDGE_IPS', group: 'Domínio próprio', importance: 'optional', description: 'IPs para domínio raiz (registro A), separados por vírgula.' },
  { name: 'INTEGRATIONS_KEY', group: 'Servidor', importance: 'optional', description: 'Chave que protege tokens de integrações; sem ela usa o segredo do login.' },
  { name: 'SWAGGER_ENABLED', group: 'Servidor', importance: 'optional', description: 'Liga a documentação técnica da API.' },
  { name: 'THROTTLE_DISABLED', group: 'Servidor', importance: 'optional', description: 'Desliga o limite de requisições (só para testes).' },
  { name: 'OUTBOX_WORKER', group: 'Servidor', importance: 'optional', description: '“off” desliga o envio de e-mails e as tarefas em segundo plano.' },
  { name: 'BOOTSTRAP_STORE_SLUG', group: 'Primeiro acesso', importance: 'optional', description: 'Cria a loja na primeira subida.' },
  { name: 'BOOTSTRAP_STORE_NAME', group: 'Primeiro acesso', importance: 'optional', description: 'Nome da loja criada na primeira subida.' },
  { name: 'BOOTSTRAP_OWNER_EMAIL', group: 'Primeiro acesso', importance: 'optional', description: 'E-mail do dono criado na primeira subida.' },
  { name: 'BOOTSTRAP_OWNER_NAME', group: 'Primeiro acesso', importance: 'optional', description: 'Nome do dono criado na primeira subida.' },
  { name: 'BOOTSTRAP_OWNER_PASSWORD', group: 'Primeiro acesso', importance: 'optional', description: 'Senha inicial do dono. Pode ser removida depois que a loja existe.' },
  { name: 'MERCADOPAGO_ACCESS_TOKEN', group: 'Pagamentos', importance: 'recommended', description: 'Credencial do Mercado Pago (PIX, boleto, cartão e reembolso).' },
  { name: 'MERCADOPAGO_WEBHOOK_SECRET', group: 'Pagamentos', importance: 'recommended', description: 'Segredo que confirma os avisos de pagamento do Mercado Pago.' },
  { name: 'MERCADOPAGO_PUBLIC_KEY', group: 'Pagamentos', importance: 'optional', description: 'Chave pública do Mercado Pago para cartão.' },
  { name: 'MERCADOPAGO_MAX_INSTALLMENTS', group: 'Pagamentos', importance: 'optional', description: 'Máximo de parcelas no cartão.' },
  { name: 'PIX_EXPIRATION_MINUTES', group: 'Pagamentos', importance: 'optional', description: 'Validade do PIX em minutos.' },
  { name: 'SIGNUP_CLEANUP_JOB', group: 'Cadastro', importance: 'optional', description: '“off” desliga a limpeza de cadastros cujo e-mail nunca foi confirmado (7 dias após o link expirar).' },
  { name: 'PAYMENT_EXPIRY_JOB', group: 'Pagamentos', importance: 'optional', description: '“off” desliga o cancelamento de pedidos não pagos.' },
  { name: 'SUPERFRETE_TOKEN', group: 'Frete', importance: 'recommended', description: 'Token do SuperFrete (cotação dos Correios).' },
  { name: 'SUPERFRETE_API_URL', group: 'Frete', importance: 'optional', description: 'Endereço da API do SuperFrete (padrão https://api.superfrete.com).' },
  { name: 'SUPERFRETE_SANDBOX', group: 'Frete', importance: 'optional', description: '“true” usa o ambiente de testes do SuperFrete.' },
  { name: 'SUPERFRETE_SERVICES', group: 'Frete', importance: 'optional', description: 'Serviços cotados no SuperFrete (padrão 1,2,17).' },
  { name: 'MELHOR_ENVIO_TOKEN', group: 'Frete', importance: 'optional', description: 'Token do Melhor Envio (alternativa ao SuperFrete).' },
  { name: 'MELHOR_ENVIO_SANDBOX', group: 'Frete', importance: 'optional', description: '“true” usa o ambiente de testes do Melhor Envio.' },
  { name: 'SHIPPING_ORIGIN_ZIP', group: 'Frete', importance: 'optional', description: 'CEP de origem de reserva. O CEP de cada loja é cadastrado em Frete.' },
  { name: 'RESEND_API_KEY', group: 'E-mail', importance: 'recommended', description: 'Chave do Resend; sem ela os e-mails ficam só simulados.' },
  { name: 'MAIL_FROM', group: 'E-mail', importance: 'recommended', description: 'Remetente dos e-mails (domínio verificado no Resend).' },
  { name: 'ABANDONED_CART_DELAY_MINUTES', group: 'E-mail', importance: 'optional', description: 'Minutos até lembrar de um carrinho parado (padrão 60).' },
  { name: 'BLING_CLIENT_ID', group: 'Bling', importance: 'optional', description: 'ID do aplicativo no Bling.' },
  { name: 'BLING_CLIENT_SECRET', group: 'Bling', importance: 'optional', description: 'Segredo do aplicativo no Bling.' },
  { name: 'BLING_WORKER', group: 'Bling', importance: 'optional', description: '“off” pausa as tarefas automáticas do Bling.' },
  { name: 'STOREOS_R2_ACCOUNT_ID', group: 'Imagens', importance: 'optional', description: 'Conta do armazenamento de imagens (Cloudflare R2).' },
  { name: 'STOREOS_R2_ACCESS_KEY_ID', group: 'Imagens', importance: 'optional', description: 'Chave de acesso do R2.' },
  { name: 'STOREOS_R2_SECRET_ACCESS_KEY', group: 'Imagens', importance: 'optional', description: 'Chave secreta do R2.' },
  { name: 'STOREOS_R2_BUCKET', group: 'Imagens', importance: 'optional', description: 'Nome do bucket do R2.' },
  { name: 'STOREOS_R2_PUBLIC_URL', group: 'Imagens', importance: 'optional', description: 'Endereço público das imagens no R2.' },
  { name: 'PHOTOROOM_API_KEY', group: 'Imagens', importance: 'optional', description: 'Chave do Photoroom para trocar o fundo das fotos de produto ("sandbox_…" é de teste, com marca d’água).' },
];

/** Presentes em qualquer servidor (Render, Node, sistema); não são "cadastradas" por ninguém e não entram no aviso. */
const SYSTEM = /^(RENDER|IS_PULL_REQUEST|NODE_|NPM_|npm_|PNPM_|PATH$|HOME$|PWD$|OLDPWD$|SHLVL$|HOSTNAME$|LANG$|LC_|LOGNAME$|USER$|SHELL$|TERM|TZ$|PORT$|_$|INIT_CWD$|COREPACK_|YARN_|PLAYWRIGHT_|CI$|DEBIAN_|GPG_|PS1$|NVM_|BUN_|FORCE_COLOR$|NO_COLOR$|XDG_)/;

/** Distância de edição, para sugerir o nome certo quando alguém digitou errado. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Variáveis conhecidas do código e se estão definidas, mais as definidas no servidor que o código não lê (só os nomes, nunca os valores). */
export function environmentReport(env: NodeJS.ProcessEnv, known: EnvVar[] = ENV_VARS) {
  const names = new Set(known.map(v => v.name));
  const variables = known.map(v => ({ ...v, set: Boolean(env[v.name]?.trim()) }));
  const unrecognized = Object.keys(env)
    .filter(name => !names.has(name) && !SYSTEM.test(name))
    .sort()
    .map(name => {
      const upper = name.toUpperCase();
      const closest = known.map(v => ({ name: v.name, d: distance(upper, v.name) })).sort((x, y) => x.d - y.d)[0];
      return { name, suggestion: closest && closest.d <= Math.max(2, Math.floor(closest.name.length / 6)) ? closest.name : null };
    });
  return { variables, unrecognized };
}
