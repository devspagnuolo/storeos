# Mapa de paridade operacional — STOREOS x Nuvemshop

> **Documento histórico.** Descreve o estado de outubro/2026 e parte das lacunas citadas aqui já foi entregue. Para o estado atual e as próximas entregas, consulte [estado-atual.md](estado-atual.md).

## Escopo e método

Mapa do painel conectado, percorrido por grupos de navegação para definir o que o lojista precisa operar no STOREOS. Isto cobre a superfície administrativa observada e a operação central de uma loja; não certifica a cobertura de cada aplicativo de terceiros do marketplace Nuvemshop nem substitui uma auditoria funcional/técnica de cada fluxo em produção.

Status é referente ao código atual do STOREOS no branch de trabalho em que este documento for integrado, não ao que está prometido no roadmap.

| Área operacional do painel | Estado STOREOS | Prioridade | Critério mínimo para considerar substituída |
|---|---|---:|---|
| Início, onboarding e checklist de configuração | Parcial | P0 | Criar loja e orientar logo/favicon, domínio, catálogo, frete, pagamento, ERP, checkout de teste e publicação; progresso recuperável. |
| Estatísticas e indicadores executivos | Parcial | P1 | Receita, pedidos, conversão, ticket, clientes e produtos com filtros temporais, definição explícita de cada métrica e exportação. |
| Pedidos da loja / OMS | Parcial | P0 | Busca, filtros, ações autorizadas, timeline, histórico imutável e números STOREOS + Bling sem confusão. |
| Pedidos manuais | A construir | P1 | Atendente monta pedido, cliente/itens/frete/desconto, envia link de pagamento e registra auditoria sem contornar estoque e limites de desconto. |
| Carrinhos abandonados | A construir | P1 | Persistir carrinho identificado após etapa válida de checkout, política de retenção/consentimento, deduplicação e recuperação rastreável por link/campanha. |
| Trocas, devoluções e reembolso | Parcial | P1 | RMA com motivo, itens/quantidades, aprovação, logística reversa, devolução de saldo/pontos e conciliação financeira. |
| Produtos, variações, mídia e SEO | Parcial | P0 | CRUD e publicação, preço/estoque/SKU/EAN, variantes, imagens, importação/exportação, validação e trilha por campo. |
| Categorias, marcas, coleções e menus | Parcial | P0 | Hierarquia, ordenação, publicação, menu da loja e importação sem órfãos. |
| Estoque e locais de expedição | Parcial | P0 | Reserva concorrente, movimentos auditáveis, disponibilidade por local e reconciliação Bling sem estoque negativo. |
| Clientes / CRM 360 | Parcial | P1 | Consentimentos, endereços, pedidos, interações, segmentação e LTV; acesso por permissão e exportação/anonimização LGPD. |
| Cupons, promoções e frete promocional | Parcial | P1 | Cupom manual vs regra automática claramente distintos; limites, vigência, escopo e cálculo revalidado no servidor. |
| Marketing e automações | Parcial | P2 | Jornada consentida multicanal, opt-out, throttling, modelos e auditoria de campanha; integração de provedores separada. |
| Loja online: tema, editor e pré-visualização | Parcial | P0 | Editor visual com blocos, rascunho, preview responsivo, publicação versionada e rollback; sem HTML arbitrário inseguro. |
| Páginas, blog, SEO, redirects e domínio | Parcial | P1 | Conteúdo editável, metadados, URL/redirect, sitemap e domínio/TLS com validação antes da publicação. |
| Canais sociais, feeds, marketplaces e POS | Depende de parceiro / A construir | P2 | Cada canal tem provider, catálogo/de-para, pedidos, preço/estoque, status e logs próprios; escopo não é presumido pelo site. |
| Pagamentos e checkout | Parcial | P0 | Métodos configurados por loja, checkout validado no servidor, webhooks idempotentes, antifraude e conciliação; nenhuma credencial de cartão armazenada. |
| Frete, transportadoras, etiquetas e rastreio | Parcial | P0 | Cotação por pacote/CEP, SLA, etiqueta, eventos de rastreamento e logística reversa por provider com fallback. |
| NF-e/documentos fiscais | Parcial | P0 | Vínculo pedido STOREOS → pedido de venda Bling → NF-e do Bling → autorização SEFAZ; número/série/chave/status e DANFE/XML retornam ao pedido e ao cliente conforme política. |
| Usuários, funções, segurança e LGPD | Parcial | P0 | RBAC de menor privilégio, MFA, sessões, auditoria, exportação/eliminação, retenção, rate limits e evidência de isolamento entre lojas. |
| Notificações e comunicação de status | Parcial | P1 | Preferências por evento/canal, templates, consentimento, retentativas e log sem vazar PII. |
| Aplicativos, integrações e saúde operacional | Parcial | P0 | OAuth/segredos, escopos, health checks, sincronização, fila/DLQ, reprocessamento e logs por loja/entidade. |
| Plano e faturamento SaaS da plataforma | A construir | P2 | Planos, limites, cobrança, inadimplência, suspensão reversível e self-service sem afetar dados comerciais. |
| Moeda, idiomas, códigos externos e campos adicionais | A construir | P2 | Configuração validada por loja, contratos de integração versionados e efeitos mostrados antes de publicar. |

## Jornada de substituição e gates de go-live

