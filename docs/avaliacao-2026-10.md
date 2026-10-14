# Avaliação técnica do StoreOS — outubro/2026

Avaliação do estado do repositório em `main` (commit `09a7a59`), com o que foi verificado rodando `pnpm install`, `pnpm build`, `pnpm test`, `pnpm lint` e as migrations contra um PostgreSQL 16 local.

## Resumo

A fundação é boa: monorepo pnpm organizado, NestJS 11 + Prisma com valores monetários em `Decimal(14,2)`, isolamento por `storeId` nas entidades, outbox transacional desde o primeiro dia, Argon2 para senhas, Helmet, `ValidationPipe` com whitelist e deploy declarativo no Render. A documentação de arquitetura (DDD, CQRS, portas para ERP/pagamento/frete, LGPD) é madura para a fase.

O problema é que a execução ainda está muito atrás do desenho: a loja não vende. Não há categorias, página de produto, carrinho funcional, checkout, pagamento nem frete; a vitrine aponta para cinco rotas que não existem; o CI está vermelho em todo push; e há falhas de validação no fluxo de pedidos que permitem pedidos com valor negativo.

## O que foi verificado

| Item | Resultado |
|---|---|
| `pnpm build` | passa (API e web) |
| `pnpm test` | **falha**: a API roda `jest` sem nenhum teste (`No tests found, exiting with code 1`), então o CI fica vermelho em todo push |
| `pnpm lint` | **falha**: a API não tem configuração do ESLint 9 |
| Migrations | aplicam limpo num Postgres 16 vazio (18 tabelas) |
| Rotas da vitrine | `/categorias`, `/produto/[slug]`, `/busca`, `/blog` e `/conta` são linkadas mas retornam 404 |
| Dados | não há seed; a vitrine busca a loja `demo`, que não existe, então o catálogo aparece vazio |

## Arquitetura

- O monólito modular está declarado, mas os módulos ainda são uma camada só (controller + service com Prisma direto). Tudo bem nesta fase; o importante é não deixar a regra de negócio crescer dentro dos controllers.
- `Role` e `Permission` são globais, não por loja. Para SaaS multiloja, uma loja não pode editar papéis de outra; o papel precisa ter `storeId` (ou papéis de sistema imutáveis + papéis por loja).
- O ERD cita `Category`, mas o schema não tem essa tabela.
- `Inventory` tem `@@unique([storeId, productId, variantId])` com `variantId` anulável. No Postgres, `NULL` não colide, então é possível criar dois saldos para o mesmo produto sem variação.
- O outbox grava eventos, mas não há worker que publique; RabbitMQ e Meilisearch estão no `docker-compose` mas não são usados pelo código.

## Segurança

| Severidade | Achado | Onde |
|---|---|---|
| Alta | `quantity` do pedido aceita 0 ou negativo, gerando pedido com total negativo | `apps/api/src/modules/orders/orders.controller.ts` |
| Alta | Itens repetidos no pedido (mesmo `productId` duas vezes) são rejeitados por engano, e `customerId` não é verificado como cliente da mesma loja, permitindo referenciar cliente de outro tenant | `orders.service.ts` |
| Média | Se `JWT_ACCESS_SECRET` faltar, a API sobe com um segredo fixo conhecido em vez de falhar | `auth.module.ts` |
| Média | Nenhum endpoint checa permissão (RBAC); qualquer usuário autenticado da loja cria produtos e pedidos | guards |
| Média | Sem rate limit no login (força bruta) | `auth.controller.ts` |
| Baixa | O `catch` de criação de produto transforma qualquer erro (inclusive banco fora do ar) em "SKU já existe" | `catalog.service.ts` |
| Baixa | Totais calculados com `Number` (ponto flutuante) antes de gravar em `Decimal` | `orders.service.ts` |
| Baixa | Número do pedido baseado em `Date.now()` pode colidir em pedidos simultâneos | `orders.service.ts` |
| Baixa | Swagger exposto publicamente em produção | `main.ts` |

## Riscos de operação

- Render free plan: a API "dorme" e o Postgres free expira; ok para demo, não para vender.
- Deploy automático a cada commit em `main` sem CI verde como pré-requisito.
- Sem observabilidade (logs estruturados, métricas, erros), backup testado ou runbooks.

## Plano priorizado

**Agora (este ciclo, implementado em PR rascunho):**
1. CI verde: testes de verdade na API, lint configurado, Postgres no CI.
2. Correções de segurança e integridade no pedido (quantidade, itens repetidos, cliente de outra loja, cálculo em `Decimal`, número de pedido), segredo JWT obrigatório em produção, erro correto na criação de produto.
3. Categorias (tabela, migration, API) e seed da loja `demo` com produtos, imagens e estoque.
4. Vitrine completa: página de produto, categorias, busca, carrinho persistente e conta; remover o link de blog até existir CMS.
5. Base de checkout: checkout guest público que valida estoque, reserva saldo, cria cliente e pedido e gera cobrança por uma porta `PaymentProvider` com um adaptador manual (PIX/boleto) para desenvolvimento.

**Próximo (para começar a vender):**
6. Gateway de pagamento real (Mercado Pago ou Pagar.me) com PIX e cartão tokenizado, webhooks idempotentes e conciliação; confirmação de pagamento baixa o estoque, e pedidos não pagos liberam a reserva após um prazo (hoje a reserva fica presa até ação manual).
7. Frete por CEP (Melhor Envio) e cálculo no carrinho.
8. Painel administrativo real: login, CRUD de produtos/categorias, upload de imagens (R2/S3), lista e timeline de pedidos.
9. RBAC por loja + rate limit + refresh token rotacionado.
10. E-mails transacionais (pedido criado, pago, enviado).

**Depois (diferenciais de mercado):**
11. Integração Bling (produtos, estoque, pedidos, NF-e) via worker do outbox.
12. Busca com Meilisearch, SEO técnico (sitemap, dados estruturados), performance (ISR/cache).
13. Cupons, recuperação de carrinho abandonado, avaliações de produto.
14. Observabilidade, backups, plano pago no Render e checklist de go-live LGPD.
