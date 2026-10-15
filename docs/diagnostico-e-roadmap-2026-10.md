# StoreOS: diagnóstico, arquitetura alvo e roadmap

> **Documento histórico.** Descreve o estado de outubro/2026 e parte das lacunas citadas aqui já foi entregue. Para o estado atual e as próximas entregas, consulte [estado-atual.md](estado-atual.md).

Estado analisado: `main` no commit `0e10a09` (14/10/2026), com todo o código lido (API, vitrine, painel, banco, CI e deploy) e as telas exercitadas em navegador contra um banco local.

**Restrição de partida:** nenhuma etapa deste plano altera dados de login existentes (usuário, senha, sessões). Mudanças de banco são aditivas (expandir, migrar, só depois contrair).

## 1. Resumo executivo

O núcleo transacional é bom e já vende: reserva de estoque atômica, ciclo de pedido idempotente, dinheiro em `Decimal`, PIX com webhook assinado, frete por CEP e painel básico. O que separa o StoreOS de um produto comercial não está nesse núcleo, e sim em cinco lacunas:

1. **Comunicação:** o sistema não envia nenhum e-mail. O cliente não recebe confirmação, o lojista não recupera senha, e o fluxo manual de boleto promete um e-mail que nunca sai.
2. **Operação do lojista:** o painel cobre só o básico (visão geral, pedidos, produtos, frete e configurações). Faltam expedição e rastreio, clientes, estoque com histórico, variações, múltiplas imagens, cupons, relatórios e gestão de usuários.
3. **Aparência:** não há design system, tema escuro, estados de carregamento/erro/vazio, rodapé, páginas institucionais nem identidade por loja. A home promete "cartão" e "atendimento humano" que não existem.
4. **Produto SaaS:** hoje é uma loja por implantação (slug fixo no build), sem cadastro de loja, domínio próprio, papéis por loja nem planos.
5. **Operação do software:** deploy sem trava de CI e sem homologação, serviços no plano gratuito (dormem), sem monitoramento, sem trilha de auditoria, sem consumidor para os eventos do outbox.

## 2. Arquitetura atual

| Camada | Como está | Observação |
|---|---|---|
| API | NestJS 11 monolito modular: auth, catalog, orders, checkout, payments, shipping, store | Controller + service com Prisma direto; regra de negócio já isolada em funções puras onde importa (`order-lines`, `shipping-options`, `webhook-signature`) |
| Banco | Postgres 16 (plano pago), Prisma 6, 21 modelos, 5 migrations | Isolamento por `storeId` só na aplicação; sem RLS |
| Vitrine/painel | Next.js 15 App Router, Tailwind, zustand | 13 páginas `force-dynamic`; carrinho em localStorage; painel com server actions e cookies httpOnly |
| Pagamento | Porta `PaymentProvider` + roteador: Mercado Pago (PIX) ou manual | Sem token configurado, tudo é manual; cartão bloqueado |
| Eventos | Outbox transacional gravado em cada mudança | Nenhum consumidor publica; tabela só cresce |
| Jobs | `@nestjs/schedule` dentro do processo da API (expira pedidos a cada 5 min) | Roda em toda instância |
| CI/CD | GitHub Actions (lint, build, 54 testes unitários, 30 de integração) + Render auto-deploy | Deploy não espera o CI; migration roda no build de produção |
| Infra | 2 serviços web (plano free) + Postgres pago | `render.yaml` ainda descreve o banco como free e provisiona Redis sem uso |

## 3. Achados

Critério: **Crítico** impede vender com credibilidade ou risco de perda; **Alto** limita o produto ou expõe a risco real; **Médio** degrada experiência, custo ou manutenção; **Baixo** é higiene.

### 3.1 Críticos

| ID | Área | Achado | Evidência | Correção (fase) |
|---|---|---|---|---|
| C1 | Comunicação | Nenhum e-mail transacional. O boleto manual diz "será enviado para o seu e-mail", o que é falso; não há confirmação de pedido | `manual-payment.provider.ts` | Ocultar boleto manual já (0); e-mail completo (3) |
| C2 | Segurança | Sem recuperação de senha e sem MFA (o campo `mfaEnabled` existe e não é usado). Perder a senha tranca o lojista | `auth.service.ts`, `schema.prisma` (User) | Recuperação por e-mail (3), MFA TOTP (2) |
| C3 | Pagamento | Sem token do gateway, PIX é manual; cartão e boleto reais não existem | `payment-router.ts`, `checkout.service.ts` | Configurar Mercado Pago (depende do dono), cartão e boleto reais (4) |
| C4 | Entrega | Render publica a cada commit sem esperar o CI; a migration roda no build de produção (falha de build depois dela deixa banco à frente do código); não há homologação nem restauração testada | `render.yaml`, `ci.yml` | Deploy só com checks verdes, passo de release separado, ambiente de homologação (0, 7) |
| C5 | Desempenho | API e vitrine no plano gratuito: dormem e a primeira visita leva dezenas de segundos | `list_services` (plano free) | Plano pago nos dois serviços (decisão do dono) |
| C6 | Produto | Não é SaaS vendável: loja fixada por variável de build, sem cadastro de loja, sem domínio próprio, `Role` global (`name @unique`) | `lib/api.ts`, `schema.prisma` | Fase 6 |

