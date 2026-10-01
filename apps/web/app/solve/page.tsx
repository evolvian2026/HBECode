'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { ErrorBox, Spinner } from '@/components/ui';
import { CodingSolve, type CodingQuestion } from '@/components/solve/coding';
import { DbSolve, type DbQuestion } from '@/components/solve/db';
import type { Draft } from '@/components/solve/common';
import { WebSolve, type WebQuestion } from '@/components/solve/web';

type Question = CodingQuestion | WebQuestion | DbQuestion;

export default function Solve() {
  const user = useRequireUser();
  const [data, setData] = useState<{ q: Question; drafts: Draft[] } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (!user || !id) return;
    Promise.all([get<Question>(`/api/v1/practice/questions/${id}`), get<Draft[]>(`/api/v1/drafts/${id}`).catch(() => [])])
      .then(([q, drafts]) => setData({ q, drafts }))
      .catch(setError);
  }, [user]);

  if (!user) return null;
  if (error) return <div className="p-6"><ErrorBox error={error} /><Link className="btn-secondary mt-3" href="/practice">Back</Link></div>;
  if (!data) return <div className="p-8 text-center"><Spinner /></div>;
  const { q, drafts } = data;
  if (q.type === 'web') return <WebSolve q={q} drafts={drafts} user={user} />;
  if (q.type === 'db') return <DbSolve q={q} drafts={drafts} user={user} />;
  return <CodingSolve q={q} drafts={drafts} user={user} />;
}
