import { renderMail, validateTemplate } from './email-templates';

const vars = { nome: 'Maria Silva', loja: 'Loja <Azul>', pedido: 'SO-1', total: 'R$ 99,80' };

describe('modelos de e-mail', () => {
  it('troca as variáveis e some com a linha cuja variável está vazia', () => {
    const mail = renderMail('order-shipped', { ...vars, transportadora: 'Correios' })!;
    expect(mail.text).toContain('Transportadora: Correios');
    expect(mail.text).not.toContain('Código de rastreio');
    expect(mail.text).toContain('Olá, Maria!');
  });

  it('usa a mensagem personalizada, vira link e escapa HTML', () => {
    const mail = renderMail('order-paid', { ...vars, nome: '<b>Zé</b>' }, { override: { subject: 'Oba {{nome}}!', body: 'Pedido {{pedido}} pago.\nAcompanhe https://loja.com/x?a=1&b=2', enabled: true } })!;
    expect(mail.subject).toBe('Oba <b>Zé</b>!');
    expect(mail.html).toContain('&lt;b&gt;Zé&lt;/b&gt;');
    expect(mail.html).toContain('<a href="https://loja.com/x?a=1&amp;b=2"');
    expect(mail.html).toContain('Loja &lt;Azul&gt;');
  });

  it('devolve null quando o aviso está desligado e mantém o rodapé de descadastro', () => {
    expect(renderMail('order-paid', vars, { override: { subject: 'a', body: 'b', enabled: false } })).toBeNull();
    const cart = renderMail('cart-reminder', { ...vars, itens: '- 1x Vaso', link_carrinho: 'https://x.com/r' }, { footer: { text: 'sair: https://x.com/s', html: '<a href="https://x.com/s">sair</a>' } })!;
    expect(cart.text).toContain('sair: https://x.com/s');
    expect(cart.html).toContain('https://x.com/s');
  });

  it('valida variáveis desconhecidas, vazios, tamanho e o link obrigatório do carrinho', () => {
    expect(validateTemplate('order-paid', 'ok', 'Pedido {{pedido}}')).toBeNull();
    expect(validateTemplate('order-paid', 'ok', 'Oi {{cpf}}')).toContain('{{cpf}}');
    expect(validateTemplate('order-paid', 'ok', 'Rastreio {{rastreio}}')).toContain('{{rastreio}}'); // não existe neste e-mail
    expect(validateTemplate('order-paid', '  ', 'x')).toContain('assunto');
    expect(validateTemplate('order-paid', 'ok', 'x'.repeat(2001))).toContain('2000');
    expect(validateTemplate('cart-reminder', 'ok', 'Volte!')).toContain('{{link_carrinho}}');
    expect(validateTemplate('cart-reminder', 'ok', 'Volte: {{link_carrinho}}')).toBeNull();
  });
});
