export const whatsappLink = (number: string, message?: string | null) => `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
