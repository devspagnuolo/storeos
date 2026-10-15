import { dedupeRecipients, makeUnsubscribeToken, readUnsubscribeToken, renderCampaignMail, validateCampaign } from './campaign-rules';

describe('descadastro', () => {
  it('o token devolve loja e e-mail, e recusa adulteração', () => {
    const token = makeUnsubscribeToken('loja-1', ' Maria@Example.com ');
    expect(readUnsubscribeToken(token)).toEqual({ storeId: 'loja-1', email: 'maria@example.com' });
    const [payload] = token.split('.');
    expect(readUnsubscribeToken(`${payload}.assinatura-falsa`)).toBeUndefined();
    const forged = Buffer.from(JSON.stringify({ s: 'outra', e: 'maria@example.com' })).toString('base64url');
    expect(readUnsubscribeToken(`${forged}.${token.split('.')[1]}`)).toBeUndefined();
    expect(readUnsubscribeToken('lixo')).toBeUndefined();
  });
});

describe('destinatários', () => {
  it('tira duplicados, endereços inválidos e anonimizados', () => {
    const list = dedupeRecipients([{ email: 'A@x.com', name: 'Ana' }, { email: 'a@x.com' }, { email: 'sem-arroba' }, { email: 'anonimo-1@removido.invalid' }, { email: 'b@x.com', name: ' ' }]);
    expect(list).toEqual([{ email: 'a@x.com', name: 'Ana' }, { email: 'b@x.com', name: null }]);
  });
});

describe('mensagem', () => {
  it('valida tamanho e variáveis', () => {
    expect(validateCampaign('Oi', 'texto longo o bastante')).toContain('assunto');
    expect(validateCampaign('Novidades', 'curto')).toContain('mensagem');
    expect(validateCampaign('Novidades', 'Olá {{cupom}}, veja tudo')).toContain('{{cupom}}');
    expect(validateCampaign('Novidades {{nome}}', 'Olá {{nome}}, veja a coleção da {{loja}}')).toBeNull();
  });
  it('troca variáveis, escapa HTML e sempre inclui o descadastro', () => {
    const mail = renderCampaignMail({ subject: '{{nome}}, novidades', body: 'Oi {{nome}}!\n\nVeja <b>tudo</b> em https://loja.com/colecao', storeName: 'Vivi', recipientName: 'Maria Silva', unsubscribeUrl: 'https://loja.com/descadastro/abc' });
    expect(mail.subject).toBe('Maria, novidades');
    expect(mail.html).toContain('&lt;b&gt;tudo&lt;/b&gt;');
    expect(mail.html).toContain('href="https://loja.com/colecao"');
    expect(mail.html).toContain('https://loja.com/descadastro/abc');
    expect(mail.text).toContain('Para não receber mais: https://loja.com/descadastro/abc');
  });
});
