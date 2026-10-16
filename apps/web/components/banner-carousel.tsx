'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { BannerSlide } from '../lib/api';

/** Carrossel da home: troca sozinho a cada 6 s, pausa com o mouse em cima e respeita quem prefere menos movimento. */
export function BannerCarousel({ slides }: { slides: BannerSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  useEffect(() => {
    if (count < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % count), 6000);
    return () => clearInterval(timer);
  }, [count, paused]);
  if (!count) return null;
  const go = (to: number) => setIndex((to + count) % count);
  return (
    <section aria-roledescription="carrossel" aria-label="Destaques" className="relative overflow-hidden bg-slate-100" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((slide, i) => {
          const picture = (
            <picture>
              {slide.mobileImageUrl && <source media="(max-width: 767px)" srcSet={slide.mobileImageUrl} />}
              <img src={slide.imageUrl} alt={slide.title ?? ''} className="mx-auto block h-auto max-h-[85vh] w-full object-contain" loading={i === 0 ? 'eager' : 'lazy'} />
            </picture>
          );
          return (
            <div key={slide.id} className="relative w-full shrink-0" aria-hidden={i !== index} role="group" aria-label={`${i + 1} de ${count}`}>
              {slide.linkUrl ? <Link href={slide.linkUrl} tabIndex={i === index ? 0 : -1}>{picture}</Link> : picture}
              {(slide.title || slide.subtitle || slide.ctaLabel) && (
                <div className="pointer-events-none absolute inset-0 flex items-center">
                  <div className="shell"><div className="max-w-lg rounded-2xl bg-black/35 p-5 text-white backdrop-blur-sm">
                    {slide.title && <h2 className="text-2xl font-black sm:text-4xl">{slide.title}</h2>}
                    {slide.subtitle && <p className="mt-2 text-sm sm:text-base">{slide.subtitle}</p>}
                    {slide.ctaLabel && slide.linkUrl && <span className="button pointer-events-auto mt-4 inline-block">{slide.ctaLabel}</span>}
                  </div></div>
                </div>)}
            </div>);
        })}
      </div>
      {count > 1 && (
        <>
          <button type="button" aria-label="Banner anterior" onClick={() => go(index - 1)} className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 rounded-full bg-white/80 text-xl shadow md:block">‹</button>
          <button type="button" aria-label="Próximo banner" onClick={() => go(index + 1)} className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 rounded-full bg-white/80 text-xl shadow md:block">›</button>
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
            {slides.map((slide, i) => <button key={slide.id} type="button" aria-label={`Ir para o banner ${i + 1}`} aria-current={i === index} onClick={() => setIndex(i)} className={`h-2.5 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-2.5 bg-white/60'}`} />)}
          </div>
        </>)}
    </section>
  );
}