### 3.2 Altos

| ID | Área | Achado | Evidência | Fase |
|---|---|---|---|---|
| A1 | Credibilidade | Home promete "PIX, cartão e boleto", "rastreamento em cada etapa" e "atendimento humano"; "Minha conta" diz "em breve"; sem rodapé, CNPJ, política de troca, privacidade ou termos (exigência legal e de confiança) | `app/page.tsx`, `app/conta/page.tsx` | 0, 1 |
| A2 | Auditoria | Nenhuma trilha de auditoria nem histórico de alterações (a documentação cita `AuditLog`, o schema não tem) | `schema.prisma` | 2 |
| A3 | Eventos | Outbox sem consumidor: `publishedAt` nunca é preenchido, sem limpeza, sem reprocessamento. Bling e e-mails dependem disso | `OutboxEvent` | 3 |
| A4 | Observabilidade | Log em texto sem id de requisição, sem rastreio de erros, sem métricas; `/health` não testa o banco | `health.controller.ts` | 0, 7 |
| A5 | Confiabilidade | Sem desligamento limpo: `enableShutdownHooks` não é chamado, então cada deploy pode derrubar requisições em andamento (inclusive checkouts) | `main.ts`, `prisma.service.ts` | 0 |
| A6 | Escala | Limite de requisições em memória e job de expiração em toda instância: quebra ao passar de 1 instância. Redis provisionado e não usado | `app.module.ts`, `payment-expiry.job.ts` | 7 |
| A7 | Catálogo | Produto sem peso, dimensões, marca, EAN, NCM, custo; variações existem no schema mas o checkout só vende produto simples; uma única imagem por URL, sem upload | `schema.prisma`, `checkout.service.ts` | 2 |
| A8 | Clientes | Sem telefone/CPF, endereços nunca salvos (só JSON no pedido), sem conta do cliente, sem rastreio público, sem consentimento/exportação/exclusão (LGPD) | `Address`, `checkout.service.ts` | 2, 3 |
| A9 | Busca | `ILIKE` sem índice e sem tratamento de acento ("cafe" não acha "café"); sem autocomplete | `catalog.service.ts` | 2 |
| A10 | Frete | Só regra fixa por UF: sem peso, transportadora, etiqueta ou rastreio | `shipping.service.ts` | 5 |
| A11 | Segurança | Limite de login só por IP; sem bloqueio por conta; webhook sem segredo aceita chamadas sem assinatura e está fora do limite; Swagger público em produção | `auth.controller.ts`, `payments-webhook.controller.ts`, `main.ts` | 0, 2 |
| A12 | Permissões | Papel `owner` é global: mudar as permissões dele afeta todas as lojas; não há convite nem gestão de usuários na interface | `schema.prisma` (Role) | 2, 6 |
| A13 | Pedido | Estados `PICKING`, `INVOICED`, `SHIPPED`, `DELIVERED` existem no enum, mas nada permite avançar; sem código de rastreio, reembolso ou devolução | `OrderStatus` | 2 |

### 3.3 Médios

