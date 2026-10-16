'use server';
import { accountFetch } from '../../lib/account/session';
import type { AccountAddress } from '../../lib/account/types';

export type SignedInCustomer = { name: string; email: string; phone: string | null; document: string | null; address: AccountAddress | null };

/** Cliente com sessão em "Minha conta": devolve os dados para o checkout pular CPF e e-mail. Sem sessão (ou expirada), null. */
export async function signedInCustomerAction(): Promise<SignedInCustomer | null> {
  return accountFetch<SignedInCustomer>('/checkout').catch(() => null);
}
