/** Bloco de carregamento; o brilho é desligado para quem prefere menos movimento (regra global em globals.css). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`relative overflow-hidden rounded-lg bg-slate-100 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-slate-200/60 before:to-transparent ${className}`} />;
}
