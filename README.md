# STOREOS

Plataforma de e-commerce SaaS, multiempresa e white-label. A base é um **modular monolith** com limites de DDD, CQRS nos fluxos de escrita/leitura e eventos de integração. Isso permite evolução gradual para serviços independentes sem quebrar contratos de domínio.

## Início rápido

1. Copie `.env.example` para `.env` e substitua todos os segredos.
2. Execute `docker compose up -d`.
3. Execute `pnpm install`, `pnpm db:generate`, `pnpm db:migrate` e `pnpm dev`.
4. Storefront: `http://localhost:3000`; API e Swagger: `http://localhost:3001/api/docs`.

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
