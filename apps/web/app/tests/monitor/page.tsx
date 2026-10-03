'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { get, getBlobUrl, openRealtime, post } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { Badge, ErrorBox, Page, Spinner } from '@/components/ui';

interface Row {
  userId: string; name: string; email: string;
  attempt: null | {
    id: string; status: string; startedAt: string; deadlineAt: string; submittedAt: string | null; submitReason: string | null;
    score: number | null; maxScore: number | null; answered: number; violationCount: number; warningLevel: number; extraMinutes: number;
    lastHeartbeatAt: string | null; online: boolean; heartbeatGap: boolean;
    lastFlag: { type: string; label: string; at: string } | null;
    pendingDevices: { id: string; createdAt: string; ip: string | null; userAgent: string | null; fingerprint: string | null }[];
  };
}
interface Live { test: { id: string; title: string; status: string; endsAt: string; questionCount: number }; serverNow: string; rows: Row[] }
interface Timeline {
  events: { id: number; type: string; label: string; severity: string; counted: boolean; source: string; serverTs: string; data: Record<string, unknown> }[];
  sessions: { id: string; status: string; ip: string | null; userAgent: string | null; createdAt: string }[];
  snapshots: { id: string; eventType: string; createdAt: string }[];
}

const STATUS: Record<string, { label: string; tone: 'slate' | 'green' | 'red' | 'amber' | 'blue' }> = {
  in_progress: { label: 'In progress', tone: 'blue' },
  submitted: { label: 'Submitted', tone: 'green' },
  auto_submitted: { label: 'Auto-submitted', tone: 'amber' },
  terminated: { label: 'Terminated', tone: 'red' },
};
const SEV = { info: 'text-slate-500', low: 'text-amber-600', medium: 'text-orange-600', high: 'text-rose-600' } as Record<string, string>;
const left = (deadline: string, offset: number) => {
  const ms = Date.parse(deadline) - (Date.now() + offset);
  if (ms <= 0) return '0:00';
  const m = Math.floor(ms / 60_000);
  return `${m}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;
};

export default function Monitor() {
  const user = useRequireUser();
  const [id, setId] = useState('');
  useEffect(() => setId(new URLSearchParams(location.search).get('id') ?? ''), []);
  const [live, setLive] = useState<Live | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [, tick] = useState(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const l = await get<Live>(`/api/v1/tests/${id}/live`);
      setLive(l);
      setOffset(Date.parse(l.serverNow) - Date.now());
    } catch (e) {
      setError(e);
    }
  }, [id]);
  const loadTimeline = useCallback(async (attemptId: string) => setTimeline(await get<Timeline>(`/api/v1/attempts/${attemptId}/timeline`)), []);

  useEffect(() => {
    if (!user || !id) return;
    void load();
    // Realtime pings trigger a (debounced) refresh; a slow poll covers missed messages.
    const stop = openRealtime({ channel: 'monitor', testId: id }, (m) => {
      if (m.type === 'subscribed') setConnected(true);
      if (m.type === 'attempt_changed') {
        if (pending.current) clearTimeout(pending.current);
        pending.current = setTimeout(() => void load(), 250);
      }
    });
    const poll = setInterval(() => void load(), 10_000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      stop();
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [user, id, load]);

  useEffect(() => {
    if (open) {
      const a = live?.rows.find((r) => r.attempt?.id === open)?.attempt;
      if (a) void loadTimeline(open).catch(setError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, live]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e);
    }
  };

  if (!user) return null;
  if (!live) return <Page title="Live monitor">{error ? <ErrorBox error={error} /> : <Spinner />}</Page>;
  const rows = live.rows;
  const started = rows.filter((r) => r.attempt).length;
  const inProgress = rows.filter((r) => r.attempt?.status === 'in_progress').length;
  const pendingCount = rows.reduce((n, r) => n + (r.attempt?.pendingDevices.length ?? 0), 0);
  return (
    <Page title={`Live monitor — ${live.test.title}`} actions={<><Link className="btn-secondary" href={`/reports/test?id=${id}`}>Report</Link><Link className="btn-secondary" href={`/tests/edit?id=${id}`}>Test details</Link></>}>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={connected ? 'green' : 'amber'}>{connected ? 'Live' : 'Polling'}</Badge>
        <span>{rows.length} assigned · {started} started · {inProgress} in progress</span>
        {pendingCount > 0 && <Badge tone="red">{pendingCount} device approval{pendingCount === 1 ? '' : 's'} waiting</Badge>}
        <span className="text-slate-500">Test status: {live.test.status}</span>
      </div>
      <ErrorBox error={error} />
      <table className="w-full text-sm" data-testid="monitor-table">
        <thead className="text-left text-slate-500">
          <tr><th className="py-2">Student</th><th>Status</th><th>Time left</th><th>Progress</th><th>Score</th><th>Violations</th><th>Last flag</th><th>Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {rows.map((r) => {
            const a = r.attempt;
            return (
              <Fragment key={r.userId}>
                <tr data-testid={`row-${r.email}`}>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      {a?.status === 'in_progress' && <span className={`h-2 w-2 rounded-full ${a.online ? 'bg-emerald-500' : 'bg-rose-500'}`} title={a.online ? 'Online' : 'No heartbeat'} />}
                      <span className="font-medium">{r.name}</span>
                    </div>
                    <div className="text-xs text-slate-500">{r.email}</div>
                  </td>
                  <td>{a ? <Badge tone={STATUS[a.status]?.tone}>{STATUS[a.status]?.label ?? a.status}</Badge> : <span className="text-slate-400">Not started</span>}
                    {a?.heartbeatGap && <div className="text-xs text-rose-600">heartbeat lost</div>}</td>
                  <td className="font-mono tabular-nums">{a?.status === 'in_progress' ? left(a.deadlineAt, offset) : '—'}{a && a.extraMinutes > 0 && <span className="ml-1 text-xs text-slate-500">(+{a.extraMinutes})</span>}</td>
                  <td>{a ? `${a.answered}/${live.test.questionCount}` : '—'}</td>
                  <td>{a?.score !== null && a?.score !== undefined ? `${a.score}/${a.maxScore}` : '—'}</td>
                  <td data-testid="violation-count" className={a && a.violationCount > 0 ? 'font-medium text-rose-600' : ''}>{a?.violationCount ?? '—'}</td>
                  <td className="text-xs">{a?.lastFlag ? <>{a.lastFlag.label}<div className="text-slate-500">{new Date(a.lastFlag.at).toLocaleTimeString()}</div></> : '—'}</td>
                  <td className="space-x-2 text-xs whitespace-nowrap">
                    {a?.status === 'in_progress' && (
                      <>
                        <button className="text-brand-600 hover:underline" onClick={() => { const m = prompt('Message to the student'); if (m) void act(() => post(`/api/v1/attempts/${a.id}/warn`, { message: m })); }}>Warn</button>
                        <button className="text-brand-600 hover:underline" onClick={() => void act(() => post(`/api/v1/attempts/${a.id}/extend`, { minutes: 10 }))}>+10 min</button>
                        <button className="text-rose-600 hover:underline" onClick={() => { const reason = prompt('Reason for ending this attempt'); if (reason) void act(() => post(`/api/v1/attempts/${a.id}/terminate`, { reason })); }}>Terminate</button>
                      </>
                    )}
                    {a && <button className="text-brand-600 hover:underline" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Hide' : 'Timeline'}</button>}
                  </td>
                </tr>
                {a?.pendingDevices.map((d) => (
                  <tr key={d.id} className="bg-rose-50 dark:bg-rose-950/40" data-testid="device-request">
                    <td colSpan={6} className="px-2 py-2 text-sm">
                      <b>Second device</b> wants to open this attempt · {new Date(d.createdAt).toLocaleTimeString()} · {d.ip ?? 'unknown IP'} · <span className="text-xs text-slate-500">{(d.userAgent ?? '').slice(0, 80)}</span>
                    </td>
                    <td colSpan={2} className="space-x-2 text-right">
                      <button className="btn-primary py-1" onClick={() => void act(() => post(`/api/v1/attempts/${a.id}/devices/${d.id}/approve`))}>Approve device</button>
                      <button className="btn-secondary py-1" onClick={() => void act(() => post(`/api/v1/attempts/${a.id}/devices/${d.id}/deny`))}>Deny</button>
                    </td>
                  </tr>
                ))}
                {a && open === a.id && timeline && (
                  <tr>
                    <td colSpan={8} className="bg-slate-50 p-3 dark:bg-slate-900">
                      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                        <ol className="max-h-72 space-y-0.5 overflow-y-auto font-mono text-xs" data-testid="timeline">
                          {timeline.events.map((e) => (
                            <li key={e.id} className={SEV[e.severity]}>
                              {new Date(e.serverTs).toLocaleTimeString()} {e.counted ? '⚑ ' : ''}{e.label}
                              {typeof e.data.message === 'string' ? ` — “${e.data.message}”` : ''}{typeof e.data.minutes === 'number' ? ` (+${e.data.minutes} min)` : ''}
                            </li>
                          ))}
                        </ol>
                        <div className="space-y-2 text-xs">
                          <div className="font-medium">Devices</div>
                          {timeline.sessions.map((s) => <div key={s.id}>{s.status} · {s.ip ?? '?'} · {new Date(s.createdAt).toLocaleTimeString()}</div>)}
                          {timeline.snapshots.length > 0 && <div className="font-medium">Webcam snapshots (viewing is audited)</div>}
                          {timeline.snapshots.map((s) => (
                            <div key={s.id}>
                              {images[s.id] ? <img src={images[s.id]} alt={`Snapshot after ${s.eventType}`} className="w-40 rounded" /> : (
                                <button className="text-brand-600 hover:underline" onClick={() => void getBlobUrl(`/api/v1/attempts/${a.id}/snapshots/${s.id}`).then((u) => setImages((m) => ({ ...m, [s.id]: u }))).catch(setError)}>
                                  View snapshot ({s.eventType}, {new Date(s.createdAt).toLocaleTimeString()})
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="mt-4 text-slate-500">No students are assigned to this test.</p>}
      <p className="mt-6 text-xs text-slate-500">Flags are evidence for your review, not proof: browser proctoring can be evaded by a determined student (second device, virtual machine, modified browser).</p>
    </Page>
  );
}
