'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useRequireUser, useSession } from '@/lib/session';
import { Badge, ErrorBox, Page, Spinner } from '@/components/ui';

interface StaffTest { id: string; title: string; status: string; startsAt: string; endsAt: string; durationMin: number; questionCount: number; attempts: number; inProgress: number }
interface MyTest {
  id: string; title: string; description: string; status: string; startsAt: string; endsAt: string; durationMin: number; questionCount: number;
  attempt: { id: string; status: string; deadlineAt: string; score: number | null; maxScore: number | null } | null;
}

const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const STATUS_TONE = { draft: 'slate', published: 'blue', closed: 'slate' } as const;
const ATTEMPT_LABEL: Record<string, string> = { in_progress: 'In progress', submitted: 'Submitted', auto_submitted: 'Auto-submitted', terminated: 'Terminated' };

export default function Tests() {
  const user = useRequireUser();
  const { can } = useSession();
  if (!user) return null;
  return can('test:proctor') ? <StaffTests manage={can('test:manage')} /> : <MyTests />;
}

function StaffTests({ manage }: { manage: boolean }) {
  const [tests, setTests] = useState<StaffTest[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    get<StaffTest[]>('/api/v1/tests').then(setTests).catch(setError);
  }, []);
  return (
    <Page title="Tests" actions={manage ? <Link className="btn-primary" href="/tests/edit">New test</Link> : undefined}>
      <ErrorBox error={error} />
      {!tests ? <Spinner /> : tests.length === 0 ? <p className="text-slate-500">No tests yet.</p> : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th className="py-2">Title</th><th>Status</th><th>Window</th><th>Duration</th><th>Questions</th><th>Attempts</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {tests.map((t) => (
              <tr key={t.id}>
                <td className="py-2 font-medium">{t.title}</td>
                <td><Badge tone={STATUS_TONE[t.status as keyof typeof STATUS_TONE] ?? 'slate'}>{t.status}</Badge></td>
                <td className="text-slate-600 dark:text-slate-400">{when(t.startsAt)} – {when(t.endsAt)}</td>
                <td>{t.durationMin} min</td>
                <td>{t.questionCount}</td>
                <td>{t.attempts}{t.inProgress > 0 && <span className="ml-1 text-emerald-600">({t.inProgress} live)</span>}</td>
                <td className="space-x-3 text-right">
                  {t.status !== 'draft' && <Link className="text-brand-600 hover:underline" href={`/tests/monitor?id=${t.id}`}>Monitor</Link>}
                  <Link className="text-brand-600 hover:underline" href={`/tests/edit?id=${t.id}`}>{t.status === 'draft' && manage ? 'Edit' : 'Details'}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Page>
  );
}

function MyTests() {
  const [tests, setTests] = useState<MyTest[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    get<MyTest[]>('/api/v1/my/tests').then(setTests).catch(setError);
    const i = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(i);
  }, []);
  return (
    <Page title="My tests">
      <ErrorBox error={error} />
      {!tests ? <Spinner /> : tests.length === 0 ? <p className="text-slate-500">No tests are assigned to you right now.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {tests.map((t) => {
            const open = t.status === 'published' && now >= Date.parse(t.startsAt) && now < Date.parse(t.endsAt);
            const a = t.attempt;
            return (
              <div key={t.id} className="card" data-testid="my-test">
                <div className="flex items-start gap-2">
                  <h2 className="font-medium">{t.title}</h2>
                  {a && <span className="ml-auto"><Badge tone={a.status === 'in_progress' ? 'amber' : 'green'}>{ATTEMPT_LABEL[a.status]}</Badge></span>}
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t.questionCount} questions · {t.durationMin} min · {when(t.startsAt)} – {when(t.endsAt)}</p>
                {a && a.score !== null && <p className="mt-2 text-sm">Score: <b>{a.score}</b> / {a.maxScore}</p>}
                <div className="mt-3">
                  {(!a && open) || a?.status === 'in_progress' ? (
                    <Link className="btn-primary" href={`/exam?test=${t.id}`}>{a ? 'Resume' : 'Start'}</Link>
                  ) : !a && now < Date.parse(t.startsAt) ? (
                    <span className="text-sm text-slate-500">Opens {when(t.startsAt)}</span>
                  ) : !a ? <span className="text-sm text-slate-500">Closed</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
