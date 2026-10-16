'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export type EngineSlide = { id: string; imageUrl: string; mobileImageUrl: string; title: string; subtitle: string; ctaLabel: string; ctaUrl: string; light: boolean };

/**
 * Carrossel do tema: rola com o dedo (scroll-snap), tem setas e bolinhas, troca sozinho quando o tema pede
 * e para quando a pessoa passa o mouse, foca nele ou prefere menos movimento.
 */
export function EngineCarousel({ slides, autoplay, interval, large, primary }: { slides: EngineSlide[]; autoplay: boolean; interval: number; large: boolean; primary: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const go = useCallback((index: number) => {
    const element = track.current;
    if (!element) return;
    const next = (index + slides.length) % slides.length;
    element.scrollTo({ left: next * element.clientWidth, behavior: 'smooth' });
  }, [slides.length]);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const onScroll = () => setCurrent(Math.round(element.scrollLeft / Math.max(element.clientWidth, 1)));
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!autoplay || paused || slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => go(current + 1), interval * 1000);
    return () => window.clearInterval(timer);
  }, [autoplay, paused, interval, current, go, slides.length]);

  return <section aria-roledescription="carrossel" aria-label="Destaques" className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
    <div ref={track} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {slides.map((slide, index) => <div key={slide.id} role="group" aria-roledescription="banner" aria-label={`${index + 1} de ${slides.length}`} className={'relative flex w-full shrink-0 snap-start flex-col items-center justify-center overflow-hidden bg-slate-100 ' + (slide.imageUrl || slide.mobileImageUrl ? '' : large ? 'min-h-[22rem] md:min-h-[32rem]' : 'min-h-[16rem] md:min-h-[24rem]')}>
        {slide.imageUrl || slide.mobileImageUrl
          ? <picture className="block w-full">{slide.mobileImageUrl && slide.imageUrl && <source media="(max-width: 767px)" srcSet={slide.mobileImageUrl} />}<img src={slide.imageUrl || slide.mobileImageUrl} alt={slide.title} className="block h-auto max-h-[85vh] w-full object-contain" loading={index === 0 ? 'eager' : 'lazy'} /></picture>
          : <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${primary}22, ${primary}55)` }} aria-hidden />}
        <div className={(slide.imageUrl || slide.mobileImageUrl ? 'relative w-full md:absolute md:inset-0 ' + (slide.light ? 'md:text-white' : '') : 'relative ' + (slide.light ? 'text-white' : '')) + ' shell flex h-full flex-col justify-center py-6 md:px-16 md:py-12' + (slide.title || slide.subtitle || slide.ctaLabel ? '' : ' hidden')}>
          <div className="max-w-xl">
            {slide.title && <h2 className="text-3xl font-bold leading-tight md:text-5xl">{slide.title}</h2>}
            {slide.subtitle && <p className="mt-3 text-lg opacity-90">{slide.subtitle}</p>}
            {slide.ctaLabel && <Link href={slide.ctaUrl || '/categorias'} className="mt-6 inline-flex rounded-[var(--btn-radius,0.75rem)] px-5 py-3 font-semibold text-white" style={{ backgroundColor: primary }}>{slide.ctaLabel}</Link>}
          </div>
        </div>
      </div>)}
    </div>
    {slides.length > 1 && <>
      <button type="button" aria-label="Banner anterior" onClick={() => go(current - 1)} className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-xl shadow md:flex">‹</button>
      <button type="button" aria-label="Próximo banner" onClick={() => go(current + 1)} className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-xl shadow md:flex">›</button>
      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">{slides.map((slide, index) => <button key={slide.id} type="button" aria-label={`Ir para o banner ${index + 1}`} aria-current={index === current ? 'true' : undefined} onClick={() => go(index)} className={'h-2.5 rounded-full transition-all ' + (index === current ? 'w-6 bg-slate-900' : 'w-2.5 bg-slate-400/70')} />)}</div>
    </>}
  </section>;
}