| ID | Área | Achado | Evidência | Fase |
|---|---|---|---|---|
| M1 | Desempenho | `force-dynamic` em 13 páginas anula o cache de 60 s do `fetch`: toda visita bate na API; imagens em `<img>` sem otimização | `lib/api.ts`, `eslint.config.mjs` | 1, 7 |
| M2 | SEO | Sem `sitemap.xml`, `robots.txt`, canonical, imagem OG padrão, favicon; JSON-LD só no produto | `apps/web/app` (sem `public/`) | 0, 2 |
| M3 | Banco | Faltam índices em chaves estrangeiras (`OrderItem.orderId`, `OrderTimeline.orderId`, `ProductImage.productId`, `Inventory.productId`) e em `Product(storeId, createdAt)` | `schema.prisma` | 0 |
| M4 | Higiene | `react-query`, `react-hook-form`, `zod`, `@hookform/resolvers` instalados e sem uso; `packages/contracts` sem nenhum import; compose sobe RabbitMQ e Meilisearch sem uso; um único manifesto Kubernetes não validado | `package.json`, `docker-compose.yml`, `infra/` | 0 |
| M5 | UX | Nenhum `loading.tsx`/`error.tsx`, sem skeletons nem toasts; validação só no servidor; painel sem busca de pedido, filtro por data, exportação ou ações em lote | `apps/web/app` | 1, 2 |
| M6 | Carrinho | Guarda o preço visto na hora da adição; sem aviso de mudança de preço ou estoque antes do envio; sem cupom | `lib/cart.ts` | 4 |
| M7 | Manutenção | Linhas de 150 a 400 caracteres em controllers e componentes, sem Prettier; revisão e onboarding difíceis | `orders.controller.ts`, `header.tsx` | 0 |
| M8 | Login | O painel pede o "slug da loja" no login e a conta pertence a uma única loja (`User.storeId`) | `login/page.tsx`, `schema.prisma` | 6 (aditivo) |
| M9 | Testes | Sem E2E no CI; web com 3 arquivos de teste; sem teste de carga nem medição de cobertura | `ci.yml` | 0, 7 |
| M10 | Dashboard | 4 indicadores, sem séries, gráficos, mais vendidos, recorrência ou conversão | `admin/(painel)/page.tsx` | 2 |
| M11 | Estoque | Sem histórico de movimentações nem ajuste com motivo; `reorderPoint` ignorado (alerta fixo em 3 unidades) | `orders.service.ts` | 2 |
| M12 | Segurança | `Customer.upsert` por e-mail sobrescreve o nome de um cliente existente a cada checkout | `checkout.service.ts` | 2 |

### 3.4 Baixos

| ID | Achado |
|---|---|
| B1 | `JWT_REFRESH_SECRET` e `REDIS_URL` configurados e sem uso |
| B2 | `render.yaml` descreve o banco como `free` (o real já é pago): o blueprint está desatualizado |
| B3 | `PrismaService.enableShutdownHooks` é código morto |
| B4 | Seed usa imagens `picsum.photos`, aceitável só em desenvolvimento |
| B5 | Sem manifest PWA, sem ícones, sem página 404 com identidade |

### 3.5 O que transmite aparência de MVP hoje

- Cabeçalho sem busca, sem menu de categorias e sem mini-carrinho; sem rodapé.
- Home com bloco de gradiente no lugar de banner, textos genéricos, sem banners configuráveis nem vitrines por coleção.
- Página de produto com uma imagem, sem galeria, sem avaliações, sem relacionados, sem cálculo de frete na página.
- Checkout em uma tela só, sem etapas, sem resumo fixo, sem cartão, sem parcelamento.
- Painel sem menu lateral, sem gráficos, sem tema escuro, com tabelas que não têm busca nem exportação.
- Mensagens como "em breve" visíveis ao cliente final.

## 4. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Lojista perde a senha e fica sem acesso | Média | Alto | Recuperação por e-mail, MFA, segundo dono por convite |
| Migration quebra produção (roda no build) | Baixa | Alto | Passo de release separado, homologação, só migrations aditivas, backup antes de cada release |
| Webhook de pagamento perdido: pedido pago fica "aguardando" | Média | Alto | Job de conciliação que relê pagamentos pendentes no gateway |
| Cold start espanta o cliente | Alta (hoje) | Alto | Plano pago nos serviços |
| Vazamento entre lojas por filtro `storeId` esquecido | Baixa | Crítico | RLS no Postgres, testes de isolamento por módulo |
| Promessa sem funcionalidade (boleto, cartão, atendimento) | Alta (hoje) | Médio | Remover/ocultar até existir |
| Dependência de credenciais de terceiros bloqueia fases | Alta | Médio | Portas e adaptadores com modo simulado; fase só fecha com credencial real |

## 5. Arquitetura alvo

Princípio: **monolito modular com processos separados**, não microserviços. Cada módulo tem um contrato público; tudo que é assíncrono passa pelo outbox.

```
Cliente / Lojista
   │
Next.js (storefront + backoffice)  ── resolve a loja pelo domínio (Host)
   │  REST/OpenAPI (cliente tipado gerado)
NestJS API ──────────────────────────────┐
   │                                      │
Postgres (RLS por loja)         Redis (cache, limites, locks, filas)
   │                                      │
Worker (mesmo código, outro processo) ◄───┘
   ├─ publica o outbox
   ├─ envia e-mails e webhooks de saída
   ├─ expira pedidos e concilia pagamentos
   ├─ importa/exporta (CSV, Bling) e indexa busca
   └─ gera relatórios agendados
Serviços externos: Mercado Pago · Melhor Envio/Correios · Bling · provedor de e-mail
                   · armazenamento de objetos + CDN · Sentry · GA4/GTM/Meta
```

### 5.1 Módulos

