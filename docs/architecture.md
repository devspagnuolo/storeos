# Arquitetura STOREOS

## Contextos delimitados

| Núcleo | Responsabilidade | Eventos principais |
|---|---|---|
| Identity | usuários, MFA, papéis e permissões | `user.invited` |
| Catalog | produto, categoria, marca, mídia e SEO | `product.published` |
| Inventory | saldo, reserva e reposição | `inventory.reserved` |
| Commerce | carrinho, checkout, pedidos e devoluções | `order.created`, `order.paid` |
| Customer | CRM, endereços, consentimento e LTV | `customer.updated` |
| Fulfillment | frete, etiqueta e rastreio | `shipment.updated` |
| Integrations | ERP, pagamentos e logística via providers | `integration.sync-requested` |
| Engagement | CMS, cupons, loyalty e automação | `campaign.triggered` |

## Regras de arquitetura

- Cada módulo possui camada de `domain`, `application`, `infrastructure` e `presentation`; controllers não carregam regra de negócio.
- Commands alteram estado; queries retornam projeções sem efeitos colaterais. Leituras de alto volume migram para read models.
- Uma transação que altera um agregado também grava um `OutboxEvent`. Um worker publica a mensagem, incrementa tentativas e suporta DLQ/reprocessamento.
- Chamadas externas são feitas por portas (`PaymentProvider`, `ErpProvider`, `ShippingProvider`). Bling é o primeiro adaptador.
- Toda consulta empresarial exige `storeId`; RLS no PostgreSQL é uma etapa obrigatória antes da abertura multi-tenant.

## Segurança e LGPD

- Access token de 15 min, refresh token rotacionado, hash Argon2id, MFA TOTP e sessões revogáveis.
- RBAC por permissões (`catalog.write`, `orders.read`, etc.) e trilha em `AuditLog`.
- PII sensível é criptografada por envelope encryption; chaves ficam em KMS. Logs jamais recebem dados de cartão, senha ou documento puro.
- Rate limit em borda e login, validação Zod/class-validator, headers Helmet, CORS restritivo, CSRF em fluxos cookie e queries parametrizadas Prisma.

## Evolução SaaS e Marketplace

Store é o tenant. Custom domain, tema e configurações residem no tenant. O modelo Marketplace adiciona `Seller`, `Offer`, split de pedidos e ledger sem alterar o pedido base. Microserviços só são extraídos por pressão de escala (busca, notificações, integração e checkout são os primeiros candidatos).
