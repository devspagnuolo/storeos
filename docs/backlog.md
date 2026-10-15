# Backlog priorizado — paridade operacional

> **Documento histórico.** Descreve o estado de outubro/2026 e parte das lacunas citadas aqui já foi entregue. Para o estado atual e as próximas entregas, consulte [estado-atual.md](estado-atual.md).

| Prioridade | Épico | Entregas e critérios de aceite |
|---|---|---|
| P0 | Pedidos STOREOS ↔ Bling | Todo pedido STOREOS é enviado uma única vez, inclusive pendente, com número local próprio e ID/número Bling separados; conciliação após timeout; reprocessamento com permissão e auditoria. |
| P0 | NF-e via Bling | Pedido de venda Bling primeiro; documento fiscal vinculado à venda; receber status/ID/série/número/chave e DANFE/XML; rejeição/cancelamento/retry rastreáveis; ativação protegida por checklist fiscal e validação do contador. |
| P0 | Webhooks e confiabilidade | HMAC sobre raw body, resposta 2xx rápida após persistência, processamento assíncrono, idempotência por eventId, eventos fora de ordem, retry/DLQ, health check e reconciliação. |
| P0 | Go-live/onboarding | Wizard por etapas, identidade/contato/logo, domínio/TLS, catálogo, frete, pagamento, integração ERP, pedido teste e checklist de publicação/rollback. |
| P0 | Operação e segurança | Isolamento por loja, RBAC, MFA, auditoria, backup/restore, alertas, observabilidade e runbooks verificados antes de substituir loja ativa. |
| P0 | Catálogo e estoque ERP-first | CRUD/variações/imagens/SEO, importação com relatório e de-para; reconciliação de preço/estoque/SKU e prevenção de venda além do saldo. |
| P0 | Checkout, pagamento e expedição | Checkout revalidado no servidor, webhooks de pagamento idempotentes, cotação/frete, etiqueta e rastreio por provider; falhas visíveis ao lojista. |
| P1 | Pedidos manuais e atendimento | Criar pedido assistido sem burlar preço/estoque, link de pagamento, comentários internos, devolução/RMA e reembolso conciliado. |
| P1 | Carrinho abandonado | Detecção após etapa válida, janela configurável, consentimento/retention, recuperação com link seguro e resultado mensurável. |
| P1 | Clientes/CRM | Perfil 360, compras, consentimento, segmento, LTV, exportação/anonimização LGPD e histórico de interações. |
| P1 | Gestão da loja online | Editor de tema em blocos, preview, draft/publicação versionada/rollback, páginas, menus, blog, SEO, redirect e domínio. |
| P1 | Marketing | Cupom manual distinto de promoção automática, regras, frete grátis, segmentação e automações consentidas. |
| P1 | Analytics e relatórios | Métricas documentadas, filtros, comparação de períodos, exportação e dimensões por tenant. |
| P2 | Canais de venda | Integrações provider-first para social, feed, marketplaces e POS, cada uma com escopo e operação testados. |
| P2 | SaaS comercial | Planos, limites, faturamento, self-service e suspensão reversível. |
| P2 | Fidelidade, assinatura e IA | Ledger de pontos/cashback, planos/assinaturas e IA assistiva isolada por tenant com aprovação humana. |

A matriz detalhada, status observado e critérios para substituir operações está em [nuvemshop-operational-parity.md](nuvemshop-operational-parity.md).