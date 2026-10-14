# Evolução do painel — 14/10/2026

## Referências públicas e decisão de produto
- [Primeiros passos](https://atendimento.nuvemshop.com.br/pt_BR/primeiros-passos/como-montar-minha-loja-online-passo-a-passo): guiar catálogo, identidade, pagamentos e entregas com pendências visíveis.
- [Layouts em rascunho](https://atendimento.nuvemshop.com.br/pt_BR/01-layout/como-criar-e-editar-o-layout-da-minha-loja-em-rascunho): preparar alterações antes de publicar e recuperar o visual anterior.
- [Gestão de pedidos](https://atendimento.nuvemshop.com.br/pt_BR/minhas-vendas/como-administrar-meus-pedidos-na-pagina-de-vendas): tarefas operacionais e filtros contextualizados.

As referências orientam os fluxos. O código, os textos e o visual do STOREOS são próprios. Esta entrega não declara equivalência funcional com a Nuvemshop.

## Entregue nesta etapa
- Navegação lateral por operação e configuração, com navegação móvel e item ativo.
- /painel/primeiros-passos: cinco etapas calculadas a partir dos dados da loja autenticada. O progresso não é armazenado como uma marca manual.
- /painel/pagamentos: estado da configuração e instruções de validação, sem retornar segredos.
- /painel/site: salvar rascunho, prévia de banner em dois tamanhos, publicar e recuperar publicações como rascunho.
- Controle otimista de concorrência por versão: edição obsoleta recebe 409.
- Histórico imutável de publicações, original preservado na primeira publicação após a migração; exibição das últimas 20 versões.
- Eventos de publicação e gravação de rascunho com ator e versão, na mesma transação.
- Contrato público continua retornando apenas o visual publicado.
- Limite do Next ajustado para aceitar o banner de até 5 MB já suportado pela API.

## Verificação
Testes de integração cobrem privacidade do rascunho, publicação, restauração, autenticação, permissões, isolamento entre lojas, concorrência real, rollback de transação em conflito e progresso calculado com estoque reservado.

## Próximas entregas necessárias
1. Cadastro de lojista com confirmação de e-mail, termos versionados e recuperação de acesso.
2. Conexão de pagamentos por loja com OAuth/segredos isolados; o adaptador atual usa credencial operacional compartilhada.
3. CMS institucional com rascunho, publicação, menus e SEO; blocos reordenáveis e múltiplos temas.
4. Catálogo avançado: variações compráveis, galerias, importação com validação e categorias hierárquicas.
5. Pedidos: separação, expedição, rastreio e pós-venda com transições autorizadas e idempotentes.
6. Bling com OAuth, fila persistente, idempotência, monitoramento e reprocessamento.
7. Clientes/segmentação, cupons e automações com consentimento.
8. MFA funcional, auditoria consultável, testes de isolamento mais amplos, backups com restauração ensaiada e observabilidade.

## Limites
Um rascunho visual por loja nesta etapa. A identidade da marca (nome/logo/favicon) continua publicada pelas configurações existentes. A prévia cobre o banner, não um tema inteiro. Rascunhos sobrescritos não possuem histórico próprio; publicações possuem. A lista de configuração não bloqueia vendas nem certifica prontidão legal, financeira ou logística. Configuração detectada de pagamento não prova validade de credenciais: o guia pede uma compra de teste. O cadastro público e a expansão multiempresa ainda dependem das próximas entregas.
