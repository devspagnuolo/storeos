'use client';
import { useId, useRef, useState } from 'react';
import { guidelineText, MediaKind } from '../../lib/image-guidelines';

type UploadedFile = { url: string; name: string | null; width: number | null; height: number | null; warning: string | null };
type Item = { url: string; note?: string; warning?: string | null };

/**
 * Envio de imagens do computador do lojista (uma ou várias), com a dimensão recomendada à vista.
 * As URLs finais vão em campos ocultos `name`, uma por imagem, na ordem mostrada.
 */
export function ImageUploader({ name, kind, multiple = false, initial = [], onUploaded, label }: { name?: string; kind: MediaKind; multiple?: boolean; initial?: string[]; onUploaded?: (urls: string[]) => void; label?: string }) {
  const inputId = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>(initial.map(url => ({ url })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

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
      const sent: Item[] = (body.files as UploadedFile[]).map(file => ({ url: file.url, note: file.width && file.height ? `${file.width} × ${file.height} px` : undefined, warning: file.warning }));
      setItems(current => (multiple ? [...current, ...sent].slice(0, 12) : sent));
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
    <div className="rounded-xl border border-dashed border-slate-300 p-3">
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
