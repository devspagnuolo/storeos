import { BadRequestException } from '@nestjs/common';

export const MENU_KEYS = ['main', 'footer'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];
export const MENU_ITEM_TYPES = ['ALL', 'CATEGORY', 'COLLECTION', 'BRAND', 'PAGE', 'LINK'] as const;
export type MenuItemType = (typeof MENU_ITEM_TYPES)[number];

export interface MenuItem { label: string; type: MenuItemType; ref?: string; children?: MenuItem[] }
export interface ResolvedMenuItem { label: string; href: string; children: ResolvedMenuItem[] }

const MAX_ROOT = 30;
const MAX_CHILDREN = 40;
const MAX_DEPTH = 4; // item principal + 3 níveis de subitens, como Categoria > Sub > Sub > Sub
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Links livres só podem ser caminhos da própria loja ou endereços https. */
export const isSafeLink = (value: string) => /^\/(?!\/)[^\s]*$/.test(value) || /^https:\/\/[^\s]+$/.test(value);

function normalize(raw: unknown, depth: number): MenuItem {
  const item = raw as Partial<MenuItem> | null;
  const label = typeof item?.label === 'string' ? item.label.trim() : '';
  if (label.length < 1 || label.length > 40) throw new BadRequestException('Cada item do menu precisa de um nome de até 40 caracteres');
  if (!item?.type || !MENU_ITEM_TYPES.includes(item.type)) throw new BadRequestException(`Tipo inválido no item "${label}"`);
  const type = item.type;
  const ref = typeof item.ref === 'string' ? item.ref.trim() : '';
  if (type === 'LINK' ? !isSafeLink(ref) : type !== 'ALL' && !SLUG.test(ref)) {
    throw new BadRequestException(type === 'LINK' ? `O link de "${label}" deve começar com / ou https://` : `Escolha o destino de "${label}"`);
  }
  const children = Array.isArray(item.children) ? item.children : [];
  if (children.length && depth >= MAX_DEPTH - 1) throw new BadRequestException(`O menu aceita no máximo ${MAX_DEPTH} níveis`);
  if (children.length > MAX_CHILDREN) throw new BadRequestException(`Cada item aceita até ${MAX_CHILDREN} subitens`);
  return { label, type, ...(type !== 'ALL' && { ref }), ...(children.length && { children: children.map(child => normalize(child, depth + 1)) }) };
}

/** Valida e limpa a árvore enviada pelo painel. */
export function normalizeMenu(raw: unknown): MenuItem[] {
  if (!Array.isArray(raw)) throw new BadRequestException('Menu inválido');
  if (raw.length > MAX_ROOT) throw new BadRequestException(`O menu aceita até ${MAX_ROOT} itens`);
  return raw.map(item => normalize(item, 0));
}

export type MenuTargets = { categories: Set<string>; collections: Set<string>; brands: Set<string>; pages: Set<string> };

const PATHS: Record<Exclude<MenuItemType, 'ALL' | 'LINK' | 'PAGE'>, string> = { CATEGORY: '/categorias', COLLECTION: '/colecoes', BRAND: '/marcas' };

/** Converte os itens em endereços da vitrine; destinos que já não existem somem do menu em vez de gerar link quebrado. */
export function resolveMenu(items: MenuItem[], targets: MenuTargets): ResolvedMenuItem[] {
  const exists = (item: MenuItem) => {
    if (item.type === 'ALL' || item.type === 'LINK') return true;
    const set = { CATEGORY: targets.categories, COLLECTION: targets.collections, BRAND: targets.brands, PAGE: targets.pages }[item.type];
    return set.has(item.ref ?? '');
  };
  const href = (item: MenuItem) => {
    if (item.type === 'ALL') return '/categorias';
    if (item.type === 'LINK') return item.ref ?? '/';
    if (item.type === 'PAGE') return `/p/${item.ref}`;
    return `${PATHS[item.type]}/${item.ref}`;
  };
  return items.filter(exists).map(item => ({ label: item.label, href: href(item), children: resolveMenu(item.children ?? [], targets) }));
}
