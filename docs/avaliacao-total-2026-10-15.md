# Avaliação total do STOREOS (15/10/2026)

Base: `main` no commit 3b2c24c (motor de temas), com o que está publicado hoje. Verificado nesta data, do zero: migrações aplicadas em banco novo, API (`tsc`, `eslint`, 280 testes unitários), 161 testes de integração (160 passam; o único que falha é o de autenticação do webhook do Bling, que falha só no ambiente local e passa no CI), web (`tsc`, `next lint`) e CI verde.

## Em números
- 127 commits, 52 migrações, 63+ modelos, 48 suítes unitárias e 46 de integração.
- Tudo isolado por loja (`storeId`) e protegido por permissões; vitrine pública sem acesso a rascunhos.

## O que está pronto e funcionando
- **Venda ponta a ponta**: catálogo com variações, carrinho, checkout com reserva de estoque, cupons, promoções, frete por CEP, PIX/boleto/cartão (precisam de credenciais), pedidos com fluxo logístico, reembolso e devolução.
- **Operação**: estoque com histórico e vários depósitos, clientes (CRM, LGPD), Bling (pedidos, notas, estoque, importação com escolha de produtos), relatórios, automações, avaliações com moderação.
- **Crescimento**: SEO, sitemap, redirecionamentos 301, GA4/GTM/Meta Pixel, feeds Google e Meta.
- **Criação de loja**: cadastro com confirmação de e-mail (desligado até `SIGNUP_ENABLED=true`), passo a passo em Primeiros passos, loja "em construção" até publicar.
- **Editor**: páginas à esquerda, prévia no centro, ajustes à direita; seções em início, categoria e produto; escolha visual de produtos; rascunho, publicação, histórico e restauração.

## Parcial ou dependente de você
- Credenciais e contas: Mercado Pago/Rede, SuperFrete (token e CEP de origem), Resend (domínio verificado), Bling (permissões), GA/Meta, DNS do domínio.
- A vitrine de uma loja nova só aparece em domínio próprio (a vitrine escolhe a loja pelo endereço).
- Páginas institucionais ainda sem seções; prévia de categoria/produto usa um exemplo.
- Sem marketplaces (Mercado Livre, Shopee), blog, IA para descrições, segmentos salvos de clientes.

## Riscos encontrados
1. **Dois sistemas de vitrine em paralelo.** O motor de temas (commit 3b2c24c, publicado direto em `main`) tem editor e publicação próprios, mas só desenha a **página inicial**. Se um tema do motor for publicado, a página inicial passa a ignorar o editor atual (escolha de produtos, prévia, histórico, visual), enquanto categoria e produto continuam no sistema antigo. **Mitigado (16/10):** o painel agora avisa em Personalizar loja quando a página inicial está sob um tema avançado e permite voltar ao editor com um clique (`POST /themes/installations/:id/deactivate`); a vitrine só usa publicações de instalações ativas. Recomendação: o fluxo principal do lojista (temas prontos, assistente, editor) segue no sistema atual; o motor fica como recurso avançado até haver convergência planejada.
2. **Aviso desatualizado** na tela de Temas dizia que a publicação do motor não estava ligada; ela está. Corrigido neste PR.
3. **Motor sem restauração de publicação anterior e sem prévia privada.** Os testes de integração agora cobrem instalação, conflito de edição, rejeição de componente inválido, publicação, desativação e isolamento entre lojas.
4. **Commits direto em `main` pulam o CI.** Desta vez o resultado estava saudável, mas nada garante isso. Recomendação: ligar proteção de branch exigindo o check `validate` (configuração do GitHub, a cargo do dono do repositório): Settings → Branches → Add rule para `main` → marcar “Require status checks to pass” e escolher `validate`.
5. **Duas migrações com o mesmo carimbo** (`20261016030000_onboarding` e `20261016030000_theme_engine_foundation`). Funciona (a ordem é alfabética e elas não dependem entre si), mas novas migrações devem ter carimbo único.
6. Itens operacionais conhecidos: e-mail real depende de domínio verificado no Resend; webhook do Bling validado só com amostras.

## Próximos passos (em andamento)
Temas prontos sobre o editor atual e assistente único de criação de loja (marca, tema e produtos em sequência).
