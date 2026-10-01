'use client';

import type { Page as PageT } from '@hbe/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { Badge, Difficulty, ErrorBox, Page, Spinner } from '@/components/ui';

const TYPE_LABEL = { coding: 'Coding', web: 'Web', db: 'Database' } as const;

interface Item {
  id: string;
  type: 'coding' | 'web' | 'db';
  title: string;
  difficulty: string;
  tags: string[];
  global: boolean;
}

export default function Practice() {
  const user = useRequireUser();
  const [q, setQ] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [data, setData] = useState<PageT<Item> | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = async (cursor?: string) => {
    const params = new URLSearchParams({ limit: '25' });
    if (q) params.set('q', q);
    if (difficulty) params.set('difficulty', difficulty);
    if (cursor) params.set('cursor', cursor);
    try {
      const r = await get<PageT<Item>>(`/api/v1/practice/questions?${params}`);
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
  }, [user, q, difficulty]);

  if (!user) return null;
  return (
    <Page title="Practice">
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search by title" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="moderate">Moderate</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <ErrorBox error={error} />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <p className="text-sm text-slate-500">No practice questions yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {data.items.map((i) => (
            <li key={i.id}>
              <Link href={`/solve?id=${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900">
                <span className="font-medium">{i.title}</span>
                <Badge tone="blue">{TYPE_LABEL[i.type] ?? i.type}</Badge>
                <Difficulty value={i.difficulty} />
                <span className="ml-auto flex gap-1">
                  {i.tags.map((t) => (
                    <span key={t} className="text-xs text-slate-500">#{t}</span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data?.nextCursor && (
        <button className="btn-secondary mt-3" onClick={() => void load(data.nextCursor!)}>
          Load more
        </button>
      )}
    </Page>
  );
}
