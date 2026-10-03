'use client';

import { useCallback, useEffect, useState } from 'react';
import { get, post } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { BarChart, Stat } from '@/components/charts/bar-chart';
import { day, Section, when } from '@/components/reports';
import { Badge, ErrorBox, Page, Spinner } from '@/components/ui';

interface Platform {
  tenants: { id: string; name: string; status: string; students: number; questions: number; tests: number; submits30: number; active30: number }[];
  daily: { day: string; runs: number; submits: number; accepted: number; internal_errors: number; guest_runs: number }[];
  queue: { queued: number; running: number; oldest_queued_sec: number | null; stuck: number; lists: Record<string, number> };
  executors: { id: string; lastSeen: string; runtimes: string[] }[];
}

export default function PlatformPage() {
  const user = useRequireUser();
  const [r, setR] = useState<Platform | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [rebuilt, setRebuilt] = useState<string | null>(null);
  const load = useCallback(() => get<Platform>('/api/v1/reports/platform').then(setR).catch(setError), []);
  useEffect(() => {
    if (!user) return;
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [user, load]);
  if (!user) return null;
  const rebuild = async () => {
    setRebuilt('Rebuilding…');
    const x = await post<{ ms: number }>('/api/v1/reports/rebuild').catch((e) => (setError(e), null));
    setRebuilt(x ? `Rollups rebuilt in ${(x.ms / 1000).toFixed(1)} s.` : null);
    await load();
  };
  const last = r?.daily.at(-1);
  return (
    <Page title="Platform" actions={<button className="btn-secondary" onClick={() => void rebuild()}>Rebuild report rollups</button>}>
      <ErrorBox error={error} />
      {rebuilt && <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{rebuilt}</p>}
      {!r ? !error && <Spinner /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Queued / running" value={`${r.queue.queued} / ${r.queue.running}`} sub={r.queue.oldest_queued_sec === null ? 'queue empty' : `oldest waiting ${r.queue.oldest_queued_sec}s`} />
            <Stat label="Stuck (lease expired)" value={r.queue.stuck} />
            <Stat label="Executors seen (5 min)" value={r.executors.length} />
            <Stat label="Internal errors today" value={last?.internal_errors ?? 0} sub={`${last?.submits ?? 0} submits · ${last?.runs ?? 0} runs today`} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Queue">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {Object.entries(r.queue.lists).map(([k, v]) => <tr key={k}><td className="py-1.5">{k}</td><td className="text-right tabular-nums">{v}</td></tr>)}
                </tbody>
              </table>
            </Section>
            <Section title="Executors">
              {r.executors.length === 0 ? <p className="text-sm text-slate-500">No executor has polled in the last 5 minutes.</p> : (
                <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800" data-testid="executors">
                  {r.executors.map((e) => (
                    <li key={e.id} className="py-1.5">
                      <div className="flex"><span className="font-mono text-xs">{e.id}</span><span className="ml-auto text-xs text-slate-500">{when(e.lastSeen)}</span></div>
                      <div className="mt-1 flex flex-wrap gap-1">{e.runtimes.map((x) => <Badge key={x}>{x}</Badge>)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
          <Section title="Last 30 days">
            <div className="grid gap-6 md:grid-cols-2">
              <BarChart testId="chart-platform-submits" title="Submissions per day" valueLabel="Submissions" data={r.daily.map((d) => ({ label: day(d.day), value: d.submits, tip: `${day(d.day)} · ${d.runs} runs · ${d.guest_runs} guest runs` }))} />
              <BarChart title="Internal errors per day" valueLabel="Internal errors" data={r.daily.map((d) => ({ label: day(d.day), value: d.internal_errors }))} />
            </div>
          </Section>
          <Section title={`Institutions (${r.tenants.length})`}>
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-1.5">Institution</th><th>Status</th><th className="text-right">Students</th><th className="text-right">Questions</th><th className="text-right">Tests</th><th className="text-right">Submits (30d)</th><th className="text-right">Active (30d)</th></tr></thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {r.tenants.map((t) => (
                  <tr key={t.id}><td className="py-1.5">{t.name}</td><td><Badge tone={t.status === 'active' ? 'green' : 'slate'}>{t.status}</Badge></td><td className="text-right tabular-nums">{t.students}</td><td className="text-right tabular-nums">{t.questions}</td><td className="text-right tabular-nums">{t.tests}</td><td className="text-right tabular-nums">{t.submits30}</td><td className="text-right tabular-nums">{t.active30}</td></tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </Page>
  );
}