| Módulo | Responsabilidade | Novo? |
|---|---|---|
| identity | contas globais, vínculos conta↔loja (`Membership`), papéis por loja, MFA, sessões, recuperação | Evolui |
| tenancy | lojas, domínios, planos, limites, tema e configurações | Novo |
| catalog | produto, variações, marcas, categorias, mídia, SEO, importação | Evolui |
| inventory | saldo por depósito, reservas, movimentações e ajustes | Novo (hoje dentro de catalog/orders) |
| pricing | cupons, promoções, regras de frete grátis, tabelas de preço | Novo |
| cart/checkout | carrinho no servidor, cotação, checkout em etapas, idempotência | Evolui |
| orders (OMS) | pedido, expedição, rastreio, devolução, reembolso, notas | Evolui |
| payments | provedores, conciliação, reembolso, antifraude básico | Evolui |
| shipping | cotação, etiqueta, rastreio, regras | Evolui |
| customers | cliente 360, endereços, consentimentos, segmentos | Novo |
| content | banners, páginas, menus, blog, políticas | Novo |
| notifications | modelos, canais (e-mail primeiro), preferências, histórico de envio | Novo |
| integrations | credenciais criptografadas, adaptadores (Bling etc.), logs e reprocessamento | Novo |
| analytics | eventos de vitrine, funis, relatórios, pixels | Novo |
| audit | trilha append-only de ações administrativas | Novo |

Regras: controller fino; regra de negócio em funções puras testáveis; integrações só por portas (`PaymentProvider`, `ShippingProvider`, `ErpProvider`, `MailProvider`, `StorageProvider`); nenhum módulo lê tabela de outro, só o serviço público dele.

### 5.2 Dados e multi-loja

- **Resolução de loja:** middleware do Next.js lê o `Host`, consulta `StoreDomain` (cache curto) e injeta a loja; `NEXT_PUBLIC_STORE_SLUG` vira só o padrão de desenvolvimento.
- **Contas:** nova tabela `Membership(userId, storeId, roleId)` criada ao lado da atual. Os usuários existentes ganham o vínculo por migration aditiva; a tela de login continua funcionando com o par loja+e-mail até a troca para login só por e-mail, sem tocar em hashes de senha.
- **Papéis por loja:** `Role.storeId` anulável (papéis do sistema imutáveis + papéis da loja).
- **RLS:** `SET LOCAL app.store_id` por transação via extensão do Prisma; políticas em todas as tabelas com `storeId`; teste automático que tenta ler dados de outra loja em cada módulo.
- **Dinheiro:** continua `Decimal(14,2)`; arredondamento centralizado em `money.ts`.
- **Busca:** primeiro `unaccent` + `pg_trgm` + índice GIN (zero infraestrutura nova); Meilisearch quando o catálogo ou o volume justificar.
- **Mídia:** armazenamento S3-compatível (Cloudflare R2) com URLs assinadas para upload, variantes geradas no worker, entrega por CDN.

### 5.3 Qualidade, segurança e operação

| Tema | Padrão alvo |
|---|---|
| Ambientes | desenvolvimento (compose) → preview por PR → homologação (banco próprio) → produção |
| Entrega | CI obrigatório antes do deploy; migrations em passo de release (`preDeployCommand`); política expandir/migrar/contrair; backup antes de release; reversão documentada |
| Testes | unitário, integração com banco, E2E com Playwright (compra completa, painel), carga com k6 no checkout, teste de isolamento entre lojas |
| Observabilidade | logs JSON (pino) com `requestId`, `storeId`, `userId`; erros no Sentry (API e web); métricas (latência, fila, falhas de webhook); alerta de saúde; auditoria de ações administrativas |
| Segurança | MFA TOTP, recuperação de senha, bloqueio progressivo por conta e IP, sessões listáveis e revogáveis, CSP e demais cabeçalhos no web, segredos de webhook obrigatórios, Swagger desligado em produção, criptografia de campos sensíveis (CPF), rotação de chaves |
| LGPD | consentimento registrado, exportação e exclusão por cliente, política de retenção, DPA para lojistas |
| Contratos | OpenAPI como fonte; cliente TypeScript gerado em `packages/contracts`; erros no formato RFC 7807; chave de idempotência nos endpoints públicos de escrita |

## 6. Padrão visual alvo

**Direção:** SaaS moderno, denso onde é operação e arejado onde é venda. Dois produtos com a mesma base: **backoffice** (produtividade) e **vitrine** (conversão, com a marca da loja).

### 6.1 Fundamentos

