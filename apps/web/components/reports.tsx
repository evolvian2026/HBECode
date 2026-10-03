'use client';

import { useEffect, useState } from 'react';
import { Badge } from './ui';

export const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(digits));
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${fmt(n)}%`);
export const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
export const when = (s: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Read ?id= after mount (Next client navigation leaves a state initializer stale). */
export function useQueryId() {
  const [id, setId] = useState('');
  useEffect(() => setId(new URLSearchParams(location.search).get('id') ?? ''), []);
  return id;
}

export function FlagBadge({ flag }: { flag: string | null }) {
  if (!flag) return null;
  return <Badge tone="amber">{flag === 'too_easy' ? 'Too easy' : 'Too hard'}</Badge>;
}

export const ATTEMPT_LABEL: Record<string, string> = {
  in_progress: 'In progress', submitted: 'Submitted', auto_submitted: 'Auto-submitted', terminated: 'Terminated', not_started: 'Not started',
};

export function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card mb-4 break-inside-avoid">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-medium">{title}</h2>
        <div className="ml-auto flex gap-2 print:hidden">{actions}</div>
      </div>
      {children}
    </section>
  );
}
