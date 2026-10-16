# Theme Engine — inventário, proteção e rollback (Fase 0)

Levantamento de 2026-10-16 do que existe hoje para a aparência da loja, o que cada fluxo grava
e como voltar atrás. Complementa `theme-engine-architecture.md` (modelo-alvo).

## 1. Fluxos atuais

| Fluxo | Onde | API | O que grava | Afeta a loja publicada? |
|---|---|---|---|---|
| Editor "Personalizar loja" | `/painel/site` (`StorefrontBuilder`) | `GET /store/storefront`, `PATCH /store/storefront/draft` | `Store.draftThemeConfig`, `Store.storefrontVersion` (+1, controle otimista, 409) | Não |
| Publicar no editor | `/painel/site` | `POST /store/storefront/publish` | `Store.themeConfig`, limpa o rascunho, `storefrontPublishedAt`, nova `StorefrontPublication` (a primeira publicação guarda também a versão 0 anterior) | Sim: todas as páginas |
| Restaurar versão | `StorefrontHistory` | `POST /store/storefront/restore` | Copia `StorefrontPublication.config` para o **rascunho** | Não (só depois de publicar) |
| Comparar versão | `StorefrontHistory` | `GET /store/storefront/publications/:id` | Leitura | Não |
| Tema pronto | `/painel/site/temas` (galeria) e assistente | `GET /store/storefront/themes`, `POST /store/storefront/themes/apply` | Rascunho do editor (`draftThemeConfig`), mantém logo/favicon | Não |
| Tema avançado: atualizar versão | `/painel/site/temas` ("Atualizar para a versão …") | `POST /themes/installations/:id/upgrade` | Nova `ThemeInstallation` (INACTIVE) da versão mais nova com o rascunho convertido (`theme-upgrade.ts`: mantém cores, textos, ordem; campos novos com o padrão) | Não |
| Tema avançado: instalar | `/painel/site/temas` | `POST /themes/installations` | `ThemeInstallation` (INACTIVE) + `ThemeDraft` com o layout inicial do release | Não (coberto por teste) |
| Tema avançado: editar | `/painel/site/temas/[id]` | `GET/PATCH /themes/installations/:id/draft` | `ThemeDraft.document`, `revision` (+1, 409) | Não |
| Tema avançado: publicar | idem | `POST /themes/installations/:id/publish` | `ThemeEnginePublication` (versão, hash sha256, autor), instalação ACTIVE (as demais ficam INACTIVE) | Sim, **só a página inicial**, e só com a chave ligada (seção 3) |
| Tema avançado: desativar | `/painel/site` e temas | `POST /themes/installations/:id/deactivate` | Instalação INACTIVE; publicações ficam no histórico | Sim: a home volta ao editor |
| Verificar rascunho | `/painel/site/temas/[id]` | `POST /themes/installations/:id/validate` | Leitura | Não |
| Comparar com o publicado | idem | `GET /themes/installations/:id/published` | Leitura: última publicação da instalação; o editor lista as mudanças e mostra as prévias lado a lado (`/previa/tema/:id?fonte=publicado`) | Não |
| Versões do tema | idem | `GET /themes/publications`, `POST /themes/publications/:id/restore` | Restaurar copia a versão para o `ThemeDraft` (revisão +1, 409) | Não |
| Situação | `/painel/site`, temas | `GET /themes/status` (novo) | Leitura: quem desenha cada página e se a publicação avançada está liberada | Não |

Runtime público (com a chave ligada, desde a Fase 2): cores/fonte/botões do tema em toda a loja via `engineStyle`; home pelo `ThemeEngineHome`; categoria, produto, busca, carrinho (título, texto do botão, cálculo de frete), páginas de conteúdo `/p/...` (largura, título, data de atualização), blog `/blog` (título, artigos por página), artigo `/blog/...` (autor, data) e página 404 (título, mensagem, botão) leem as opções do tema via `lib/theme-engine.ts` e escondem as seções extras do editor legado nessas páginas. Preço, estoque, opções e compra nunca mudam por tema.

`GET /store/public/:slug` devolve `themeConfig` (editor) e `publishedTheme`
(Theme Engine). `app/page.tsx` usa `ThemeEngineHome` quando há `publishedTheme`, senão `StorefrontHome`.
Sem tema avançado publicado, todas as páginas seguem `themeConfig`. O texto das páginas e dos artigos vem sempre do painel (Páginas e Blog); o tema só decide a apresentação.

## 2. Situação em produção (consulta somente leitura, 2026-10-16)

| Loja | Editor (versão) | Rascunho do editor | Publicações do editor | Tema avançado | Publicações avançadas |
|---|---|---|---|---|---|
| `loja` | 64 | sim | 4 | 1 instalação INACTIVE | 0 |

Conclusão: a única loja usa o editor "Personalizar loja"; o tema avançado nunca foi publicado.
Ligar a chave abaixo desligada não muda nada do que os clientes veem hoje.

## 3. Chave de proteção

Variável do serviço da API: `THEME_ENGINE_PILOT_STORES`.

- vazia ou ausente (padrão): nenhuma loja publica tema avançado e a vitrine ignora publicações avançadas;
- `loja-a,loja-b`: só essas lojas (slug);
- `*`: todas.

Efeitos com a chave desligada para a loja:
- `POST /themes/installations/:id/publish` responde 403 com mensagem amigável; rascunhos continuam salvos;
- `GET /store/public/:slug` devolve `publishedTheme: null`, a home volta ao editor;
- o painel esconde "Publicar na loja" no editor avançado e explica que a publicação está em teste.

