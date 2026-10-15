'use client';
import { useState } from 'react';
import type { AutomationRule } from '../../lib/admin/types';
import { AutomationForm } from './automation-form';

export function AutomationEdit({ rule }: { rule: AutomationRule }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="text-xs underline" onClick={() => setOpen(!open)}>{open ? 'Fechar' : 'Editar'}</button>
      {open && <div className="mt-4 rounded-lg bg-slate-50 p-4 text-left"><AutomationForm rule={rule} /></div>}
    </div>
  );
}