- **Tokens semânticos** em CSS variables (`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--brand`, `--success`, `--warning`, `--danger`), com tema claro e escuro por `prefers-color-scheme` e alternância manual. A vitrine recebe cor primária, logo e tipografia da loja por configuração, validadas por contraste (WCAG AA).
- **Escala:** espaçamento base 4 px; raios 6/10/16; sombras em 3 níveis; tipografia Inter com escala modular (12–36 px); movimento de 120–200 ms com respeito a `prefers-reduced-motion`.
- **Componentes** (pasta `components/ui`, sem biblioteca visual pesada, acessíveis por teclado): Button, IconButton, Input, Textarea, Select, Combobox, Checkbox, Switch, RadioGroup, Field (rótulo + ajuda + erro), Card, Badge, Tabs, Dialog, Drawer, Dropdown, Tooltip, Toast, Skeleton, EmptyState, ErrorState, Pagination, DataTable (ordenação, filtros, seleção, colunas, exportação), Stat, Chart (linha/barra), Timeline, FileUpload, DateRange.
- **Estados obrigatórios** em toda tela: carregando (skeleton), vazio (com ação), erro (com tentar de novo), sucesso (toast), formulário inválido (mensagem no campo), sem permissão.
- **Formulários:** `react-hook-form` + `zod`, com o mesmo schema validando cliente e servidor.

### 6.2 Backoffice

- Menu lateral persistente e recolhível, em grupos: **Hoje**, **Vendas** (Pedidos, Carrinhos abandonados), **Catálogo** (Produtos, Categorias, Marcas, Estoque), **Clientes**, **Marketing** (Cupons, Campanhas), **Financeiro**, **Frete**, **Conteúdo**, **Configurações**.
- Barra superior: busca global (⌘K), notificações, seletor de loja (preparado), tema, menu do usuário.
- Cada página: título, ação primária, filtros salvos e tabela; detalhe em duas colunas (conteúdo à esquerda, status e ações à direita); mobile com tabelas viram cartões.
- **Hoje:** caixa de entrada operacional (pedidos a separar, pagamentos pendentes, estoque baixo, perguntas), com o próximo passo de cada item.

### 6.3 Vitrine

- Barra de aviso, cabeçalho com busca e autocomplete, menu de categorias, mini-carrinho em gaveta.
- Home: banner principal configurável, faixa de benefícios reais, carrosséis por coleção, destaques, categorias com imagem, prova social, newsletter.
- Listagem: filtros (categoria, preço, disponibilidade), ordenação, selos (promoção, esgotado, novo), paginação ou "carregar mais".
- Produto: galeria com zoom e miniaturas, variações, estoque, cálculo de frete na página, abas (descrição, ficha, avaliações), relacionados, compartilhar, botão fixo no mobile.
- Checkout em etapas com resumo fixo; conta do cliente com pedidos, rastreio, endereços e favoritos.
- Rodapé completo: institucional, políticas, CNPJ, atendimento, meios de pagamento reais, redes.
- Metas de qualidade: Lighthouse mobile ≥ 90 (desempenho, acessibilidade, SEO), LCP < 2,5 s, CLS < 0,1.

## 7. Modelo operacional alvo

### 7.1 Jornada do lojista

```
Cadastro → verifica e-mail → assistente (nome, segmento, logo, cor, domínio)
   → checklist de entrada no ar:
        produtos (≥ 1) · pagamento conectado · frete configurado · políticas · domínio
   → loja publicada → rotina diária no painel "Hoje"
```

### 7.2 Ciclo do pedido

`Novo → Aguardando pagamento → Pago → Em separação → Faturado → Enviado → Entregue`, com saídas: `Cancelado` (antes de pagar), `Reembolsado` e `Devolvido` (depois). Cada transição: condicional ao estado atual (idempotente), grava na linha do tempo com autor, dispara evento no outbox e, quando aplicável, e-mail ao cliente.

| Transição | Quem/o quê dispara | Efeito |
|---|---|---|
| Aguardando → Pago | webhook do gateway ou lojista | baixa estoque, e-mail "pagamento aprovado" |
| Pago → Em separação | operador | etiqueta de separação |
| Em separação → Faturado | operador ou Bling | número e chave da NF-e |
| Faturado → Enviado | operador ou transportadora | código de rastreio, e-mail "pedido enviado" |
| Enviado → Entregue | rastreio ou operador | e-mail "entregue", libera avaliação |
| Pago/Enviado → Reembolsado | financeiro | estorno no gateway, estoque se devolvido |

### 7.3 Papéis padrão por loja

| Papel | Pode |
|---|---|
| Dono | tudo, inclusive plano, domínio e usuários |
| Administrador | tudo exceto plano e transferência de dono |
| Operador | pedidos, estoque, clientes |
| Catálogo | produtos, categorias, conteúdo |
| Financeiro | pagamentos, relatórios, reembolsos |
| Atendimento | ver pedidos e clientes, notas, cancelar sob regra |
| Somente leitura | consulta |

