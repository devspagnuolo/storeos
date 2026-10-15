'use client';
import { useEffect } from 'react';
import { track } from '../lib/track';

/** Registra a visualização de um produto (view_item) uma vez por abertura da página. */
export function TrackView({ id, name, price }: { id: string; name: string; price: number }) {
  useEffect(() => { track('view_item', { value: price, items: [{ id, name, price }] }); }, [id, name, price]);
  return null;
}
