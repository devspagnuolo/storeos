# Integração Bling do STOREOS

## Variáveis no Render

Configure no serviço API:

- `BLING_CLIENT_ID`: Client ID do aplicativo Bling.
- `BLING_CLIENT_SECRET`: Client Secret do mesmo aplicativo; manter como segredo.
- `API_PUBLIC_URL`: URL pública da API, sem barra final.

O callback OAuth é `{API_PUBLIC_URL}/api/v1/bling/callback`. O servidor de webhooks é `{API_PUBLIC_URL}/api/v1/bling/webhook`.

## Permissões necessárias no aplicativo Bling

Conceda somente as permissões usadas pela integração:

- Leitura de produtos, categorias e estoque para importar o catálogo.
- Leitura e gravação de contatos para localizar/criar o cliente.
- Leitura e gravação de pedidos de venda para consultar/criar o pedido no ERP.
- Leitura de dados da empresa para identificar com segurança qual conexão STOREOS recebeu o webhook.
- Leitura de situações para exibir no painel o nome da situação configurada no Bling.

Alterar permissões do aplicativo pode exigir que a loja autorize a conexão novamente.

## Webhooks no Bling

Na aba Webhooks, cadastre um servidor com alias `STOREOS` e URL `{API_PUBLIC_URL}/api/v1/bling/webhook`. Ative o recurso Pedido de venda, ações Criado e Atualizado, payload versão 1.

O endpoint valida o cabeçalho `X-Bling-Signature-256` usando HMAC-SHA256 sobre o corpo HTTP original e o Client Secret do aplicativo. Não remova essa validação nem exponha o segredo em páginas públicas.

## Identificação e fluxo dos pedidos

O número local STOREOS é enviado no campo `numeroLoja` do Bling. O identificador interno do Bling e o número de venda do Bling são armazenados separadamente. Em caso de timeout, a integração consulta `numeroLoja` antes de criar de novo para evitar pedidos duplicados.

Todos os pedidos existentes e novos da loja conectada entram na fila, inclusive os que aguardam pagamento. O painel apresenta o número e a situação do Bling ao lado do pedido STOREOS. Como as situações do Bling podem ser personalizadas por empresa, a situação de origem é exibida separadamente; não se traduz automaticamente para o ciclo local sem um mapeamento explícito por loja.
