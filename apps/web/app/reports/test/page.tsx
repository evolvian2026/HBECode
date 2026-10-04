'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { downloadFile, get, post } from '@/lib/api';
import { useRequireUser, useSession } from '@/lib/session';
import { BarChart, Stat } from '@/components/charts/bar-chart';
import { ATTEMPT_LABEL, fmt, FlagBadge, pct, Section, useQueryId, when } from '@/components/reports';
import { Badge, ErrorBox, Page, Spinner } from '@/components/ui';

interface Stats { count: number; mean: number | null; median: number | null; min: number | null; max: number | null; stddev: number | null }
interface Report {
  test: { id: string; title: string; status: string; startsAt: string; endsAt: string; durationMin: number };
  summary: {
    assigned: number; started: number; inProgress: number; submitted: number; autoSubmitted: number; terminated: number; notStarted: number;
    score: Stats; minutes: Stats; violations: { total: number; studentsWithAny: number };
  };
  distribution: { from: number; to: number; count: number }[];
  questions: { questionId: string; title: string; type: string; points: number; attempted: number; avgScore: number | null; fullScorePercent: number | null; avgSubmissions: number | null; flag: string | null }[];
  plagiarism: { runId: string; status: string; createdAt: string; finishedAt: string | null; flaggedStudents: number } | null;
  students: {
    userId: string; name: string; email: string; attemptId: string | null; status: string; submitReason: string | null; score: number | null; maxScore: number | null;
    percent: number | null; rank: number | null; minutes: number | null; violations: number; perQuestion: Record<string, number>; plagiarismMax: number | null;
  }[];
}
interface Plag {
  run: { id: string; status: string; createdAt: string; finishedAt: string | null; counts: { submissions?: number; otherTests?: number; groups?: number; flagged?: number } | null; params: { threshold?: number; scope?: 'test' | 'institution' } | null; error: string | null } | null;
  pairs: { questionId: string; question: string; subA: string; subB: string; a: Who; b: Who; similarity: number; matched: number }[];
}
interface Who { name: string; email: string; test: { id: string; title: string } }
interface Side { submissionId: string; name: string; email: string; runtime: string; submittedAt: string; test: { id: string; title: string }; source: string; regions: [number, number][] }
interface Pair { similarity: number; matched: number; a: Side; b: Side }

const STATUS_TONE: Record<string, 'slate' | 'green' | 'red' | 'amber' | 'blue'> = { in_progress: 'blue', submitted: 'green', auto_submitted: 'amber', terminated: 'red', not_started: 'slate' };

