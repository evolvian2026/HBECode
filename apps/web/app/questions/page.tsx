'use client';

import type { Page as PageT } from '@hbe/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { downloadFile, get } from '@/lib/api';
import { useRequireUser, useSession } from '@/lib/session';
import { Badge, Difficulty, ErrorBox, Page, Spinner } from '@/components/ui';

const TYPE_LABEL: Record<string, string> = { coding: 'Coding', web: 'Web', db: 'Database' };

interface Item {
  id: string;
  type: string;
  title: string;
  difficulty: string;
  tags: string[];
  status: string;
  isPractice: boolean;
  global: boolean;
  versionNo: number;
  published: boolean;
  updatedAt: string;
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'slate' | 'blue'> = { published: 'green', validating: 'blue', invalid: 'red', draft: 'slate', archived: 'amber' };

export default function Questions() {
  const user = useRequireUser();
  const { can } = useSession();
  const [filters, setFilters] = useState({ q: '', difficulty: '', status: '' });
  const [data, setData] = useState<PageT<Item> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'docx' | 'json'>('xlsx');
  // Exports include reference solutions: only questions this user may edit can be exported.
  const exportable = (i: Item) => can('question:write') && (user?.role === 'super_admin' ? i.global : !i.global);
  const doExport = () =>
    downloadFile(`/api/v1/exports/questions?format=${exportFormat}&ids=${selected.join(',')}`, `hbecode-questions.${exportFormat}`).catch(setError);

  const load = async (cursor?: string) => {
    const p = new URLSearchParams({ limit: '25' });
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    if (cursor) p.set('cursor', cursor);
    try {
      const r = await get<PageT<Item>>(`/api/v1/questions?${p}`);
      setData((prev) => (cursor && prev ? { items: [...prev.items, ...r.items], nextCursor: r.nextCursor } : r));
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filters]);

  if (!user) return null;
  return (
    <Page title="Question bank" actions={can('question:write') && (
        <>
          <Link className="btn-primary" href="/questions/edit">New question</Link>
          <Link className="btn-secondary" href="/questions/edit?type=web">New web question</Link>
          <Link className="btn-secondary" href="/questions/edit?type=db">New database question</Link>
          <Link className="btn-secondary" href="/questions/import">Import</Link>
        </>
      )}>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search by title" aria-label="Search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select className="input w-auto" aria-label="Difficulty" value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}>
          <option value="">All difficulties</option><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option>
        </select>
        <select className="input w-auto" aria-label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Any status</option>{['draft', 'validating', 'invalid', 'published', 'archived'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {can('question:write') && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-slate-500">{selected.length} selected</span>
            <select className="input w-auto py-1" aria-label="Export format" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as 'xlsx')}>
              <option value="xlsx">Excel</option><option value="docx">Word</option><option value="json">JSON</option>
            </select>
            <button className="btn-secondary py-1" disabled={selected.length === 0} onClick={() => void doExport()} title="Includes hidden tests and reference solutions">Export</button>
          </div>
        )}
      </div>
      <ErrorBox error={error} />
      {!data ? <Spinner /> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900">
              <tr><th className="w-8 px-3 py-2"><span className="sr-only">Select</span></th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Difficulty</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Version</th><th className="px-3 py-2">Updated</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.items.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                  <td className="px-3 py-2">
                    {exportable(i) && <input type="checkbox" aria-label={`Select ${i.title}`} checked={selected.includes(i.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id)))} />}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/questions/edit?id=${i.id}`} className="font-medium hover:underline">{i.title}</Link>
                    <div className="mt-0.5 flex gap-1">{i.global && <Badge tone="blue">global</Badge>}{i.isPractice && <Badge>practice</Badge>}{i.tags.map((t) => <span key={t} className="text-xs text-slate-500">#{t}</span>)}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{TYPE_LABEL[i.type] ?? i.type}</td>
                  <td className="px-3 py-2"><Difficulty value={i.difficulty} /></td>
                  <td className="px-3 py-2"><Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge></td>
                  <td className="px-3 py-2">v{i.versionNo}</td>
                  <td className="px-3 py-2 text-slate-500">{new Date(i.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No questions match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {data?.nextCursor && <button className="btn-secondary mt-3" onClick={() => void load(data.nextCursor!)}>Load more</button>}
    </Page>
  );
}
