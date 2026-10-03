'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { BarChart, Stat } from '@/components/charts/bar-chart';
import { day, FlagBadge, pct, Section, useQueryId } from '@/components/reports';
import { Badge, Difficulty, ErrorBox, Page, Spinner } from '@/components/ui';

interface QReport {
  question: { id: string; title: string; type: string; difficulty: string; tags: string[]; global: boolean; status: string };
  totals: { runs: number; submits: number; accepted: number; acceptance: number | null };
  students: { attempted: number; solved: number; solveRate: number | null; avgBestScore: number | null };
  flag: string | null;
  flagRule: { minStudents: number; easy: number; hard: number };
  byRuntime: { runtime: string; runs: number; submits: number; accepted: number; acceptance: number | null; avgScore: number | null }[];
  verdicts: { verdict: string; n: number }[];
  daily: { day: string; submits: number; accepted: number }[];
  tests: { testId: string; title: string; status: string; attempted: number; avgScore: number | null }[];
}

export default function QuestionReport() {
  const user = useRequireUser();
  const id = useQueryId();
  const [r, setR] = useState<QReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (user && id) get<QReport>(`/api/v1/reports/questions/${id}`).then(setR).catch(setError);
  }, [user, id]);
  if (!user) return null;
  return (
    <Page title={r ? `Report · ${r.question.title}` : 'Question report'} actions={r && <Link className="btn-secondary" href={`/questions/edit?id=${id}`}>Open question</Link>}>
      <ErrorBox error={error} />
      {!r ? !error && <Spinner /> : (
        <>
          <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Difficulty value={r.question.difficulty} /> <Badge>{r.question.type}</Badge> {r.question.global && <Badge tone="blue">Global</Badge>} <FlagBadge flag={r.flag} />
            {r.question.tags.map((t) => <span key={t} className="text-xs">#{t}</span>)}
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Students attempted" value={r.students.attempted} />
            <Stat label="Solved" value={pct(r.students.solveRate)} sub={`${r.students.solved} students`} />
            <Stat label="Average best score" value={pct(r.students.avgBestScore)} />
            <Stat label="Submissions accepted" value={pct(r.totals.acceptance)} sub={`${r.totals.accepted} of ${r.totals.submits} · ${r.totals.runs} runs`} />
          </div>
          <Section title="Last 30 days">
            <BarChart testId="chart-question-daily" title="Submissions per day" valueLabel="Submissions" data={r.daily.map((d) => ({ label: day(d.day), value: d.submits, tip: `${day(d.day)} · ${d.accepted} accepted` }))} />
          </Section>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="By language">
              {r.byRuntime.length === 0 ? <p className="text-sm text-slate-500">No submissions yet.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500"><tr><th className="py-1.5">Runtime</th><th className="text-right">Submits</th><th className="text-right">Accepted</th><th className="text-right">Avg score</th></tr></thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {r.byRuntime.map((x) => <tr key={x.runtime}><td className="py-1.5">{x.runtime}</td><td className="text-right tabular-nums">{x.submits}</td><td className="text-right tabular-nums">{pct(x.acceptance)}</td><td className="text-right tabular-nums">{pct(x.avgScore)}</td></tr>)}
                  </tbody>
                </table>
              )}
            </Section>
            <Section title="Verdicts">
              {r.verdicts.length === 0 ? <p className="text-sm text-slate-500">No graded submissions yet.</p> : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {r.verdicts.map((v) => <tr key={v.verdict}><td className="py-1.5">{v.verdict.replace(/_/g, ' ')}</td><td className="text-right tabular-nums">{v.n}</td></tr>)}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
          <Section title="In tests">
            {r.tests.length === 0 ? <p className="text-sm text-slate-500">Not used in any test.</p> : (
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500"><tr><th className="py-1.5">Test</th><th>Status</th><th className="text-right">Attempted</th><th className="text-right">Avg score</th></tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {r.tests.map((t) => <tr key={t.testId}><td className="py-1.5"><Link className="text-brand-600 hover:underline dark:text-brand-100" href={`/reports/test?id=${t.testId}`}>{t.title}</Link></td><td><Badge>{t.status}</Badge></td><td className="text-right tabular-nums">{t.attempted}</td><td className="text-right tabular-nums">{pct(t.avgScore)}</td></tr>)}
                </tbody>
              </table>
            )}
          </Section>
          <p className="text-xs text-slate-500">Flags need at least {r.flagRule.minStudents} students. Scores are percentages of the question’s points.</p>
        </>
      )}
    </Page>
  );
}
