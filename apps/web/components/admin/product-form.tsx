'use client';
import { ImageUploader } from './image-uploader';
import { useActionState, useState } from 'react';
import { saveProductAction } from '../../app/admin/actions';
import { productStatusLabel, slugify } from '../../lib/admin/labels';
import type { AdminProduct } from '../../lib/admin/types';
import type { Brand, Category } from '../../lib/api';
import { buildTree, flatten } from '../../lib/category-tree';

export function ProductForm({ product, categories, brands, created }: { product?: AdminProduct; categories: Category[]; brands: Brand[]; created?: boolean }) {
  const [state, action, pending] = useActionState(saveProductAction, created ? { ok: 'Produto criado.' } : {});
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="card grid gap-4 p-6 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Nome<input name="name" required minLength={2} maxLength={160} defaultValue={product?.name} className="input" onChange={e => { if (!slugTouched) setSlug(slugify(e.target.value)); }} /></label>
        <label className="text-sm font-medium">URL (slug)<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={e => { setSlugTouched(true); setSlug(e.target.value); }} className="input font-mono text-sm" /></label>
        <label className="text-sm font-medium">SKU<input name="sku" required maxLength={60} defaultValue={product?.sku} className="input" /></label>
        <label className="text-sm font-medium">Preço (R$)<input name="price" required inputMode="decimal" pattern="\d+([.,]\d{1,2})?" defaultValue={product?.price} className="input" /></label>
        <label className="text-sm font-medium">Estoque físico<input name="stock" type="number" min={product?.reserved ?? 0} step={1} required defaultValue={product?.stock ?? 0} className="input" />{product && product.reserved > 0 && <span className="text-xs font-normal text-slate-500">{product.reserved} reservado(s) em pedidos pendentes</span>}</label>
        <label className="text-sm font-medium sm:col-span-2">Descrição<textarea name="description" rows={5} maxLength={5000} defaultValue={product?.description ?? ''} className="input" /></label>
        <label className="text-sm font-medium">Marca<select name="brandId" defaultValue={product?.brandId ?? ''} className="input"><option value="">Sem marca</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <div className="hidden sm:block" />
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">Peso e medidas da embalagem <span className="font-normal text-slate-400">(para calcular o frete nos Correios e transportadoras)</span></legend>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-sm">Peso (g)<input name="weightGrams" inputMode="numeric" defaultValue={product?.weightGrams ?? ''} placeholder="300" className="input" /></label>
            <label className="text-sm">Largura (cm)<input name="widthCm" inputMode="numeric" defaultValue={product?.widthCm ?? ''} placeholder="20" className="input" /></label>
            <label className="text-sm">Altura (cm)<input name="heightCm" inputMode="numeric" defaultValue={product?.heightCm ?? ''} placeholder="5" className="input" /></label>
            <label className="text-sm">Comprimento (cm)<input name="lengthCm" inputMode="numeric" defaultValue={product?.lengthCm ?? ''} placeholder="25" className="input" /></label>
          </div>
        </fieldset>
        <label className="text-sm font-medium sm:col-span-2">Título para o Google <span className="font-normal text-slate-400">(até 70 caracteres)</span><input name="seoTitle" maxLength={70} defaultValue={product?.seoTitle ?? ''} className="input" /></label>
        <label className="text-sm font-medium sm:col-span-2">Descrição para o Google <span className="font-normal text-slate-400">(até 160)</span><textarea name="seoDescription" rows={2} maxLength={160} defaultValue={product?.seoDescription ?? ''} className="input" /></label>
        <div className="sm:col-span-2"><ImageUploader name="imageUrls" kind="product" multiple label="Fotos do produto" initial={product?.images.map(image => image.url) ?? []} /></div>
      </div>
      <aside className="space-y-6">
        <div className="card p-6">
          <label className="text-sm font-medium">Status<select name="status" defaultValue={product?.status ?? 'DRAFT'} className="input">{Object.entries(productStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <fieldset className="mt-5"><legend className="text-sm font-medium">Categorias</legend>{flatten(buildTree(categories)).map(c => <label key={c.id} className="mt-2 flex items-center gap-2 text-sm" style={{ paddingLeft: (c.depth - 1) * 20 }}><input type="checkbox" name="categoryIds" value={c.id} defaultChecked={product?.categoryIds?.includes(c.id)} />{c.name}</label>)}</fieldset>
          {state.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
          {state.ok && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{state.ok}</p>}
          <button className="button mt-6 w-full disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : product ? 'Salvar alterações' : 'Criar produto'}</button>
        </div>
      </aside>
    </form>
  );
}