### 7.4 Indicadores que o lojista acompanha

Vendas do dia e do mês, ticket médio, pedidos por status, taxa de pagamento, conversão (sessões → pedidos), abandono de carrinho, mais vendidos, clientes novos e recorrentes, estoque crítico, tempo médio para despachar, receita por forma de pagamento.

## 8. Roadmap por fases

Cada fase fecha com **critério de aceite** verificável. Tamanhos relativos: P (pequeno), M (médio), G (grande), GG (muito grande). Fases dependem de credenciais externas quando indicado; sem elas, o código fica pronto com adaptador simulado e a fase só fecha na integração real.

| Fase | Tema | Tam. | Depende de | Critério de aceite |
|---|---|---|---|---|
| 0 | Fundamentos e correções | M | nada | Deploy só com CI verde; desligamento limpo; `/health` testa banco; índices criados; Swagger fechado em produção; sem promessa falsa; Prettier no CI; loading/erro/404; favicon, sitemap, robots |
| 1 | Design system e novo visual | G | nada | Tokens + tema claro/escuro; biblioteca de componentes; backoffice com menu lateral, todas as telas atuais refeitas; vitrine com home, listagem, produto, rodapé novos; 0 violações de acessibilidade críticas |
| 2 | Operação do lojista | GG | fase 1 | Dashboard com gráficos; pedidos com expedição e rastreio; produtos com variações, imagens múltiplas/upload, SEO, peso e dimensões; estoque com histórico; clientes; usuários e papéis por loja; auditoria; MFA; busca com acento |
| 3 | Comunicação e conta | G | provedor de e-mail | 7 e-mails transacionais enviados por worker; recuperação de senha; conta do cliente (link mágico); rastreio público; carrinho abandonado |
| 4 | Checkout e pagamentos | G | credenciais Mercado Pago | Checkout em etapas; PIX automático; boleto e cartão com parcelamento; conciliação de pagamentos; reembolso; cupons e descontos |
| 5 | Logística e integrações | GG | tokens Melhor Envio/Correios, Bling, Fidelizei | Cotação por peso e CEP; etiqueta e rastreio; Bling (produtos, estoque, pedidos, NF-e); GA4/GTM/Meta Pixel; webhooks de saída |
| 6 | Plataforma SaaS | GG | fases 2 e 3 | Cadastro de loja; domínio próprio; `Membership`; RLS ativo; planos e cobrança; limites por plano; painel de administração da plataforma |
| 7 | Escala e confiabilidade | G | decisão de custos | Homologação separada; Redis (limites, cache, locks); worker em processo próprio; observabilidade completa; teste de carga; backups com restauração testada; checklist LGPD |

Ordem recomendada: **0 → 1 → 2 → 3 → 4** deixam a loja operando de verdade e com aparência profissional; **5** amplia; **6** vira produto SaaS; **7** corre em paralelo desde a fase 2.

## 9. Backlog completo

Prioridade: **P0** necessário para vender com credibilidade, **P1** diferencial esperado do mercado, **P2** evolução. Tamanho: P/M/G/GG como acima (na coluna de tamanho, "P" significa pequeno).

### Fase 0: fundamentos

| ID | Item | Pri. | Tam. |
|---|---|---|---|
| F0-1 | Ocultar boleto manual e corrigir textos que prometem e-mail | P0 | P |
| F0-2 | `enableShutdownHooks` + testes de desligamento | P0 | P |
| F0-3 | `/health` e `/ready` com checagem do banco | P0 | P |
| F0-4 | Swagger só com `SWAGGER_ENABLED=true` | P0 | P |
| F0-5 | Índices de chaves estrangeiras e `Product(storeId, createdAt)` | P0 | P |
| F0-6 | Remover dependências e arquivos sem uso (react-query, compose extra, contracts vazio ou usá-lo) | P1 | P |
| F0-7 | Prettier + EditorConfig + verificação no CI | P1 | P |
| F0-8 | `loading.tsx`, `error.tsx`, `not-found.tsx` com identidade; favicon; `robots.txt`; `sitemap.xml` | P0 | P |
| F0-9 | Log JSON com `requestId` (pino) | P1 | P |
| F0-10 | Webhook com segredo obrigatório em produção e limite próprio | P0 | P |
| F0-11 | Render: deploy só após checks, passo de release para migrations, blueprint atualizado | P0 | M |
| F0-12 | E2E de compra (Playwright) no CI | P1 | M |

### Fase 1: design system e visual

