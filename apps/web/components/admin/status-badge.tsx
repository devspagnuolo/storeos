import { orderStatusLabel, orderStatusTone } from '../../lib/admin/labels';
export function StatusBadge({ status }: { status: string }) { return <span className={`badge ${orderStatusTone[status] ?? 'bg-slate-100 text-slate-700'}`}>{orderStatusLabel[status] ?? status}</span>; }
