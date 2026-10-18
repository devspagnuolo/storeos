'use client';
import { useEffect, useState } from 'react';
import type { ProductImage } from '../lib/api';
import { COLOR_EVENT, imagesForColor } from '../lib/product-colors';

/** Galeria da página do produto: foto grande e miniaturas; troca para as fotos da cor que a cliente escolher. */
export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
  const [color, setColor] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const onColor = (event: Event) => { setColor((event as CustomEvent<string | null>).detail); setIndex(0); };
    window.addEventListener(COLOR_EVENT, onColor);
    return () => window.removeEventListener(COLOR_EVENT, onColor);
  }, []);
  const shown = imagesForColor(images, color);
  const main = shown[Math.min(index, shown.length - 1)];
  return (
    <div className="min-w-0">
      <div className="card aspect-square overflow-hidden bg-gradient-to-br from-slate-100 to-violet-100">
        {main && <img key={main.url} src={main.url} alt={main.alt || name} className="h-full w-full object-cover" />}
      </div>
      {shown.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Fotos do produto">
          {shown.map((image, i) => (
            <button key={image.url} type="button" role="listitem" onClick={() => setIndex(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === index} className={`h-20 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? 'border-brand' : 'border-transparent opacity-80 hover:opacity-100'}`}>
              <img src={image.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
