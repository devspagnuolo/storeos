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
- Leitura de situações para exibir no painel a situação configurada no Bling.
- Leitura de NF-e/documentos fiscais para consultar situação e documentos.
- Escrita/geração de NF-e somente se o mecanismo fiscal por API for testado e habilitado pelo lojista após validar o perfil fiscal com seu contador.

Alterar permissões do aplicativo pode exigir que a loja autorize a conexão novamente.

## Webhooks no Bling

Na aba Webhooks, cadastre um servidor com alias `STOREOS` e URL `{API_PUBLIC_URL}/api/v1/bling/webhook`. Ative, conforme escopos liberados, Pedido de venda (criado/atualizado) e Nota fiscal (criada/atualizada), com a versão do payload suportada pelo adaptador.

O endpoint valida o cabeçalho `X-Bling-Signature-256` usando HMAC-SHA256 sobre o corpo HTTP original e o Client Secret do aplicativo. Não remova essa validação nem exponha o segredo em páginas públicas.

### Requisito de entrega

O Bling considera entrega bem-sucedida uma resposta HTTP 2xx em até 5 segundos, pode repetir eventos por até 3 dias e não garante ordenação. Por isso a versão de produção deve persistir evento com unicidade por `eventId`, responder depois da persistência e processar em worker idempotente. A implementação de pedido neste branch ainda faz consultas ao Bling dentro do processamento síncrono do webhook; antes de tráfego real relevante, mover esse trabalho para uma fila/outbox e confirmar o ACK rápido em teste de carga.

## Identificação e fluxo dos pedidos

O número local STOREOS é enviado no campo `numeroLoja` do Bling. O ID interno e o número do pedido de venda Bling ficam armazenados separadamente do número de exibição STOREOS. Em caso de timeout, a integração consulta por referência STOREOS antes de criar de novo para evitar duplicação.

Todos os pedidos da loja conectada entram na fila, inclusive os que aguardam pagamento. O pedido pode existir no ERP sem pagamento confirmado e sem documento fiscal. Situação do pedido, pagamento, emissão fiscal e expedição são estados separados. Como as situações do Bling podem ser personalizadas por empresa, não se traduzem automaticamente para o ciclo local sem um mapeamento explícito.

## NF-e e vínculo com o pedido de venda

O Bling documenta gerar NF-e a partir de pedido de venda, reaproveitando os dados da venda. Portanto, o fluxo de integração é: venda STOREOS → venda no Bling com referência STOREOS → documento gerado a partir dessa venda no Bling → autorização/retorno → atualização do pedido STOREOS. Não criar uma nota fiscal avulsa sem verificar que a API mantém o vínculo com a venda e o número externo.

Antes de automatizar, validar a operação atual da API em ambiente de homologação com pedido de venda e confirmar que o evento/consulta da nota permite localizar a venda original sem ambiguidade. A documentação do Bling diferencia cadastro/geração da nota e envio para autorização SEFAZ; sucesso HTTP não significa autorização fiscal.

A emissão automática deve ficar desativada por padrão até o lojista completar e confirmar o checklist fiscal. A integração não define nem inventa natureza de operação, CFOP, CST/CSOSN, NCM, alíquota, série ou regime tributário. Esses dados e a aplicabilidade da emissão devem estar configurados no Bling e revisados pelo contador.

### Retorno fiscal que deve estar disponível no painel

- ID remoto do documento e ID/número do pedido de venda no Bling.
- Modelo/tipo, série, número, chave de acesso e datas.
- Estado do Bling e situação de autorização/rejeição/cancelamento SEFAZ.
- Código/motivo de rejeição, tentativas e próximo reprocessamento, sem conteúdo sensível nos logs.
- Referências protegidas ao XML e DANFE, mostradas ao cliente apenas após autorização conforme política da loja.
- Ações auditadas para consultar, tentar novamente ou encaminhar a correção; nunca emitir uma segunda nota ativa por clique repetido.

Não converter pedido em “faturado” com base apenas em solicitação enviada ou documento salvo como rascunho: aguardar confirmação de autorização apropriada e reconciliar eventos fora de ordem com a API.

## Teste antes de produção

1. Em ambiente de teste, criar pedido STOREOS pendente e confirmar que ele é enviado uma vez, com ambos os números distintos.
2. Repetir webhook de pedido e de NF-e; não deve duplicar venda, documento, notificação ou baixa.
3. Gerar documento a partir da venda Bling em homologação, acompanhar rejeição/sucesso e confirmar o vínculo.
4. Verificar retorno de situação, chave e arquivos sem expor credenciais nem links públicos permanentes.
5. Medir ACK de webhook abaixo de 5 segundos, reiniciar worker no meio de um evento, validar retry/DLQ/reprocessamento e reconciliar com consulta ao Bling.
6. Habilitar produção somente depois da revisão fiscal, testes e confirmação explícita do lojista.
