import Link from 'next/link';
import { ProductImportForm } from '../../../../../components/admin/product-import-form';

export default function ImportProductsPage() {
  return (
    <>
      <Link href="/painel/produtos" className="text-sm text-brand">← Produtos</Link>
      <h1 className="mt-2 text-3xl font-bold">Importar produtos</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">Traga o catálogo de outra loja, como a Nuvemshop, por planilha CSV. Em cada produto já existente (pelo identificador da URL) o preço, o estoque e os dados são atualizados; os novos são criados com categorias, marca, variações e imagens.</p>
      <div className="card mt-6 p-5 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Como fazer</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Na Nuvemshop, vá em Produtos, Exportar, e baixe a planilha. A do StoreOS também serve: use o botão abaixo para ver o formato.</li>
          <li>Envie o arquivo e clique em <strong>Conferir sem gravar</strong> para ver o que vai acontecer e os avisos.</li>
          <li>Estando certo, clique em <strong>Importar produtos</strong>. Variações aparecem em linhas seguidas com o mesmo identificador.</li>
        </ol>
        <p className="mt-3">Se um produto tem preço promocional menor, ele vira o preço de venda. Imagens entram pelas colunas de endereço (https://…).</p>
        <p className="mt-3"><a href="/painel/produtos/exportar" className="font-medium text-brand underline">Baixar catálogo atual (CSV)</a></p>
      </div>
      <ProductImportForm />
    </>
  );
}
