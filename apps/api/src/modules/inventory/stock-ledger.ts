import { Prisma, StockMovementType } from '@prisma/client';

export interface MovementInput {
  storeId: string;
  productId: string;
  variantId?: string | null;
  type: StockMovementType;
  delta: number;
  reason?: string;
  orderNumber?: string;
  actorId?: string;
}

/** Registra um lançamento no razão de estoque com o saldo físico atual (leia depois de alterar o saldo, na mesma transação). */
export async function recordMovement(tx: Prisma.TransactionClient, input: MovementInput) {
  if (input.delta === 0) return;
  const variantId = input.variantId ?? null;
  const row = await tx.inventory.findFirst({ where: { storeId: input.storeId, productId: input.productId, variantId } });
  await tx.stockMovement.create({ data: { ...input, variantId, balance: row?.quantity ?? 0 } });
}

/** Linhas do CSV de estoque (RFC 4180, separador ";" e BOM para abrir direto no Excel brasileiro). */
export function toCsv(rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    let text = String(value);
    // Evita que o Excel interprete o conteúdo como fórmula.
    if (/^[=+\-@]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
    return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
