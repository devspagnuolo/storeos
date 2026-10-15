/** Saldo do depósito padrão: o que sobra do total depois dos outros depósitos. */
export function defaultQuantity(total: number, others: number[]): number {
  return total - others.reduce((a, b) => a + b, 0);
}

export function slugCode(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

export type TransferPlan = { fromQuantity: number; toQuantity: number };
export type Holding = { id: string; isDefault: boolean; quantity: number };

/** Valida e calcula a transferência; o saldo total da loja não muda. */
export function planTransfer(holdings: Holding[], fromId: string, toId: string, quantity: number): TransferPlan {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Informe uma quantidade inteira maior que zero');
  if (fromId === toId) throw new Error('Escolha depósitos diferentes');
  const from = holdings.find(h => h.id === fromId);
  const to = holdings.find(h => h.id === toId);
  if (!from || !to) throw new Error('Depósito não encontrado');
  if (from.quantity < quantity) throw new Error(`Só há ${Math.max(from.quantity, 0)} unidades no depósito de origem`);
  return { fromQuantity: from.quantity - quantity, toQuantity: to.quantity + quantity };
}

/** Novo saldo do depósito num ajuste manual. */
export function adjustTarget(current: number, mode: 'DELTA' | 'SET', quantity: number): number {
  return mode === 'SET' ? quantity : current + quantity;
}