| ID | Item | Pri. | Tam. |
|---|---|---|---|
| F1-1 | Tokens, tema claro/escuro, tipografia, ícones | P0 | M |
| F1-2 | Biblioteca `components/ui` (lista na seção 6.1) | P0 | G |
| F1-3 | Shell do backoffice: menu lateral, barra superior, busca ⌘K, breadcrumbs | P0 | M |
| F1-4 | Refazer Dashboard, Pedidos, Produtos, Frete, Configurações, Login com a nova base | P0 | G |
| F1-5 | Vitrine: cabeçalho com busca/autocomplete, menu, mini-carrinho, rodapé completo | P0 | G |
| F1-6 | Home com banners e coleções configuráveis (dados em `content`) | P0 | M |
| F1-7 | Listagem com filtros e ordenação; cartão de produto com selos | P1 | M |
| F1-8 | Página de produto premium (galeria, frete na página, abas, relacionados) | P0 | G |
| F1-9 | Páginas institucionais e políticas editáveis | P0 | M |
| F1-10 | Skeletons, toasts, estados vazios e de erro em todas as telas | P0 | M |
| F1-11 | Acessibilidade (teclado, foco, contraste) e metas do Lighthouse | P1 | M |

### Fase 2: operação do lojista

| ID | Item | Pri. | Tam. |
|---|---|---|---|
| F2-1 | Dashboard: vendas dia/mês, séries, ticket, mais vendidos, recorrência, funil básico | P0 | G |
| F2-2 | Pedidos: busca, filtros por data/status/pagamento, exportação CSV, notas internas | P0 | M |
| F2-3 | Expedição: separação, código de rastreio, marcar enviado/entregue, e-mail do cliente | P0 | G |
| F2-4 | Reembolso e devolução (registro e efeito no estoque) | P1 | G |
| F2-5 | Produto: variações e opções, imagens múltiplas com ordem, marca, peso, dimensões, EAN, custo, SEO (título, descrição, slug) | P0 | GG |
| F2-6 | Upload de imagens para armazenamento + CDN, com variantes | P0 | G |
| F2-7 | Importação e exportação de produtos por CSV | P1 | M |
| F2-8 | Estoque: movimentações, ajuste com motivo, ponto de reposição, alertas | P0 | G |
| F2-9 | Categorias: edição, hierarquia, imagem, ordem | P0 | M |
| F2-10 | Clientes: lista, detalhe, endereços salvos, histórico, notas, exportação | P0 | G |
| F2-11 | Usuários da loja: convite, papéis padrão e personalizados, permissões finas | P0 | G |
| F2-12 | `AuditLog` append-only e tela de histórico | P0 | M |
| F2-13 | MFA TOTP e gestão de sessões | P0 | M |
| F2-14 | Busca com `unaccent`/trigram e autocomplete | P1 | M |
| F2-15 | Correção do upsert de cliente (não sobrescrever nome) | P1 | P |

### Fase 3: comunicação e conta

| ID | Item | Pri. | Tam. |
|---|---|---|---|
| F3-1 | Worker do outbox (publicação, tentativas, DLQ, reprocessamento) | P0 | G |
| F3-2 | Porta `MailProvider` + adaptador (Resend ou SES) + modo de arquivo em desenvolvimento | P0 | M |
| F3-3 | Modelos: pedido recebido, pagamento aprovado, pagamento recusado, pedido enviado, pedido entregue, recuperação de carrinho, boas-vindas | P0 | G |
| F3-4 | Personalização por loja (logo, cor, remetente) e histórico de envios | P1 | M |
| F3-5 | Recuperação de senha do painel | P0 | M |
| F3-6 | Conta do cliente por link mágico: pedidos, endereços, favoritos | P1 | G |
| F3-7 | Página pública de rastreio do pedido | P0 | M |
| F3-8 | Carrinho no servidor + recuperação de carrinho abandonado | P1 | G |
| F3-9 | Avaliações de produto com moderação | P1 | G |
| F3-10 | Lista de desejos | P2 | M |

### Fase 4: checkout e pagamentos

| ID | Item | Pri. | Tam. |
|---|---|---|---|
| F4-1 | Checkout em etapas (identificação, endereço, entrega, pagamento, confirmação) com resumo fixo | P0 | G |
| F4-2 | CPF/CNPJ e telefone no checkout; endereço salvo | P0 | M |
| F4-3 | Mercado Pago: PIX (já feito), boleto, cartão com tokenização e parcelamento | P0 | GG |
| F4-4 | Conciliação: job que relê pagamentos pendentes e corrige divergências | P0 | M |
| F4-5 | Reembolso total/parcial pelo painel e pelo gateway | P1 | G |
| F4-6 | Cupons e promoções (percentual, valor, frete grátis, mínimo, validade, limite de uso) | P1 | G |
| F4-7 | Aviso de mudança de preço/estoque no carrinho | P1 | M |
| F4-8 | Antifraude básico (limites por IP/e-mail, revisão manual) | P2 | M |
| F4-9 | Relatório financeiro: receita, taxas, repasses, por forma de pagamento | P1 | G |
| F4-10 | Idempotência de checkout (chave enviada pelo cliente) | P0 | M |

