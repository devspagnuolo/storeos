# STOREOS como canal de e-commerce no Bling

## Modelo correto

- STOREOS é a loja virtual/canal de venda, como a Nuvemshop.
- Bling é o ERP principal: recebe os pedidos de venda e é a fonte operacional de produtos, preços, estoque, faturamento e dados fiscais.
- No cadastro do aplicativo Bling, escolha a categoria **E-commerce** quando disponível. A categoria é uma classificação comercial para descoberta do app; não muda OAuth, escopos ou permissões da API. “ERP” descreve o papel do Bling, não o tipo de produto que a STOREOS integra.
- Para uma instalação própria, mantenha o aplicativo privado. Publicação na Central de Extensões é uma etapa separada de distribuição para terceiros.

As telas da integração Nuvemshop no Bling são uma boa referência de jornada: autenticação, canal de vendas, importação de catálogo, mapeamento de situação, rastreio, faturamento e aliases de pagamento. Não copie Store ID ou Access Token da Nuvemshop para a STOREOS; são credenciais de outra plataforma. A STOREOS conecta usando o fluxo OAuth do Bling.

## Cadastro do app no Bling

1. Acesse Central de Extensões → Área do Integrador → Criar aplicativo.
2. Use o nome “STOREOS — Loja virtual”, categoria E-commerce (se disponível), descrição clara e visibilidade privada para a instalação própria.
3. Configure o link de redirecionamento que o painel da STOREOS exibe. No Render, a URL da API deve terminar em `/api/v1/bling/callback`.
4. Selecione apenas os escopos usados: leitura de dados básicos da empresa; leitura de produtos, categorias e estoque; leitura/criação de contatos; leitura/criação de pedidos de venda. Adicione escopos de NF-e somente se a empresa for usar esse recurso.
5. Salve o app e cadastre `BLING_CLIENT_ID` e `BLING_CLIENT_SECRET` como secrets do serviço API no Render. Nunca publique essas credenciais no navegador ou no GitHub.
6. Conecte pelo painel STOREOS. O OAuth é feito no servidor; a API cifra os tokens por loja. Se alterar os escopos depois, o Bling revoga as autorizações anteriores; reconecte a loja.

## Webhook que pode ser habilitado agora

Cadastre um servidor com o alias STOREOS e URL `https://storeos-nexo-api.onrender.com/api/v1/bling/webhook` (ou o valor mostrado no painel). Configure:

- Recurso: Pedido de Venda.
- Ações: criado e atualizado.
- Versão: 1.

O endpoint valida `X-Bling-Signature-256` usando o Client Secret, persiste o `eventId` com unicidade e retorna 2xx após gravar na caixa de entrada; o worker consulta/processa o evento em segundo plano. Duplicatas recebem 2xx e não repetem a atualização. A situação remota é exibida junto do pedido, sem assumir que as situações configuráveis da conta Bling correspondem automaticamente aos estados internos da STOREOS.

**Não habilite ainda webhooks de produto, estoque ou nota fiscal.** Nesta versão o catálogo é importado sob demanda pelo painel, e o estado da NF-e é reconciliado pelo worker fiscal. A API reconhece os tipos de evento de pedido indicados acima; outros recursos não devem ser configurados como se estivessem sincronizados.

## Direção de dados e limites atuais

| Dado | Fonte principal | Comportamento atual |
|---|---|---|
| Produto, variação, preço, estoque, imagens | Bling | Importação sob demanda por SKU. Reimportar para atualizar; não é sincronização contínua ainda. |
| Pedido da loja | STOREOS | Cada pedido entra na fila do Bling, inclusive aguardando pagamento. O campo `numeroLoja` guarda o número STOREOS; ID e número do pedido Bling ficam em campos separados. |
| Situação do pedido no ERP | Bling | Webhook atualiza e mostra situação/ID no painel. Mapeamento configurável para estados locais ainda não está habilitado; não confundir os dois ciclos. |
| Nota fiscal | Bling/SEFAZ | Gerada a partir do pedido de venda Bling. Emissão automática vem desligada; habilite apenas depois de homologação e revisão do contador. |
| Rastreio e aliases de pagamento | Provedor/logística e configuração da loja | Configuração equivalente às regras mostradas na integração Nuvemshop está em evolução; não presumir sincronização automática por canal. |

Antes de ligar a operação fiscal, faça um pedido de teste, confirme cliente/produtos/valores e o `numeroLoja`, emita em ambiente apropriado do Bling, valide autorização SEFAZ e confira a volta do número e chave fiscal. Não use emissão automática até validar natureza, série, certificado e tributação com o contador.

## Referências oficiais

- [Bling — cadastro de aplicativos, OAuth e escopos](https://developer.bling.com.br/aplicativos)
- [Bling — webhooks: HMAC, idempotência, eventos fora de ordem e ACK em até 5 segundos](https://developer.bling.com.br/webhooks)
- [Nuvemshop — guia de integração ERP](https://dev.nuvemshop.com.br/docs/erp-guide/overview)
- [Nuvemshop — autenticação OAuth](https://dev.nuvemshop.com.br/docs/erp-guide/authentication)
- [Nuvemshop — gestão e identificadores de pedidos](https://dev.nuvemshop.com.br/docs/erp-guide/orders/overview)
- [Nuvemshop — webhooks](https://dev.nuvemshop.com.br/docs/erp-guide/orders/webhooks)
- [Nuvemshop — catálogo, variações e estoque](https://dev.nuvemshop.com.br/docs/erp-guide/catalog/products)

A integração Nuvemshop serve como referência de experiência e contrato de e-commerce. O STOREOS não se conecta à API Nuvemshop nessa configuração: ele próprio é o canal que conversa com o Bling.
