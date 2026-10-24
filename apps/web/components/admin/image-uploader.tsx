'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { guidelineText, MediaKind } from '../../lib/image-guidelines';

type UploadedFile = { url: string; originalUrl?: string | null; name: string | null; width: number | null; height: number | null; warning: string | null };
type Item = { url: string; originalUrl?: string | null; note?: string; warning?: string | null; color?: string; busy?: boolean };

async function photoBackground(body: { action: 'state'; urls: string[] } | { action: 'apply'; url: string }) {
  const response = await fetch('/admin/midia/fundo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Não foi possível trocar o fundo agora.');
  return data;
}

/**
 * Envio de imagens do computador do lojista (uma ou várias), com a dimensão recomendada à vista.
 * As URLs finais vão em campos ocultos `name`, uma por imagem, na ordem mostrada.
 * Com `colors`, cada foto ganha a escolha da cor que ela mostra (campo `imageColors`, na mesma ordem; vazio = foto geral).
 * Fotos de produto ganham "Fundo padrão" (troca o fundo pela cor da loja) e "Voltar à original" quando o fundo foi trocado.
 */
export function ImageUploader({ name, kind, multiple = false, initial = [], initialColors = [], colors, onUploaded, label }: { name?: string; kind: MediaKind; multiple?: boolean; initial?: string[]; initialColors?: (string | null | undefined)[]; colors?: string[]; onUploaded?: (urls: string[]) => void; label?: string }) {
  const inputId = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>(initial.map((url, i) => ({ url, color: initialColors[i] ?? '' })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [backgroundReady, setBackgroundReady] = useState(false);

  useEffect(() => {
    if (kind !== 'product') return;
    let active = true;
    photoBackground({ action: 'state', urls: initial.slice(0, 60) })
      .then((state: { available: boolean; originals: Record<string, string> }) => {
        if (!active) return;
        setBackgroundReady(state.available);
        setItems(current => current.map(item => (state.originals[item.url] ? { ...item, originalUrl: state.originals[item.url] } : item)));
      })
      .catch(() => undefined);
    return () => { active = false; };
    // Só na abertura: depois disso o próprio componente acompanha as trocas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (url: string, change: Partial<Item>) => setItems(current => current.map(item => (item.url === url ? { ...item, ...change } : item)));

  async function applyBackground(item: Item) {
    setError(undefined);
    update(item.url, { busy: true });
    try {
      const result: { url: string; originalUrl: string } = await photoBackground({ action: 'apply', url: item.url });
      update(item.url, { url: result.url, originalUrl: result.originalUrl, busy: false, warning: null, note: 'Fundo trocado · salve o produto para publicar' });
    } catch (e) {
      update(item.url, { busy: false });
      setError(e instanceof Error ? e.message : 'Não foi possível trocar o fundo agora.');
    }
  }

  async function send(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(undefined);
    try {
      const form = new FormData();
      for (const file of Array.from(files).slice(0, multiple ? 12 : 1)) form.append('files', file, file.name);
      const response = await fetch(`/admin/midia/upload?kind=${kind}`, { method: 'POST', body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(body.message) ? 'Confira as imagens enviadas.' : body.message || 'Não foi possível enviar as imagens.');
      const sent: Item[] = (body.files as UploadedFile[]).map(file => ({ url: file.url, originalUrl: file.originalUrl ?? null, note: file.originalUrl ? 'Fundo padrão aplicado' : file.width && file.height ? `${file.width} × ${file.height} px` : undefined, warning: file.warning }));
      setItems(current => (multiple ? [...current, ...sent].slice(0, 60) : sent));
      onUploaded?.(sent.map(item => item.url));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar as imagens.');
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = '';
    }
  }

  const move = (index: number, delta: number) => setItems(current => {
    const next = [...current];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    return next;
  });

  return (
    <div className="min-w-0 rounded-xl border border-dashed border-slate-300 p-3">
      <label htmlFor={inputId} className="text-sm font-medium">{label ?? (multiple ? 'Imagens' : 'Imagem')}</label>
      <p className="mt-1 text-xs text-slate-500">{guidelineText(kind)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input ref={picker} id={inputId} type="file" accept="image/png,image/jpeg,image/webp" multiple={multiple} disabled={busy} onChange={e => void send(e.currentTarget.files)} className="max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
        {busy && <span role="status" className="text-sm text-slate-500">Enviando…</span>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {items.length > 0 && (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <li key={item.url} className="rounded-lg border border-slate-200 p-2 text-xs">
              {name && <input type="hidden" name={name} value={item.url} />}
              <img src={item.url} alt="" className="h-28 w-full rounded object-cover" />
              <p className="mt-1 text-slate-500">{item.note ?? ''}{multiple && index === 0 && kind === 'product' ? ' · principal' : ''}</p>
              {item.warning && <p className="mt-1 text-amber-700">{item.warning}</p>}
              {colors?.length ? (
                <label className="mt-1 flex items-center gap-1 text-slate-600">Cor
                  <select name="imageColors" value={item.color ?? ''} onChange={e => { const color = e.target.value; setItems(current => current.map((it, i) => (i === index ? { ...it, color } : it))); }} className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 py-0.5">
                    <option value="">Todas (foto geral)</option>
                    {[...new Set([...colors, ...(item.color && !colors.includes(item.color) ? [item.color] : [])])].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ) : null}
              {kind === 'product' && (backgroundReady || item.originalUrl) && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {backgroundReady && <button type="button" className="underline disabled:opacity-60" disabled={item.busy} onClick={() => void applyBackground(item)}>{item.busy ? 'Trocando fundo…' : item.originalUrl ? 'Refazer fundo' : 'Fundo padrão'}</button>}
                  {item.originalUrl && !item.busy && <button type="button" className="underline" onClick={() => update(item.url, { url: item.originalUrl!, originalUrl: null, note: 'Foto original · salve o produto para publicar', warning: null })}>Voltar à original</button>}
                </div>
              )}
              <div className="mt-1 flex gap-2">
                {multiple && index > 0 && <button type="button" className="underline" onClick={() => move(index, -1)}>←</button>}
                {multiple && index < items.length - 1 && <button type="button" className="underline" onClick={() => move(index, 1)}>→</button>}
                <button type="button" className="ml-auto text-red-700 underline" onClick={() => setItems(current => current.filter((_, i) => i !== index))}>Remover</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
