'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { BarChart, Stat } from '@/components/charts/bar-chart';
import { day, FlagBadge, pct, Section, when } from '@/components/reports';
import { Badge, Difficulty, ErrorBox, Page, Spinner } from '@/components/ui';

interface Overview {
  people: { students: number; teachers: number; associates: number };
  content: { questions: number; published: number; tests: number; live_tests: number };
  active: { d7: number; d30: number };
  daily: { day: string; runs: number; submits: number; accepted: number; active: number }[];
  totals30: { runs: number; submits: number; accepted: number };
  recentTests: { id: string; title: string; status: string; startsAt: string; attempts: number; finished: number; avgPercent: number | null }[];
  flagged: { questionId: string; title: string; type: string; difficulty: string; students: number; solveRate: number; flag: string }[];
  flagRule: { minStudents: number; easy: number; hard: number };
}

export default function Reports() {
  const user = useRequireUser();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (user) get<Overview>('/api/v1/reports/overview').then(setData).catch(setError);
  }, [user]);
  if (!user) return null;
  return (
    <Page title="Reports">
      <ErrorBox error={error} />
      {!data ? !error && <Spinner /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Students" value={data.people.students} sub={`${data.people.teachers} teachers · ${data.people.associates} associates`} />
            <Stat label="Active students (7 / 30 days)" value={`${data.active.d7} / ${data.active.d30}`} />
            <Stat label="Questions (published)" value={`${data.content.questions} (${data.content.published})`} />
            <Stat label="Tests (live now)" value={`${data.content.tests} (${data.content.live_tests})`} />
          </div>
          <Section title="Last 30 days">
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
              {data.totals30.submits} submissions · {data.totals30.accepted} accepted ({pct(data.totals30.submits ? Math.round((data.totals30.accepted / data.totals30.submits) * 1000) / 10 : null)}) · {data.totals30.runs} runs
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <BarChart testId="chart-submits" title="Submissions per day" valueLabel="Submissions" data={data.daily.map((d) => ({ label: day(d.day), value: d.submits, tip: `${day(d.day)} · ${d.accepted} accepted` }))} />
              <BarChart testId="chart-active" title="Active students per day" valueLabel="Active students" data={data.daily.map((d) => ({ label: day(d.day), value: d.active }))} />
            </div>
          </Section>
          <Section title="Recent tests">
            {data.recentTests.length === 0 ? <p className="text-sm text-slate-500">No tests yet.</p> : (
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500"><tr><th className="py-1.5">Test</th><th>Status</th><th>Starts</th><th className="text-right">Attempts</th><th className="text-right">Finished</th><th className="text-right">Average</th></tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.recentTests.map((t) => (
                    <tr key={t.id}>
                      <td className="py-1.5"><Link className="font-medium text-brand-600 hover:underline dark:text-brand-100" href={`/reports/test?id=${t.id}`}>{t.title}</Link></td>
                      <td><Badge>{t.status}</Badge></td>
                      <td className="text-slate-600 dark:text-slate-400">{when(t.startsAt)}</td>
                      <td className="text-right tabular-nums">{t.attempts}</td>
                      <td className="text-right tabular-nums">{t.finished}</td>
                      <td className="text-right tabular-nums">{pct(t.avgPercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
          <Section title="Questions to review">
            <p className="mb-2 text-xs text-slate-500">
              Flagged when at least {data.flagRule.minStudents} students tried a question and more than {data.flagRule.easy * 100}% (too easy) or fewer than {data.flagRule.hard * 100}% (too hard) solved it.
            </p>
            {data.flagged.length === 0 ? <p className="text-sm text-slate-500" data-testid="no-flagged">No questions are flagged.</p> : (
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500"><tr><th className="py-1.5">Question</th><th>Difficulty</th><th className="text-right">Students</th><th className="text-right">Solved</th><th /></tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.flagged.map((q) => (
                    <tr key={q.questionId}>
                      <td className="py-1.5"><Link className="text-brand-600 hover:underline dark:text-brand-100" href={`/reports/question?id=${q.questionId}`}>{q.title}</Link></td>
                      <td><Difficulty value={q.difficulty} /></td>
                      <td className="text-right tabular-nums">{q.students}</td>
                      <td className="text-right tabular-nums">{pct(q.solveRate)}</td>
                      <td className="text-right"><FlagBadge flag={q.flag} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}
