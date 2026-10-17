/** Menu do painel agrupado pela finalidade: cada seção abre um submenu. */
export const NAV_SECTIONS: { id: string; label: string; icon: 'home' | 'orders' | 'products' | 'megaphone' | 'palette' | 'truck' | 'gear'; items: [href: string, label: string][] }[] = [
  { id: 'inicio', label: 'Início', icon: 'home', items: [['/painel', 'Visão geral'], ['/painel/criar-minha-loja', 'Criar minha loja'], ['/painel/primeiros-passos', 'Primeiros passos']] },
  { id: 'vendas', label: 'Vendas', icon: 'orders', items: [['/painel/pedidos', 'Pedidos'], ['/painel/clientes', 'Clientes'], ['/painel/carrinhos', 'Carrinhos abandonados'], ['/painel/relatorios', 'Relatórios']] },
  { id: 'catalogo', label: 'Catálogo', icon: 'products', items: [['/painel/produtos', 'Produtos'], ['/painel/estoque', 'Estoque'], ['/painel/estoque/depositos', 'Depósitos'], ['/painel/categorias', 'Categorias'], ['/painel/colecoes', 'Coleções e marcas'], ['/painel/avaliacoes', 'Avaliações']] },
  { id: 'marketing', label: 'Marketing', icon: 'megaphone', items: [['/painel/promocoes', 'Promoções'], ['/painel/cupons', 'Cupons'], ['/painel/campanhas', 'Campanhas de e-mail'], ['/painel/automacoes', 'Automações'], ['/painel/newsletter', 'Newsletter'], ['/painel/fidelidade', 'Fidelidade (pontos)'], ['/painel/fidelizei', 'Fidelizei'], ['/painel/seo', 'Google e anúncios (SEO)'], ['/painel/vitrines', 'Google Shopping e Instagram']] },
  { id: 'aparencia', label: 'Aparência da loja', icon: 'palette', items: [['/painel/site', 'Personalizar loja'], ['/painel/menus', 'Menus'], ['/painel/rodape', 'Rodapé'], ['/painel/banners', 'Banners e WhatsApp'], ['/painel/paginas', 'Páginas'], ['/painel/blog', 'Blog'], ['/painel/emails', 'E-mails']] },
  { id: 'operacao', label: 'Operação', icon: 'truck', items: [['/painel/frete', 'Entregas'], ['/painel/pagamentos', 'Pagamentos'], ['/painel/bling', 'Bling (ERP)']] },
  { id: 'sistema', label: 'Configurações', icon: 'gear', items: [['/painel/configuracoes', 'Configurações gerais'], ['/painel/dominios', 'Domínio e publicação'], ['/painel/redirecionamentos', 'Endereços antigos (301)'], ['/painel/seguranca', 'Segurança'], ['/painel/diagnostico', 'Diagnóstico'], ['/painel/auditoria', 'Auditoria']] },
];
export const ALL_LINKS = NAV_SECTIONS.flatMap(section => section.items.map(([href, label]) => ({ href, label, section: section.label })));

/** O link mais específico vence: em /painel/estoque/depositos fica ativo "Depósitos", não "Estoque". */
export function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of ALL_LINKS) {
    const match = pathname === href || (href !== '/painel' && pathname.startsWith(href + '/'));
    if (match && (!best || href.length > best.length)) best = href;
  }
  return best;
}