### Fase 5: logística e integrações

| ID | Item | Pri. | Tam. |
|---|---|---|---|
| F5-1 | Porta `ShippingProvider`; Melhor Envio (cotação, etiqueta, rastreio) | P0 | GG |
| F5-2 | Correios direto (cotação e rastreio) | P1 | G |
| F5-3 | Regras mistas: tabela própria + transportadoras, por peso e cubagem | P1 | G |
| F5-4 | Bling: OAuth, produtos, estoque, pedidos, NF-e, logs e reprocessamento | P0 | GG |
| F5-5 | GA4 + GTM + Meta Pixel com eventos de e-commerce e Conversions API | P1 | G |
| F5-6 | Fidelizei: pontos/cashback (requer documentação da API do parceiro) | P2 | G |
| F5-7 | Webhooks de saída configuráveis com assinatura e reentrega | P1 | G |
| F5-8 | Tela de integrações (credenciais criptografadas, status, logs) | P0 | G |

### Fase 6: plataforma SaaS

| ID | Item | Pri. | Tam. |
|---|---|---|---|
| F6-1 | `Membership` aditivo + login só por e-mail com escolha de loja | P0 | G |
| F6-2 | Cadastro de loja com assistente e checklist de entrada no ar | P0 | G |
| F6-3 | `StoreDomain`: domínio próprio com verificação e certificado | P0 | G |
| F6-4 | Resolução de loja por `Host` na vitrine | P0 | M |
| F6-5 | Papéis por loja (`Role.storeId`) e migração dos atuais | P0 | M |
| F6-6 | RLS no Postgres + testes de isolamento | P0 | G |
| F6-7 | Planos, limites e cobrança (Stripe ou Asaas) | P1 | GG |
| F6-8 | Temas e configuração visual por loja | P1 | G |
| F6-9 | Painel da plataforma (lojas, uso, suporte) | P1 | G |
| F6-10 | Exportação e exclusão de dados da loja (LGPD) | P1 | G |

### Fase 7: escala e confiabilidade

| ID | Item | Pri. | Tam. |
|---|---|---|---|
| F7-1 | Homologação com banco próprio e dados sintéticos | P0 | M |
| F7-2 | Redis: limite de requisições, cache, locks (jobs com líder único) | P0 | M |
| F7-3 | Worker como serviço separado | P0 | M |
| F7-4 | Sentry (API e web), métricas, traços, alertas de disponibilidade | P0 | M |
| F7-5 | Cache da vitrine por loja com revalidação sob demanda | P0 | G |
| F7-6 | Teste de carga (k6) no checkout e na listagem | P1 | M |
| F7-7 | Backups com restauração ensaiada e runbooks | P0 | M |
| F7-8 | Meilisearch quando justificar | P2 | G |
| F7-9 | Pentest e revisão de dependências automatizada | P1 | M |

## 10. Dependências externas e decisões do dono

| Item | Para quê | Quando | Observação |
|---|---|---|---|
| Plano pago da API e da vitrine no Render | Sem cold start, mais memória | Agora | Custo mensal; decisão do dono |
| Token do Mercado Pago + segredo do webhook + URL pública da API | PIX automático e depois cartão/boleto | Fase 4 (ou já para o PIX) | Já suportado pelo código |
| Conta em provedor de e-mail (Resend ou SES) e domínio de envio verificado | Fase 3 | Antes da fase 3 | Plano gratuito basta no início |
| Domínio da loja | Vitrine em endereço próprio, e-mails com SPF/DKIM | Fase 3 | |
| Armazenamento de objetos (Cloudflare R2) | Upload de imagens | Fase 2 | Pode começar com o gratuito |
| Sentry | Erros | Fase 0/7 | Plano gratuito |
| Melhor Envio e/ou Correios | Frete real | Fase 5 | Token por loja |
| Bling | ERP/NF-e | Fase 5 | App OAuth no Bling |
| Fidelizei | Fidelidade | Fase 5 | Precisa da documentação/contato da API |
| GA4, GTM, Meta Pixel | Medição | Fase 5 | IDs por loja |

## 11. Como cada fase é entregue

1. Um PR por entrega, com migrations só aditivas e testes (unitário, integração, e navegador quando houver interface).
2. CI verde, merge e publicação automática no Render; verificação em produção pelos logs de implantação.
3. Nenhuma alteração em dados de login existentes; nenhuma semente de produção sem decisão explícita do dono.
4. Cada entrega atualiza este documento (status por ID) e o README.
