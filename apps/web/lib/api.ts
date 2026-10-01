const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
export async function getProducts(store = 'demo') { const response = await fetch(`${apiUrl}/catalog/products?store=${encodeURIComponent(store)}`, { next: { revalidate: 60 } }); return response.ok ? response.json() : []; }
