'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { Stat } from './charts/bar-chart';
import { ATTEMPT_LABEL, fmt, pct, Section, when } from './reports';
import { Badge, Difficulty, ErrorBox, Page, Spinner } from './ui';

interface SReport {
  student: { id: string; name: string; email: string };
  tests: { testId: string; title: string; status: string; startedAt: string; submittedAt: string | null; score: number | null; maxScore: number | null; percent: number | null; violations?: number }[];
  practice: { attempted: number; solved: number; byDifficulty: Record<'easy' | 'moderate' | 'hard', { attempted: number; solved: number }> };
  topics: { tag: string; questions: number; solved: number; avgBestScore: number }[];
  recent: { questionId: string; title: string; type: string; difficulty: string; bestScore: number | null; solved: boolean; submits: number; lastAt: string }[];
}

/** One student's progress: staff view (any student of the institution) or the student's own. */
export function StudentReport({ path, self, staff }: { path: string; self: boolean; staff: boolean }) {
  const [r, setR] = useState<SReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (path) get<SReport>(path).then(setR).catch(setError);
  }, [path]);
  return (
    <Page title={self ? 'My progress' : r ? `Report · ${r.student.name}` : 'Student report'}>
      <ErrorBox error={error} />
      {!r ? !error && <Spinner /> : (
        <>
          {!self && <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{r.student.email}</p>}
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Questions solved" value={`${r.practice.solved} / ${r.practice.attempted}`} sub="solved / attempted" />
            {(['easy', 'moderate', 'hard'] as const).map((d) => (
              <Stat key={d} label={`${d[0]!.toUpperCase()}${d.slice(1)}`} value={`${r.practice.byDifficulty[d].solved} / ${r.practice.byDifficulty[d].attempted}`} />
            ))}
            <Stat label="Tests taken" value={r.tests.length} />
          </div>
          <Section title="Tests">
            {r.tests.length === 0 ? <p className="text-sm text-slate-500">No tests taken yet.</p> : (
              <table className="w-full text-sm" data-testid="student-tests">
                <thead className="text-left text-slate-500"><tr><th className="py-1.5">Test</th><th>Status</th><th>Started</th><th className="text-right">Score</th>{!self && <th className="text-right">Violations</th>}</tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {r.tests.map((t) => (
                    <tr key={t.testId}>
                      <td className="py-1.5">{staff ? <Link className="text-brand-600 hover:underline dark:text-brand-100" href={`/reports/test?id=${t.testId}`}>{t.title}</Link> : t.title}</td>
                      <td><Badge tone={t.status === 'in_progress' ? 'blue' : t.status === 'terminated' ? 'red' : 'green'}>{ATTEMPT_LABEL[t.status] ?? t.status}</Badge></td>
                      <td className="text-slate-600 dark:text-slate-400">{when(t.startedAt)}</td>
                      <td className="text-right tabular-nums">{t.score === null ? <span className="text-slate-500">{self ? 'Not released' : '—'}</span> : `${fmt(t.score)} / ${t.maxScore} (${pct(t.percent)})`}</td>
                      {!self && <td className="text-right tabular-nums">{t.violations ?? 0}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Topics">
              {r.topics.length === 0 ? <p className="text-sm text-slate-500">No practice yet.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500"><tr><th className="py-1.5">Topic</th><th className="text-right">Solved</th><th className="text-right">Avg best score</th></tr></thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {r.topics.map((t) => <tr key={t.tag}><td className="py-1.5">{t.tag}</td><td className="text-right tabular-nums">{t.solved} / {t.questions}</td><td className="text-right tabular-nums">{pct(t.avgBestScore)}</td></tr>)}
                  </tbody>
                </table>
              )}
            </Section>
            <Section title="Recent questions">
              {r.recent.length === 0 ? <p className="text-sm text-slate-500">No submissions yet.</p> : (
                <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800" data-testid="recent-questions">
                  {r.recent.map((q) => (
                    <li key={q.questionId} className="flex items-center gap-2 py-1.5">
                      {staff ? <Link className="hover:underline" href={`/reports/question?id=${q.questionId}`}>{q.title}</Link> : <span>{q.title}</span>}
                      <Difficulty value={q.difficulty} />
                      <span className="ml-auto tabular-nums text-slate-600 dark:text-slate-400">{pct(q.bestScore)}</span>
                      {q.solved ? <Badge tone="green">Solved</Badge> : <Badge>Tried</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
    </Page>
  );
}
