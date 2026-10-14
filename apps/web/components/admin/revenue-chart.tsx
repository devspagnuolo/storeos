import { formatPrice } from '../../lib/format';

/** Gráfico de barras em SVG puro (sem biblioteca): receita por dia, com valor e data no tooltip. */
export function RevenueChart({ series }: { series: { day: string; revenue: string; orders: number }[] }) {
  const max = Math.max(...series.map(point => Number(point.revenue)), 1);
  const width = 720; const height = 160; const gap = 3;
  const bar = Math.max((width - gap * (series.length - 1)) / series.length, 2);
  return (
    <svg viewBox={`0 0 ${width} ${height + 20}`} role="img" aria-label="Receita por dia" className="w-full">
      {series.map((point, index) => {
        const h = Math.round((Number(point.revenue) / max) * height);
        const x = index * (bar + gap);
        return (
          <g key={point.day}>
            <title>{`${point.day.split('-').reverse().join('/')}: ${formatPrice(point.revenue)} em ${point.orders} pedido(s)`}</title>
            <rect x={x} y={height - Math.max(h, 1)} width={bar} height={Math.max(h, 1)} rx={2} className={h ? 'fill-brand' : 'fill-slate-200'} />
          </g>
        );
      })}
      <text x={0} y={height + 16} className="fill-slate-500 text-[10px]">{series[0]?.day.split('-').reverse().slice(0, 2).join('/')}</text>
      <text x={width} y={height + 16} textAnchor="end" className="fill-slate-500 text-[10px]">{series.at(-1)?.day.split('-').reverse().slice(0, 2).join('/')}</text>
    </svg>
  );
}
