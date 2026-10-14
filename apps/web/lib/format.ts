const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatPrice = (value: number | string) => brl.format(Number(value));

/** Converte "49.90" em centavos para somar valores sem erro de ponto flutuante. */
export const toCents = (value: number | string) => Math.round(Number(value) * 100);
