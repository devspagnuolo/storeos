# Jornada de cadastro do lojista STOREOS

O cadastro deve seguir um assistente curto, em etapas, como nas plataformas de e-commerce SaaS. O lojista entende o que precisa preencher e pode concluir a identidade da loja sem interromper a criação do catálogo.

## 1. Criar acesso

Campos obrigatórios: nome do responsável, e-mail, senha forte e aceite dos termos e da política de privacidade. Confirmar o e-mail antes de liberar o painel e evitar a criação de contas com endereços que o usuário não controla.

## 2. Conhecer o negócio

Campos: nome da loja, segmento, país/moeda e estágio de operação (vou começar agora, já vendo online, já vendo em loja física). CNPJ, telefone comercial, domínio e volume de vendas ficam opcionais ou podem ser preenchidos depois.

O endereço provisório é sugerido automaticamente a partir do nome, com disponibilidade validada antes de avançar. O lojista pode editar o identificador antes de criar a loja; depois, mudanças exigem redirecionamentos para preservar links e SEO.

## 3. Identidade visual

Permitir enviar logo PNG, JPG, WebP ou ICO (até 1 MB), mostrar prévia em fundo claro e escuro e permitir substituir/remover. Ao salvar, a plataforma usa o mesmo arquivo como favicon inicial e exibe a marca na vitrine e no painel. O lojista pode trocar o favicon por um arquivo quadrado mais tarde.

## 4. Criar loja e orientar a configuração

Criar a loja em estado de rascunho e mostrar uma lista de conclusão no painel: cadastrar primeiro produto, configurar pagamento, configurar entrega, revisar dados comerciais e publicar a vitrine. Manter progresso salvo para o lojista poder sair e continuar depois.

## Estado atual

O painel já oferece login, edição do nome, catálogo, pedidos e regras de frete. A criação pública de conta/loja e a verificação de e-mail ainda não estão implementadas. A primeira entrega desta jornada adiciona logo e favicon à configuração da loja, com armazenamento de objetos no Cloudflare R2; o assistente público deverá ser construído sobre essas etapas e não deve liberar contas antes de validar o e-mail.
