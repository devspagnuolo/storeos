'use server';
import { apiUrl } from '../../lib/config';
import { resolveStoreSlug } from '../../lib/store-host';

export type TrackedOrder = {
  number: string; status: string; statusLabel: string; createdAt: string;
  items: { name: string; quantity: number }[];
  timeline: { status: string; label: string; at: string }[];
  tracking: { carrier: string | null; code: string; url: string | null; shippedAt: string | null; deliveredAt: string | null } | null;
};
export type TrackState = { order?: TrackedOrder; error?: string; number?: string; email?: string };

/** Consulta pública: o servidor da loja repassa número e e-mail à API, que só responde se os dois baterem. */
export async function trackOrderAction(_: TrackState, form: FormData): Promise<TrackState> {
  const number = String(form.get('number') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  if (!number || !email) return { error: 'Informe o número do pedido e o e-mail da compra.', number, email };
  try {
    const params = new URLSearchParams({ store: await resolveStoreSlug(), number, email });
    const response = await fetch(`${apiUrl}/order-tracking?${params}`, { cache: 'no-store' });
    if (response.status === 429) return { error: 'Muitas consultas. Tente de novo em um minuto.', number, email };
    if (!response.ok) return { error: 'Pedido não encontrado. Confira o número e o e-mail usado na compra.', number, email };
    return { order: await response.json(), number, email };
  } catch {
    return { error: 'Não foi possível consultar agora. Tente novamente em instantes.', number, email };
  }
}
