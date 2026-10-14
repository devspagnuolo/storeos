/**
 * Seed idempotente da loja "demo": categorias, produtos com imagem e estoque, papel de dono e usuário admin.
 * Uso: pnpm --filter @storeos/api db:seed (requer DATABASE_URL).
 */
import { PrismaClient, ProductStatus } from '@prisma/client';
import { ensureStoreWithOwner } from '../src/shared/access/store-owner';

const prisma = new PrismaClient();

const categories = [
  { slug: 'casa', name: 'Casa', description: 'Peças que deixam o dia a dia mais bonito.' },
  { slug: 'cozinha', name: 'Cozinha', description: 'Utensílios duráveis para cozinhar bem.' },
  { slug: 'moda', name: 'Moda', description: 'Básicos atemporais e acessórios.' },
  { slug: 'bem-estar', name: 'Bem-estar', description: 'Autocuidado e momentos de pausa.' },
];

const products = [
  { sku: 'CASA-001', slug: 'manta-trico-areia', name: 'Manta de tricô areia', price: '189.90', stock: 25, category: 'casa', description: 'Manta de algodão em tricô grosso, 130 x 170 cm.' },
  { sku: 'CASA-002', slug: 'vaso-ceramica-terracota', name: 'Vaso de cerâmica terracota', price: '129.00', stock: 18, category: 'casa', description: 'Vaso artesanal com acabamento fosco, 25 cm de altura.' },
  { sku: 'CASA-003', slug: 'luminaria-mesa-linho', name: 'Luminária de mesa com cúpula de linho', price: '249.90', stock: 10, category: 'casa', description: 'Base de madeira maciça e cúpula de linho natural.' },
  { sku: 'COZ-001', slug: 'panela-ferro-fundido-24', name: 'Panela de ferro fundido 24 cm', price: '399.00', stock: 12, category: 'cozinha', description: 'Ferro fundido esmaltado, vai do fogão ao forno.' },
  { sku: 'COZ-002', slug: 'jogo-facas-chef', name: 'Jogo de facas do chef (3 peças)', price: '289.90', stock: 15, category: 'cozinha', description: 'Aço inox alemão com cabo ergonômico.' },
  { sku: 'COZ-003', slug: 'tabua-madeira-teca', name: 'Tábua de madeira teca', price: '119.90', stock: 30, category: 'cozinha', description: 'Teca de reflorestamento, 40 x 28 cm.' },
  { sku: 'MODA-001', slug: 'camiseta-algodao-organico', name: 'Camiseta de algodão orgânico', price: '89.90', stock: 60, category: 'moda', description: 'Modelagem reta, algodão orgânico certificado.' },
  { sku: 'MODA-002', slug: 'bolsa-couro-caramelo', name: 'Bolsa de couro caramelo', price: '459.00', stock: 8, category: 'moda', description: 'Couro legítimo curtido ao vegetal, alça regulável.' },
  { sku: 'MODA-003', slug: 'oculos-sol-classico', name: 'Óculos de sol clássico', price: '219.90', stock: 20, category: 'moda', description: 'Lentes polarizadas com proteção UV400.' },
  { sku: 'BEM-001', slug: 'kit-velas-aromaticas', name: 'Kit de velas aromáticas', price: '99.90', stock: 40, category: 'bem-estar', description: 'Três velas de cera vegetal: lavanda, cedro e laranja.' },
  { sku: 'BEM-002', slug: 'tapete-yoga-natural', name: 'Tapete de yoga em borracha natural', price: '279.00', stock: 14, category: 'bem-estar', description: 'Antiderrapante, 183 x 61 cm, 4 mm.' },
  { sku: 'BEM-003', slug: 'difusor-aromas-bambu', name: 'Difusor de aromas em bambu', price: '149.90', stock: 0, category: 'bem-estar', description: 'Difusor ultrassônico com luz ambiente. Produto esgotado para testar a vitrine.' },
];

async function main() {
  const { store, user } = await ensureStoreWithOwner(prisma, {
    storeSlug: 'demo',
    storeName: 'Loja Demo',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@demo.storeos.dev',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'demo-admin-123',
    ownerName: 'Administrador Demo',
  });

  const categoryIds = new Map<string, string>();
  for (const [position, category] of categories.entries()) {
    const row = await prisma.category.upsert({ where: { storeId_slug: { storeId: store.id, slug: category.slug } }, create: { ...category, position, storeId: store.id }, update: { name: category.name, description: category.description, position } });
    categoryIds.set(category.slug, row.id);
  }

  for (const { stock, category, ...data } of products) {
    const product = await prisma.product.upsert({
      where: { storeId_sku: { storeId: store.id, sku: data.sku } },
      create: { ...data, storeId: store.id, status: ProductStatus.ACTIVE },
      update: { name: data.name, price: data.price, description: data.description, status: ProductStatus.ACTIVE },
    });
    const categoryId = categoryIds.get(category)!;
    await prisma.productCategory.upsert({ where: { productId_categoryId: { productId: product.id, categoryId } }, create: { productId: product.id, categoryId }, update: {} });
    if (!(await prisma.productImage.count({ where: { productId: product.id } }))) {
      await prisma.productImage.create({ data: { productId: product.id, url: `https://picsum.photos/seed/${data.slug}/800/800`, alt: data.name } });
    }
    // Estoque só é definido na criação para não sobrescrever vendas e reservas reais.
    const inventory = await prisma.inventory.findFirst({ where: { storeId: store.id, productId: product.id, variantId: null } });
    if (!inventory) await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: stock } });
  }

  if (!(await prisma.shippingRule.count({ where: { storeId: store.id } }))) {
    await prisma.shippingRule.createMany({ data: [
      { storeId: store.id, name: 'Expresso Sudeste', states: ['ES', 'MG', 'RJ', 'SP'], price: '19.90', freeAbove: '299.00', minDays: 1, maxDays: 3, position: 0 },
      { storeId: store.id, name: 'Econômico', states: [], price: '29.90', freeAbove: '499.00', minDays: 5, maxDays: 12, position: 1 },
    ] });
  }

  console.log(`Loja demo pronta: ${products.length} produtos, ${categories.length} categorias, admin ${user.email}`);
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
