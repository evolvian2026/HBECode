'use client';

import { DIALECT_INFO, RUNTIMES, RUNTIME_IDS, questionProblems, type QuestionInput, type RuntimeId } from '@hbe/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '@/lib/api';
import { useRequireUser, useSession } from '@/lib/session';
import { CodingFields, emptyCoding } from '@/components/authoring/coding';
import { DbFields, emptyDb } from '@/components/authoring/db';
import { emptyWeb, WebFields } from '@/components/authoring/web';
import { Badge, ErrorBox, Page, Spinner } from '@/components/ui';

interface Detail {
  id: string;
  status: string;
  global: boolean;
  canEdit: boolean;
  versionNo: number;
  latestIsPublished: boolean;
  validation: null | {
    ok: boolean;
    pending: boolean;
    problems: string[];
    checkedAt: string | null;
    runtimes: Record<string, { ok: boolean; maxCpuMs: number; limitMs: number; verdicts: string[]; compileOutput?: string }>;
  };
  problems: string[];
  question: QuestionInput;
}

function emptyFor(type: string | null): QuestionInput {
  if (type === 'web' || type === 'react') return emptyWeb(type === 'react' ? 'react' : 'html');
  if (type === 'db') return emptyDb();
  return emptyCoding();
}

const TITLES = { coding: 'New coding question', web: 'New web question', db: 'New database question' } as const;

/** Validation rows: coding runtimes, DB dialects, web reference/starter. */
function targetLabel(key: string): string {
  if (key in RUNTIMES) return RUNTIMES[key as RuntimeId].label;
  if (key in DIALECT_INFO) return DIALECT_INFO[key as keyof typeof DIALECT_INFO].label;
  if (key.endsWith(':starter')) return 'Starter files (must fail a hidden check)';
  return `Reference (${key === 'react' ? 'React' : 'HTML'})`;
}
const targetOrder = (k: string) => {
  const i = RUNTIME_IDS.indexOf(k as RuntimeId);
  return i >= 0 ? i : k.endsWith(':starter') ? 100 : 50;
};

export default function EditQuestion() {
  const user = useRequireUser();
  const { can } = useSession();
  const [id, setId] = useState<string | null>(null);
  const [q, setQ] = useState<QuestionInput>(emptyCoding);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const writable = can('question:write') && (detail?.canEdit ?? true);

  const load = async (qid: string) => {
    const d = await get<Detail>(`/api/v1/questions/${qid}`);
    setDetail(d);
    setQ(d.question);
    return d;
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qid = params.get('id');
    setId(qid);
    if (!qid) setQ(emptyFor(params.get('type')));
    else if (user) load(qid).catch(setError);
  }, [user]);

  // Poll while the sandbox validates the reference solutions.
  useEffect(() => {
    if (!id || !detail?.validation?.pending) return;
    const t = setInterval(() => void load(id).catch(() => undefined), 1500);
    return () => clearInterval(t);
  }, [id, detail?.validation?.pending]);

  const problems = useMemo(() => questionProblems(q), [q]);
  // The type never changes while editing, so each type-specific editor updates its own shape.
  const narrow = <T extends QuestionInput>() => (f: (x: T) => T) => setQ((x) => f(x as T));

  const save = async (): Promise<string | null> => {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      if (id) {
        const r = await put<{ versionNo: number }>(`/api/v1/questions/${id}`, q);
        await load(id);
        setNotice(`Saved (version ${r.versionNo}).`);
        return id;
      }
      const r = await post<{ id: string }>('/api/v1/questions', q);
      history.replaceState(null, '', `/questions/edit/?id=${r.id}`);
      setId(r.id);
      await load(r.id);
      setNotice('Created.');
      return r.id;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const validate = async (publishIfValid: boolean) => {
    const qid = await save();
    if (!qid) return;
    try {
      await post(`/api/v1/questions/${qid}/validate`, { publishIfValid });
      await load(qid);
    } catch (e) {
      setError(e);
    }
  };

  if (!user) return null;
  if (id && !detail && !error) return <div className="p-8 text-center"><Spinner /></div>;
  const v = detail?.validation;

  return (
    <Page
      title={id ? q.title || 'Untitled' : TITLES[q.type]}
      actions={
        writable && (
          <>
            <button className="btn-secondary" disabled={busy} onClick={() => void save()}>Save draft</button>
            <button className="btn-secondary" disabled={busy || problems.length > 0} title={problems.length ? 'Fix the checklist first' : ''} onClick={() => void validate(false)}>Validate</button>
            <button className="btn-primary" disabled={busy || problems.length > 0} onClick={() => void validate(true)}>Validate &amp; publish</button>
          </>
        )
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/questions" className="text-slate-500 hover:underline">← Question bank</Link>
        {detail && <Badge>{detail.status}</Badge>}
        {detail && <span className="text-slate-500">v{detail.versionNo}{detail.latestIsPublished ? ' (published — saving creates a new version)' : ''}</span>}
        {detail?.global && <Badge tone="blue">global</Badge>}
        {id && detail?.status === 'published' && <Link className="ml-auto text-brand-600 hover:underline" href={`/solve?id=${id}`}>Open in IDE</Link>}
        {id && writable && (
          <button
            className="text-rose-600 hover:underline"
            onClick={async () => {
              if (!confirm('Delete this question? Published questions are archived instead.')) return;
              await del(`/api/v1/questions/${id}`).catch(setError);
              location.assign('/questions/');
            }}
          >
            Delete
          </button>
        )}
      </div>
      <ErrorBox error={error} />
      {notice && <p className="mb-2 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="space-y-4">
            {q.type === 'web' ? (
              <WebFields q={q} setQ={narrow<typeof q>()} isNew={!id} writable={writable} />
            ) : q.type === 'db' ? (
              <DbFields q={q} setQ={narrow<typeof q>()} writable={writable} />
            ) : (
              <CodingFields q={q} setQ={narrow<typeof q>()} writable={writable} />
            )}
          </div>
        </div>

        <aside className="space-y-4">
          {!writable ? (
            <div className="card text-sm text-slate-600 dark:text-slate-400">
              {detail?.global ? 'Global question: read-only. Only super admins can edit the global bank; drivers and reference solutions are hidden.' : 'Read-only view.'}
            </div>
          ) : (
          <div className="card">
            <h3 className="mb-2 text-sm font-medium">Publish checklist</h3>
            {problems.length === 0 ? <p className="text-sm text-emerald-700 dark:text-emerald-400">Structure is complete. Validation will run every reference solution against every test{q.type === 'web' ? ', and check the starter files fail' : ''}.</p> : (
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-400">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            )}
          </div>
          )}
          {v && (
            <div className="card" data-testid="validation">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                Validation {v.pending ? <><Spinner /> running…</> : v.ok ? <Badge tone="green">passed</Badge> : <Badge tone="red">failed</Badge>}
              </h3>
              <ul className="space-y-1 text-xs">
                {Object.entries(v.runtimes).sort(([a], [b]) => targetOrder(a) - targetOrder(b)).map(([rt, r]) => (
                  <li key={rt} className="flex justify-between gap-2">
                    <span>{targetLabel(rt)}</span>
                    <span className={r.ok ? 'text-emerald-600' : 'text-rose-600'}>{r.ok ? `✓ ${r.maxCpuMs}/${r.limitMs} ms` : '✗'}</span>
                  </li>
                ))}
              </ul>
              {v.problems.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-rose-700 dark:text-rose-400">{v.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}