export default function TestReport() {
  const user = useRequireUser();
  const { can } = useSession();
  const id = useQueryId();
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sort, setSort] = useState<'rank' | 'name' | 'violations' | 'similarity'>('rank');
  const load = useCallback(() => get<Report>(`/api/v1/reports/tests/${id}`).then(setR).catch(setError), [id]);
  useEffect(() => {
    if (user && id) void load();
  }, [user, id, load]);
  if (!user) return null;
  const canExport = user.role === 'client_admin' || user.role === 'teacher'; // associates view only
  const exp = (format: 'csv' | 'xlsx') => downloadFile(`/api/v1/reports/tests/${id}/export?format=${format}`, `test-report.${format}`).catch(setError);
  const students = r
    ? [...r.students].sort((a, b) =>
        sort === 'name' ? a.name.localeCompare(b.name)
        : sort === 'violations' ? b.violations - a.violations
        : sort === 'similarity' ? (b.plagiarismMax ?? -1) - (a.plagiarismMax ?? -1)
        : (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name))
    : [];
  return (
    <Page
      title={r ? `Report · ${r.test.title}` : 'Test report'}
      actions={r && (
        <div className="flex gap-2 print:hidden">
          <Link className="btn-secondary" href={`/tests/monitor?id=${id}`}>Monitor</Link>
          {canExport && <button className="btn-secondary" onClick={() => void exp('csv')}>Export CSV</button>}
          {canExport && <button className="btn-secondary" onClick={() => void exp('xlsx')}>Export Excel</button>}
          <button className="btn-secondary" onClick={() => window.print()}>Print / PDF</button>
        </div>
      )}
    >
      <ErrorBox error={error} />
      {!r ? !error && <Spinner /> : (
        <>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{when(r.test.startsAt)} – {when(r.test.endsAt)} · {r.test.durationMin} min · <Badge>{r.test.status}</Badge></p>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Started / assigned" value={`${r.summary.started} / ${r.summary.assigned}`} sub={`${r.summary.notStarted} not started · ${r.summary.inProgress} in progress`} />
            <Stat label="Finished" value={r.summary.submitted + r.summary.autoSubmitted + r.summary.terminated} sub={`${r.summary.autoSubmitted} auto-submitted · ${r.summary.terminated} terminated`} />
            <Stat label="Average score" value={pct(r.summary.score.mean)} sub={`median ${pct(r.summary.score.median)} · range ${pct(r.summary.score.min)}–${pct(r.summary.score.max)}`} />
            <Stat label="Proctoring violations" value={r.summary.violations.total} sub={`${r.summary.violations.studentsWithAny} students with any`} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Score distribution">
              <BarChart testId="chart-distribution" title="Students by score band" valueLabel="Students" data={r.distribution.map((d) => ({ label: `${d.from}%`, value: d.count, tip: `${d.from}–${d.to === 100 ? 100 : d.to - 1}%` }))} />
            </Section>
            <Section title="Time taken">
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-slate-500">Mean</dt><dd className="tabular-nums">{fmt(r.summary.minutes.mean)} min</dd>
                <dt className="text-slate-500">Median</dt><dd className="tabular-nums">{fmt(r.summary.minutes.median)} min</dd>
                <dt className="text-slate-500">Fastest</dt><dd className="tabular-nums">{fmt(r.summary.minutes.min)} min</dd>
                <dt className="text-slate-500">Slowest</dt><dd className="tabular-nums">{fmt(r.summary.minutes.max)} min</dd>
                <dt className="text-slate-500">Score std. dev.</dt><dd className="tabular-nums">{fmt(r.summary.score.stddev)}</dd>
              </dl>
            </Section>
          </div>
          <Section title="Questions">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-1.5">#</th><th>Question</th><th className="text-right">Points</th><th className="text-right">Attempted</th><th className="text-right">Avg score</th><th className="text-right">Full marks</th><th className="text-right">Avg submissions</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {r.questions.map((q, i) => (
                  <tr key={q.questionId}>
                    <td className="py-1.5 text-slate-500">Q{i + 1}</td>
                    <td><Link className="text-brand-600 hover:underline dark:text-brand-100" href={`/reports/question?id=${q.questionId}`}>{q.title}</Link> <span className="text-xs text-slate-500">{q.type}</span></td>
                    <td className="text-right tabular-nums">{q.points}</td>
                    <td className="text-right tabular-nums">{q.attempted}</td>
                    <td className="text-right tabular-nums">{pct(q.avgScore)}</td>
                    <td className="text-right tabular-nums">{pct(q.fullScorePercent)}</td>
                    <td className="text-right tabular-nums">{fmt(q.avgSubmissions)}</td>
                    <td className="text-right"><FlagBadge flag={q.flag} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Plagiarism testId={id} manage={can('test:manage')} onDone={() => void load()} />
          <Section
            title={`Students (${r.students.length})`}
            actions={
              <select className="input w-auto py-1" aria-label="Sort students" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="rank">Sort by rank</option><option value="name">Sort by name</option><option value="violations">Sort by violations</option><option value="similarity">Sort by similarity</option>
              </select>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="students-table">
                <thead className="text-left text-slate-500">
                  <tr><th className="py-1.5">Rank</th><th>Student</th><th>Status</th><th className="text-right">Score</th><th className="text-right">Minutes</th><th className="text-right">Violations</th><th className="text-right">Similarity</th>
                    {r.questions.map((q, i) => <th key={q.questionId} className="text-right" title={`${q.title} (score %)`}>Q{i + 1} %</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {students.map((s) => (
                    <tr key={s.userId}>
                      <td className="py-1.5 tabular-nums">{s.rank ?? '—'}</td>
                      <td><Link className="hover:underline" href={`/reports/student?id=${s.userId}`}>{s.name}</Link> <span className="text-xs text-slate-500">{s.email}</span></td>
                      <td><Badge tone={STATUS_TONE[s.status] ?? 'slate'}>{ATTEMPT_LABEL[s.status] ?? s.status}</Badge></td>
                      <td className="text-right tabular-nums">{s.score === null ? '—' : `${fmt(s.score)} / ${s.maxScore} (${pct(s.percent)})`}</td>
                      <td className="text-right tabular-nums">{fmt(s.minutes)}</td>
                      <td className={`text-right tabular-nums ${s.violations > 0 ? 'font-medium text-rose-700 dark:text-rose-300' : ''}`}>{s.violations}</td>
                      <td className="text-right tabular-nums">{s.plagiarismMax === null ? '—' : `${s.plagiarismMax}%`}</td>
                      {r.questions.map((q) => <td key={q.questionId} className="text-right tabular-nums">{s.perQuestion[q.questionId] === undefined ? '—' : fmt(s.perQuestion[q.questionId])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </Page>
  );
}

function Plagiarism({ testId, manage, onDone }: { testId: string; manage: boolean; onDone: () => void }) {
  const [p, setP] = useState<Plag | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<Pair | null>(null);
  const [scope, setScope] = useState<'test' | 'institution'>('test');
  const load = useCallback(() => get<Plag>(`/api/v1/tests/${testId}/plagiarism`).then((x) => (setP(x), x)).catch((e) => (setError(e), null)), [testId]);
  const busy = p?.run?.status === 'queued' || p?.run?.status === 'running';
  useEffect(() => {
    if (testId) void load();
  }, [testId, load]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      const x = await load();
      if (x && x.run && x.run.status !== 'queued' && x.run.status !== 'running') onDone();
    }, 1500);
    return () => clearInterval(t);
  }, [busy, load, onDone]);
  const run = async () => {
    setError(null);
    await post(`/api/v1/tests/${testId}/plagiarism`, { scope }).catch(setError);
    await load();
  };
  const show = async (x: Plag['pairs'][number]) => {
    setOpen(await get<Pair>(`/api/v1/plagiarism/${p!.run!.id}/pairs/${x.questionId}/${x.subA}/${x.subB}`).catch((e) => (setError(e), null)));
  };
  return (
    <Section
      title="Similarity check"
      actions={manage && (
        <>
          <select className="input w-auto py-1" aria-label="Compare with" value={scope} disabled={busy} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="test">Within this test</option>
            <option value="institution">Also other tests with the same questions</option>
          </select>
          <button className="btn-primary" disabled={busy} onClick={() => void run()}>{busy ? <><Spinner /> Checking…</> : p?.run ? 'Run again' : 'Run similarity check'}</button>
        </>
      )}
    >
      <ErrorBox error={error} />
      {!p ? <Spinner /> : !p.run ? (
        <p className="text-sm text-slate-500">No similarity check has been run for this test yet.{!manage && ' A teacher can start one.'}</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-400" data-testid="plag-status">
            {p.run.status === 'done'
              ? `Checked ${p.run.counts?.submissions ?? 0} submissions${p.run.params?.scope === 'institution' ? ` against ${p.run.counts?.otherTests ?? 0} answers from other tests` : ''} on ${when(p.run.finishedAt)}: ${p.pairs.length} pair${p.pairs.length === 1 ? '' : 's'} at or above ${Math.round((p.run.params?.threshold ?? 0.75) * 100)}% similarity.`
              : p.run.status === 'failed' ? `The check failed: ${p.run.error ?? 'unknown error'}` : 'Checking…'}
          </p>
          <p className="mb-3 text-xs text-slate-500">Similarity compares the structure of the code (names, literals and starter code are ignored). A high score is a reason to look, not proof of copying.</p>
          {p.pairs.length > 0 && (
            <table className="w-full text-sm" data-testid="plag-pairs">
              <thead className="text-left text-slate-500"><tr><th className="py-1.5">Question</th><th>Student A</th><th>Student B</th><th className="text-right">Similarity</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {p.pairs.map((x) => (
                  <tr key={`${x.questionId}:${x.subA}:${x.subB}`}>
                    <td className="py-1.5">{x.question}</td>
                    <td><Person who={x.a} testId={testId} /></td>
                    <td><Person who={x.b} testId={testId} /></td>
                    <td className="text-right font-medium tabular-nums">{x.similarity}%</td>
                    <td className="text-right print:hidden"><button className="text-brand-600 hover:underline dark:text-brand-100" onClick={() => void show(x)}>Compare</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {open && (
        <div className="mt-4" data-testid="plag-compare">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <b>{open.similarity}% similar</b><span className="text-slate-500">· {open.matched} matching fingerprints · highlighted lines match</span>
            <button className="ml-auto text-slate-500 hover:underline" onClick={() => setOpen(null)}>Close</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Source side={open.a} />
            <Source side={open.b} />
          </div>
        </div>
      )}
    </Section>
  );
}

/** A student in a pair; answers from another test are labelled with that test. */
function Person({ who, testId }: { who: Who; testId: string }) {
  return (
    <>
      {who.name}
      {who.test.id !== testId && <span className="ml-1 text-xs text-slate-500" data-testid="other-test">in {who.test.title}</span>}
    </>
  );
}

function Source({ side }: { side: Side }) {
  const hit = (n: number) => side.regions.some(([a, b]) => n >= a && n <= b);
  return (
    <div className="min-w-0 rounded-md border border-slate-200 dark:border-slate-800">
      <div className="border-b border-slate-200 px-2 py-1 text-xs dark:border-slate-800">
        <b>{side.name}</b> <span className="text-slate-500">{side.email} · {side.test.title} · {side.runtime} · {when(side.submittedAt)}</span>
      </div>
      <pre className="max-h-[480px] overflow-auto py-1 font-mono text-xs leading-5">
        {side.source.split('\n').map((line, i) => (
          <div key={i} className={hit(i + 1) ? 'bg-amber-100 dark:bg-amber-950' : ''} data-match={hit(i + 1) || undefined}>
            <span className="inline-block w-10 select-none pr-2 text-right text-slate-400">{i + 1}</span>{line || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}
