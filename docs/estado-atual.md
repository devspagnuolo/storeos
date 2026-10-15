# Estado atual do STOREOS (referência única)

Atualizado em 15/10/2026, com base no código em `main` (PRs até #75 e motor de temas). **Este é o documento que orienta novas entregas.** Os outros documentos desta pasta são histórico: o diagnóstico e a avaliação de outubro descrevem uma loja que ainda não vendia, e as análises de paridade partem de um painel bem menor que o atual. Onde houver conflito, vale este documento e o código.

Legenda: ✅ pronto e testado · 🟡 parcial (o que falta está na coluna ao lado) · ❌ não existe · ⏳ depende de dados, contas ou credenciais do lojista.

## Vitrine e compra

| Área | Estado | Observação |
|---|---|---|
| Catálogo: produtos, variações (cor/tamanho), categorias em até 4 níveis, marcas, coleções, imagens múltiplas | ✅ | Importação/exportação por planilha; dados fiscais (NCM, CEST, GTIN, origem, unidade) |
| Página de produto, busca, carrinho, conta, acompanhar pedido (número + e-mail) | ✅ | |
| Checkout com reserva de estoque, cupom, promoções automáticas, frete por CEP | ✅ | Frete: SuperFrete/Melhor Envio, precisa de token e CEP de origem |
| Pagamento: PIX e boleto (Mercado Pago), cartão (Rede ou Mercado Pago) | 🟡 ⏳ | Exige credenciais; reembolso por gateway só no Mercado Pago |
| Avaliações de produtos com moderação e estrelas no Google | ✅ | Sem foto na avaliação; estrelas só na página do produto |
| Redirecionamentos 301, SEO, sitemap, JSON-LD, GA4/GTM/Meta Pixel | ✅ | Sem blog; sem Conversions API do Meta; redirecionamento só por caminho exato |
| Feeds Google Shopping e Meta (Instagram/Facebook) | ✅ | Marketplaces (Mercado Livre, Shopee) ❌ |
| Domínio próprio por loja, vitrine escolhe a loja pelo domínio | ✅ ⏳ | Exige DNS e o domínio cadastrado na hospedagem |

## Editor da loja

| Recurso | Estado | Observação |
|---|---|---|
| Rascunho, prévia privada, publicar, histórico e restaurar versão | ✅ | |
| Layout familiar: páginas à esquerda, prévia no centro, configurações do elemento ao lado | ✅ | |
| Seções da página inicial (adicionar, mover, ocultar, duplicar, remover) | ✅ | |
| Seções nas páginas de categoria e de produto (abaixo do conteúdo fixo) | ✅ | O conteúdo fixo (lista, detalhes do produto) não é reordenável; a prévia dessas páginas usa um exemplo |
| Páginas institucionais | 🟡 | Texto editado em Páginas; ainda sem seções próprias |
| Escolha visual de produtos já cadastrados nas seções | ✅ | Guarda só os ids; até 24 por seção; produto despublicado some da loja |
| Menus, banners, WhatsApp, páginas institucionais, newsletter | ✅ | |
| Motor de temas (biblioteca, instalação, rascunho, publicar a página inicial) | 🟡 | Recurso avançado em `/painel/site/temas`; desenha só a página inicial e, quando publicado, substitui o editor nela. Veja `avaliacao-total-2026-10-15.md` |
| Temas prontos (6: Essencial, Elegante, Vibrante, Natural, Tecnologia, Gourmet) | ✅ | Em `/painel/site/temas`; aplicam visual + seções de início, categoria e produto ao **rascunho** (logo preservada), sem publicar |
| Assistente único de criação (`/painel/criar-minha-loja`): marca → tema → produtos → pagamento/entrega → publicar | ✅ | Reaproveita as telas e o estado do passo a passo; nada vai ao ar antes do último passo |
| Loja sem domínio próprio via subdomínio (`slug.STORE_BASE_DOMAIN`) | 🟡 ⏳ | Pronto no código; exige DNS curinga e a variável `STORE_BASE_DOMAIN` na API e na loja |

## Operação

| Área | Estado | Observação |
|---|---|---|
| Pedidos: fluxo logístico, pedido manual, reembolso, devolução, linha do tempo | ✅ | Pedido manual sem frete/CEP nem cupom |
| Estoque: histórico de movimentos, estoque baixo, vários depósitos e transferências | 🟡 | O pedido não escolhe de qual depósito sai |
| Bling: pedidos, notas fiscais, webhooks, importação com escolha de produtos, fotos padronizadas, estoque, rastreio | 🟡 ⏳ | Estoque do Bling a cada 10 min; vários formatos não validados em conta real |
| Clientes (CRM 360), notas, etiquetas, exportação, anonimização (LGPD) | ✅ | Sem segmentos salvos |
| Carrinho abandonado (um lembrete), modelos de e-mail editáveis | ✅ ⏳ | E-mail real exige Resend com domínio verificado |
| Cupons, campanhas de cupons em lote, promoções | ✅ | |
| Campanhas de e-mail, automações (quando acontecer X, fazer Y), fidelidade configurável | 🟡 ⏳ | Só texto; automações só com gatilhos de pedido; pontos não vencem e o cliente não resgata sozinho |
| Relatórios de vendas com comparação e exportação | 🟡 | Sem visitas/conversão (não há coleta de acessos) |
| Diagnóstico (variáveis, frete, pagamentos), auditoria imutável, MFA, sessões | ✅ | |

## Plataforma (SaaS)

| Área | Estado | Observação |
|---|---|---|
| Várias lojas isoladas por `storeId`, papéis e permissões | ✅ | Papéis ainda globais, não por loja |
| Criar conta e loja sozinho, confirmar e-mail (`/criar-loja`) | 🟡 ⏳ | Desligado até `SIGNUP_ENABLED=true` e `PUBLIC_SITE_URL`; e-mail real exige Resend; a vitrine de loja nova precisa de domínio próprio |
| Passo a passo: dados básicos, loja "em construção" e botão Publicar | ✅ | Marca, tema e produtos seguem nas telas atuais, ligados pelo checklist de Primeiros passos |
| Planos, cobrança e limites | ❌ | Decisão do dono: por enquanto não haverá planos |
| App marketplace, IA para descrições | ❌ | |

## Próximas entregas, em ordem

1. **Temas prontos** (vários modelos completos) e seções nas páginas institucionais.
2. **Assistente único** de criação de loja (marca, tema e produtos em uma sequência só) e vitrine de loja nova sem depender de domínio próprio.
3. Estrelas nos cards, aviso de nova avaliação, bônus de aniversário e resgate de pontos pelo cliente.
4. Marketplaces, quando houver contas de desenvolvedor e credenciais.

## Pendências que dependem do lojista

Domínio e DNS; credenciais de pagamento (Mercado Pago, Rede); Resend com domínio de e-mail verificado e `MAIL_FROM`; `PUBLIC_SITE_URL` e `API_PUBLIC_URL`; IDs do Google Analytics e do Meta Pixel; token do SuperFrete e CEP de origem; permissões do aplicativo no painel do Bling; textos das páginas legais; senha inicial a trocar.