Nada é apagado: instalações, rascunhos e `ThemeEnginePublication` permanecem.

## 4. Fallback e rollback

1. **Tema avançado com problema numa loja piloto:** em Personalizar loja, "Voltar a usar este editor
   na página inicial" (desativa a instalação). Efeito imediato, sem perda de dados.
2. **Problema geral no runtime avançado:** esvaziar `THEME_ENGINE_PILOT_STORES` no Render e reiniciar a
   API. Todas as lojas voltam ao editor na hora.
3. **Publicação ruim no editor:** Histórico → Restaurar a versão anterior (vira rascunho) → Publicar.
4. **Código:** reverter o PR no GitHub; o deploy automático do `main` volta à versão anterior. As
   migrações desta fase são nenhuma (sem mudança de banco).

## 5. Testes de regressão

- `test/theme-engine.int-spec.ts`: instalar não altera `themeConfig`, `draftThemeConfig` nem
  `storefrontVersion`; publicar bloqueado fora do piloto; a vitrine ignora o tema avançado ao
  desligar a chave e devolve o `themeConfig` original; status de quem controla cada página.
- `test/storefront.int-spec.ts` e `test/storefront-themes.int-spec.ts`: rascunho, publicar,
  restaurar, conflito 409 e temas prontos do editor (já existentes).
- `src/modules/store/theme-engine-flag.spec.ts`: regras da chave.

Telas: `responsive` (Playwright, manual) confere que nenhuma página pública ou do painel passa da largura em 360px e 768px.

Pendente: capturas de tela de referência automatizadas (o CI ainda não tem navegador). Hoje as
capturas são feitas manualmente com Playwright antes de cada fase.

## 6. Status das fases

| Fase | Situação |
|---|---|
| 0 — inventário e proteção | Feito (este documento, chave, testes). Capturas automáticas no CI pendentes |
| 1 — jornada unificada | Feito: uma entrada "Personalizar loja" no menu, "Trocar tema" leva à escolha, instalar abre direto o rascunho, quadro "Quem desenha cada página", rascunhos com "Continuar editando", publicação avançada só com chave |
| 2 — prévia real de todas as páginas | Feito: prévia privada `/previa/tema/:id?pagina=inicio|categoria|produto|busca|carrinho|conteudo|blog|artigo|erro` desenhada pelas mesmas páginas da vitrine com dados reais; o tema publicado aplica cores, fonte e botões em toda a loja e as opções de categoria (título, subtítulo, itens por página), produto (descrição, SKU, texto do botão), busca (título, itens por página), carrinho, páginas de conteúdo, blog (novo: Painel → Blog, artigos em `/blog`) e 404. Feito |
| 3 — inspetor por schema, seletores | Em andamento: campos gerados do schema com rótulos, limites e contador; seletor de imagem (envio para a biblioteca de mídia ou endereço); seletor de link (categorias, coleções, páginas ou endereço próprio); avisos da verificação ao lado do campo; desfazer/refazer (Ctrl+Z / Ctrl+Y); salvamento automático do rascunho com aviso de conflito (409); clicar na prévia seleciona a seção; prévia em computador, tablet e celular; editor utilizável no celular (abas Editar/Prévia, nada passa da largura da tela). configurações por tamanho de tela na versão 1.1 ("Mostrar em" celular/computador, colunas no celular e no computador, imagem e alinhamento do banner no celular), seguidas também pelo esboço no modo Celular. Adicionar/remover seções permitidas pelo tema. Falta: biblioteca de seções reutilizáveis |
| 4 — validação, histórico, comparação, rollback do motor | Em andamento: `POST /themes/installations/:id/validate` (erros + avisos de conteúdo, acessibilidade/contraste WCAG AA e SEO) mostrado no editor e lembrado ao publicar; `GET /themes/publications` e `POST /themes/publications/:id/restore` (volta como rascunho com revisão, nunca publica); URLs para rede interna/privada bloqueadas no contrato. comparação publicado × rascunho (lista de mudanças em português e prévias reais lado a lado). Falta: agendamento |
| 5 — catálogo curado | Feito: migração `20261016180000_theme_catalog` com StoreOS Editorial 1.1.0, Boutique Clássica e Vitrine Vibrante; a galeria mostra só a versão mais nova de cada tema com miniatura das cores e da fonte; quem tem versão antiga vê "Atualizar para a versão …" (vira rascunho, nunca publica). Releases são imutáveis. Temas enterprise (migração `20261016190000_theme_enterprise`): Enterprise Pro, Mercado Total e Premium Fashion, com seções novas para início e landing (carrossel de banners, faixa de benefícios, banners promocionais, depoimentos, perguntas frequentes, vídeo do YouTube/Vimeo, texto livre, newsletter) e vitrines ligadas a uma categoria ou coleção com "Ver todos". No editor dá para adicionar e remover seções que o tema permite (até 30 por página). Editor único (migração `20261016200000_theme_unified_editor`): a versão mais nova de todos os temas tem exatamente as mesmas seções e campos (Editorial 1.2, Boutique 1.1, Vitrine 1.1, enterprise 1.1 e os 12 temas prontos do editor clássico convertidos); o Banner principal aceita vários banners (vira carrossel); "Trazer minha loja atual" (`POST /themes/installations/from-storefront`) converte visual, aviso, banners ativos e seções do editor clássico em rascunho do pacote interno `storeos-minha-loja`, sem publicar. Onde o tema avançado publica, a galeria mostra só o catálogo único |
