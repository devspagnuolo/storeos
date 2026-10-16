'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type Slide = { imageUrl: string; alt?: string; href?: string | null };

/** Carrossel de imagens da seção: autoplay opcional, pausa ao passar o mouse, setas e pontos acessíveis por teclado. */
export function ImageCarousel({ slides, autoplay }: { slides: Slide[]; autoplay: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  useEffect(() => {
    if (!autoplay || count < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % count), 5000);
    return () => clearInterval(timer);
  }, [autoplay, count, paused]);
  const go = (to: number) => setIndex((to + count) % count);
  return <section aria-roledescription="carrossel" aria-label="Imagens em destaque" className="relative overflow-hidden bg-slate-100" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <div className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }}>
      {slides.map((slide, i) => {
        const img = <img src={slide.imageUrl} alt={slide.alt ?? ''} loading={i === 0 ? 'eager' : 'lazy'} className="mx-auto block h-auto max-h-[85vh] w-full object-contain" />;
        return <div key={i} className="w-full shrink-0" role="group" aria-label={`${i + 1} de ${count}`} aria-hidden={i !== index}>
          {slide.href ? (/^https:/.test(slide.href) ? <a href={slide.href} rel="noopener noreferrer" tabIndex={i === index ? 0 : -1}>{img}</a> : <Link href={slide.href} tabIndex={i === index ? 0 : -1}>{img}</Link>) : img}
        </div>;
      })}
    </div>
    {count > 1 && <>
      <button type="button" aria-label="Imagem anterior" onClick={() => go(index - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 text-white">‹</button>
      <button type="button" aria-label="Próxima imagem" onClick={() => go(index + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 text-white">›</button>
      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">{slides.map((_, i) => <button key={i} type="button" aria-label={`Ir para a imagem ${i + 1}`} aria-current={i === index} onClick={() => setIndex(i)} className={'h-2.5 w-2.5 rounded-full ' + (i === index ? 'bg-white' : 'bg-white/50')} />)}</div>
    </>}
  </section>;
}
