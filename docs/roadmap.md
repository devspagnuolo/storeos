# Roadmap — operação substituta da Nuvemshop

## Fase 0 — concluir a fatia segura já em andamento

1. Integrar pedidos: número STOREOS e número/ID Bling independentes, todos os pedidos enviados, sem duplicação após timeout.
2. Revisar webhook Bling para persistência e ACK rápido, processamento fora da requisição, idempotência, retry, DLQ e reconciliação.
3. Testar OAuth, conexão, importação, pedidos pendentes/pagos, eventos repetidos/fora de ordem e logs sem PII.

## MVP operacional controlado

1. Onboarding da loja com logo original/favicon, dados comerciais, domínio, equipe, políticas e progresso persistente.
2. Catálogo completo para a operação inicial: variantes, categorias, marca, mídia, SEO, importação e reconciliação Bling.
3. Checkout de ponta a ponta: estoque reservado, pagamento confirmado, comunicação, OMS e frete/rastreio com provedores habilitados.
4. Fiscal Bling: venda do ERP associada ao pedido local, solicitação de NF-e conforme recurso vigente, webhook/consulta de situação e retorno seguro dos documentos.
5. Não ativar emissão automática até configuração fiscal e ambiente confirmados no Bling e pelo contador; provar homologação e proteger contra duplicidade.
6. Admin diário: busca/filtros de pedidos, clientes, descontos, carrinhos identificados, timeline, falhas e reprocessamento.

## Paridade administrativa

- Loja online: editor visual de blocos, preview responsivo, publicação versionada/rollback, páginas, navegação, blog, SEO, redirects e domínio.
- Comercial: pedido manual, RMA/devolução, reembolso, perfis de cliente e atendimento.
- Operação: locais de estoque, etiquetas, transportadoras, rastreio, central de integrações, relatórios e notificações.
- Marketing: abandono, campanhas consentidas, segmentação, cupons e promoções automáticas.
- Canais adicionais (social, marketplaces e POS) com providers isolados e critérios próprios; não inferir cobertura a partir do checkout da loja.

## Go-live e substituição

Migração só quando checklist técnico/comercial/fiscal passar em ambiente de teste, backup e restauração forem demonstrados, pedidos/estoque tiverem conciliação com Bling, DNS/TLS e pagamentos forem validados, suporte/alertas estiverem ativos e houver janela de rollback. A aprovação contábil é exigida antes de emissão fiscal em produção.

## Enterprise

Depois da operação principal confiável: multi-CD, marketplace/split, assinaturas, regras promocionais avançadas, CRM/automação multicanal, loyalty, busca semântica, data warehouse e IA com dados isolados por tenant.

## Métricas de sucesso

Disponibilidade e SLO acompanhados; p95 API segmentado por jornada; zero dados de cartão armazenados; sincronização e reconciliação ERP mensuráveis; taxa de checkout e conversão definidas; taxa de duplicidade de pedido/NF-e igual a zero; idade e falha da fila monitoradas.