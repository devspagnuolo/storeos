# Arquitetura STOREOS

## Contextos delimitados

| Núcleo | Responsabilidade | Eventos principais |
|---|---|---|
| Identity | usuários, MFA, papéis e permissões | `user.invited` |
| Catalog | produto, categoria, marca, mídia e SEO | `product.published` |
| Inventory | saldo, reserva e reposição | `inventory.reserved` |
| Commerce / OMS | carrinho, checkout, pedidos, atendimento, RMA e timeline | `order.created`, `order.paid`, `return.requested` |
| Customer / CRM | perfil, endereço, consentimento, segmento e LTV | `customer.updated` |
| Fulfillment | expedição, etiquetas, transportadoras e rastreio | `shipment.updated` |
| Fiscal | ciclo fiscal no ERP, vínculo NF-e e estado SEFAZ; não calcula tributação | `invoice.requested`, `invoice.updated` |
| Integrations | ERP, pagamentos, canais e logística via providers | `integration.sync-requested` |
| Storefront / CMS | tema, blocos, conteúdo, domínios e publicação | `storefront.published` |
| Engagement | cupons, loyalty, notificações e automação | `campaign.triggered` |
| Analytics | projeções e métricas com definições versionadas | `analytics.projection-updated` |

## Regras de arquitetura

- Cada módulo possui camada de domain, application, infrastructure e presentation; controllers não carregam regra de negócio.
- Commands alteram estado; queries retornam projeções sem efeitos colaterais. Leituras de alto volume migram para read models.
- Uma transação que altera um agregado também grava um OutboxEvent. Workers processam eventos com idempotência, retry limitado, dead-letter e reprocessamento auditado.
- Chamadas externas são feitas por portas (`PaymentProvider`, `ErpProvider`, `ShippingProvider`). Bling é o primeiro adaptador.
- Toda consulta empresarial exige `storeId`; RLS no PostgreSQL é requisito antes de abrir o SaaS a múltiplos clientes.
- Pedido e documento fiscal são agregados relacionados, mas independentes. O número STOREOS não é o número de venda Bling nem o número da NF-e.
- Webhooks externos são autenticados sobre o corpo bruto, persistidos com chave única do evento e respondidos após persistência; regra de negócio e chamadas remotas rodam em worker.
- Estado retornado por provedor é mantido como estado externo; mapeamento ao estado local precisa ser configurado e auditado por tenant.
- NF-e é gerida pelo ERP conectado. STOREOS não inventa regras tributárias nem marca um pedido como faturado até haver confirmação de autorização adequada.

## Segurança e LGPD

- Access token de curta duração, refresh token rotacionado, MFA e sessões revogáveis.
- RBAC por permissões e trilha AuditLog.
- PII minimizada, criptografada conforme classificação; segredos de integração em secret manager; logs jamais recebem dados de cartão, senha ou documento puro.
- Rate limit em borda e login, validação dos DTOs, headers Helmet, CORS restritivo, CSRF em fluxos cookie e queries parametrizadas.
- Documentos fiscais e links de DANFE/XML são dados protegidos, com acesso auditável e URLs temporárias quando aplicável.

## Evolução SaaS e Marketplace

Store é tenant. Domínio, tema e configuração ficam vinculados à loja. O modelo Marketplace adiciona Seller, Offer, split de pedidos e ledger sem alterar o pedido base. Serviços só são extraídos por pressão de escala, priorizando busca, notificações, integrações e checkout.