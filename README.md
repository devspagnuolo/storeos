# STOREOS

Plataforma de e-commerce SaaS, multiempresa e white-label. A base é um **modular monolith** com limites de DDD, CQRS nos fluxos de escrita/leitura e eventos de integração. Isso permite evolução gradual para serviços independentes sem quebrar contratos de domínio.

## Início rápido

1. Copie `.env.example` para `.env` e substitua todos os segredos.
2. Execute `docker compose up -d`.
3. Execute `pnpm install`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed` e `pnpm dev`.
4. Storefront: `http://localhost:3000`; API e Swagger: `http://localhost:3001/api/docs`.

O seed cria a loja `demo` com 4 categorias, 12 produtos com estoque e o usuário `admin@demo.storeos.dev` (senha `demo-admin-123`, ou `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`). Ele é idempotente e não sobrescreve estoque já existente.

## Testes

- `pnpm lint`, `pnpm build` e `pnpm test` (unitários da API e da web) não precisam de banco.
- `pnpm test:int` sobe a API contra o Postgres de `DATABASE_URL` e testa catálogo, checkout, reserva de estoque e RBAC. O CI roda tudo com um Postgres de serviço.

## Fluxo de compra

Vitrine (`/`, `/categorias`, `/categorias/[slug]`, `/busca`, `/produto/[slug]`) → carrinho persistente no navegador (`/carrinho`) → checkout guest (`/checkout`). O `POST /api/v1/checkout` valida preço e estoque no servidor, reserva o saldo de forma atômica, cria cliente, pedido e cobrança pela porta `PaymentProvider`. Hoje o adaptador é manual (PIX/boleto confirmados pela loja); gateways reais entram como novos adaptadores.

## Estrutura

```
apps/api       NestJS: API, domínios, jobs e integrações
apps/web       Next.js: storefront e administração
packages/contracts  contratos de eventos/DTOs sem dependência de framework
docs           ADRs, ERD, roadmap e backlog
infra          manifestos Kubernetes e CI/CD
```

## Decisões essenciais

- Isolamento obrigatório por `storeId` em toda entidade de negócio.
- Tokens curtos, refresh tokens rotacionados e RBAC por permissão.
- Outbox transacional para publicação idempotente em RabbitMQ.
- Dados pessoais minimizados, auditáveis e prontos para exportação/anonimização LGPD.
- Segredos somente por variáveis/secret manager; nunca em código ou imagens Docker.

Consulte `docs/architecture.md`, `docs/erd.md`, `docs/roadmap.md` e `docs/backlog.md`.
