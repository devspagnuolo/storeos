import Link from 'next/link';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: { href: string; label: string } }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <Link href={action.href} className="button mt-5">{action.label}</Link>}
    </div>
  );
}