1. Onboarding: identidade jurídica/contato, nome e subdomínio, logo original e favicon derivado sem redesenhar a marca, endereço, moeda/fuso, domínio e equipe/permissões.
2. Preparação de dados: importar produtos/clientes/estoque e mapear IDs/SKUs; mostrar erros e permitir reprocessar sem duplicar.
3. Configuração comercial: pagamentos, fretes, políticas, páginas, checkout e comunicações; segredos sempre cifrados e ocultos depois de salvos.
4. Bling em homologação: autorizar app OAuth; importar catálogo/estoque/preços; sincronizar clientes; enviar todos os pedidos com número da loja igual ao número exclusivo STOREOS; receber mudanças pelo webhook.
5. Teste operacional: pedido sandbox/de valor de teste, pagamento, pedido no Bling, emissão em homologação quando disponível, retorno de status/documento e rastreio; reconciliar contagem e totais.
6. Go-live: checklist impede publicar checkout enquanto domínio/TLS, pagamento, frete, conexão Bling e regras fiscais estiverem incompletos; ativação e rollback explícitos.
7. Desativação Nuvemshop só depois da reconciliação do catálogo, histórico e pedidos abertos, domínio validado, janela de observação e plano de retorno. Migração de DNS é uma ação separada, não consequência automática da publicação.

## Contrato operacional de pedidos e Bling

- Pedido STOREOS conserva ID interno e número de exibição imutáveis; o Bling conserva seu próprio ID e número. Guardar ambos, além da referência externa enviada pelo STOREOS.
- A regra é enviar todo pedido da loja ao Bling, inclusive aguardando pagamento, uma vez criado/confirmado conforme política de pedidos; repetição de fila ou webhook não pode criar outro pedido de venda.
- Sincronização de pagamento, situação do pedido, documento fiscal e fulfillment são dimensões separadas. Um pedido pode existir no ERP sem pagamento e sem nota.
- Usar chave de idempotência e reconciliação antes de novo POST; armazenar payload mínimo de auditoria, resposta saneada, tentativas, timestamps, erro tipado e próximo retry. Retry exponencial, jitter, limite, dead-letter e reprocessamento autorizado.
- Webhook: validar HMAC `X-Bling-Signature-256` sobre corpo bruto e segredo; verificar loja/empresa e conexão; persistir evento com unicidade por `eventId`; responder 2xx rapidamente depois de persistir e processar de forma assíncrona. Eventos podem chegar fora de ordem e repetir; combinar com busca pontual no Bling.
- Nunca copiar tokens, documentos completos, cartão ou payload contendo PII para logs comuns; separar trilha de auditoria e mascarar campos.

## Ciclo fiscal (NF-e) pelo Bling

1. O checkout coleta apenas os dados necessários ao documento e valida formato/completude; regras tributárias nunca são inferidas pela STOREOS.
2. O pedido de venda STOREOS é criado no Bling primeiro e seu ID e número são gravados no vínculo local.
3. Gatilho de emissão é opção explícita por loja (manual ou automática em evento/status habilitado pelo lojista), desativada por padrão até checklist fiscal concluído. Pedido pendente pode ser importado sem emitir nota.
4. A integração usa o mecanismo documentado do Bling para gerar nota **a partir do pedido de venda**, não um POST de NF-e desconectado. Confirmar em homologação qual operação/API atual preserva esse vínculo antes de habilitar produção.
5. Se a API exigir criar nota explicitamente, exigir natureza de operação já cadastrada no Bling e validada pelo contador, produtos com NCM/tributação exigidos, emitente/ambiente/série, endereço/documento e valores conferidos. STOREOS não inventa CFOP, CST, NCM, alíquota nem série.
6. Armazenar recurso fiscal separado com orderId/storeId, ID remoto da nota, ID/número da venda Bling, modelo/tipo, série/número, chave de acesso, situação no Bling/SEFAZ, emissão/autorização/cancelamento, links/identificadores DANFE e XML, tentativas, erro e timestamps. Impedir segunda nota ativa para o mesmo pedido, salvo fluxo fiscal de substituição/devolução explicitamente permitido.
7. Receber evento de NF-e criada/atualizada; confirmar o estado pela API ao receber evento potencialmente fora de ordem; preencher pedido STOREOS, liberar documentos apenas depois de autorização adequada e notificar cliente de modo idempotente.
8. Rejeição mantém pedido sem “faturado”, mostra motivo e ação de corrigir/reprocessar. Cancelamento é fluxo distinto e registrado. XML/DANFE devem ser baixados por canal autenticado/URL segura e retidos conforme obrigação e política aplicáveis.
9. Exibir no painel: não configurado, aguardando gatilho, em processamento, aguardando autorização SEFAZ, autorizado, rejeitado, cancelado, falha recuperável/definitiva; tentativa manual com confirmação e permissão.
10. Aceite em sandbox/homologação: uma venda STOREOS produz exatamente um pedido de venda Bling; repetição de evento não duplica; pedido e NF continuam vinculados; autorização atualiza uma vez; números divergentes nunca são confundidos; retorno, retry, DLQ e cancelamento são auditáveis.

## Sequenciamento recomendado

- P0 — concluir vertical do pedido: migração, testes de idempotência/conflito/pendência, status; entrada de webhook rápida + outbox/fila; ficha fiscal e retorno de NF-e; UI do painel para números STOREOS/Bling, saúde e reprocessamento.
- P0 — operação de loja: onboarding por checklist, configuração de pagamentos e frete com teste, importação/reconciliação, aviso de prontidão e runbook de migração.
- P1 — jornada diária: clientes 360, carrinhos abandonados, pedido manual, devolução e rastreio; notificações/email/WhatsApp consentidos.
- P1 — editor e canal: blocos/preview/publicação, URLs/SEO, analytics com métricas definidas.
- P2 — canais de venda e marketplace, POS, app ecosystem, automação avançada e plano/billing SaaS.
- Antes de substituir produção: testes E2E em loja sandbox, backup/restore, observabilidade/alertas, revisão de segurança, reconciliação com ERP e aprovação do contador. Não prometer 100% funcional até os critérios acima passarem.
