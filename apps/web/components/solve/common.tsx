'use client';

import { VERDICT_LABELS, type ClientSubmission, type Verdict } from '@hbe/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, put, watchSubmission } from '@/lib/api';
import { examHeaders, useExam } from '@/components/exam/context';
import type { SessionUser } from '@hbe/shared';
import { Difficulty, ErrorBox, Spinner } from '@/components/ui';

export const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable: server-side drafts still work */
    }
  },
};

export interface Draft {
  runtime: string;
  code: string;
}

export function verdictTone(v: Verdict | null | undefined) {
  if (v === 'AC') return 'text-emerald-600 dark:text-emerald-400';
  if (!v) return 'text-slate-500';
  return 'text-rose-600 dark:text-rose-400';
}

/** Draft saving: localStorage immediately, the server after 1.5 s of inactivity. */
export function useDraftSaver(questionId: string, user: SessionUser) {
  const [saved, setSaved] = useState<'saved' | 'saving' | 'offline' | ''>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exam = useExam();
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const save = useCallback(
    (key: string, code: string) => {
      store.set(`${draftPrefix(exam?.attemptId)}${questionId}:${key}`, code);
      if (user.role === 'guest') return;
      setSaved('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const req = exam
          ? api('PUT', `/api/v1/attempts/${exam.attemptId}/drafts/${questionId}/${key}`, { code }, examHeaders(exam))
          : put(`/api/v1/drafts/${questionId}/${key}`, { code });
        req
          .then(() => setSaved('saved'))
          .catch((e) => {
            setSaved('offline');
            if (exam && e instanceof ApiError && e.status === 409) exam.onSessionError(e.detail ?? '');
          });
      }, 1500);
    },
    [questionId, user, exam],
  );
  const label = saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved === 'offline' ? 'Saved locally' : '';
  return { save, label };
}

/** Local draft keys: practice and each test attempt are kept apart. */
export const draftPrefix = (attemptId?: string) => (attemptId ? `hbe-exam-draft:${attemptId}:` : 'hbe-draft:');

export const initialDraft = (drafts: Draft[], questionId: string, key: string, fallback: string, attemptId?: string) =>
  drafts.find((d) => d.runtime === key)?.code ?? store.get(`${draftPrefix(attemptId)}${questionId}:${key}`) ?? fallback;

/** Create a run/submit and follow it over SSE (polling fallback). */
export function useExecution(questionId: string) {
  const [result, setResult] = useState<ClientSubmission | null>(null);
  const [busy, setBusy] = useState<'run' | 'submit' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const stop = useRef<(() => void) | null>(null);
  const exam = useExam();
  useEffect(() => () => stop.current?.(), []);
  const execute = async (kind: 'run' | 'submit', runtime: string, code: string, extra: Record<string, unknown> = {}) => {
    setBusy(kind);
    setError(null);
    setResult(null);
    stop.current?.();
    try {
      const { id } = exam
        ? await api<{ id: string }>('POST', '/api/v1/submissions', { questionId, runtime, code, kind, attemptId: exam.attemptId, ...extra }, examHeaders(exam))
        : await api<{ id: string }>('POST', '/api/v1/submissions', { questionId, runtime, code, kind, ...extra });
      stop.current = watchSubmission<ClientSubmission>(id, (s) => {
        setResult(s);
        if (s.status === 'done' || s.status === 'failed') setBusy(null);
      });
    } catch (e) {
      setError(e);
      setBusy(null);
      if (exam && e instanceof ApiError && e.status === 409) exam.onSessionError(e.detail ?? '');
    }
  };
  return { result, busy, error, execute };
}

export function TopBar({ title, difficulty, preview, busy, onRun, onSubmit, children }: { title: string; difficulty: string; preview: boolean; busy: 'run' | 'submit' | null; onRun: () => void; onSubmit: () => void; children?: ReactNode }) {
  const exam = useExam();
  return (
    <div className="flex h-11 items-center gap-3 border-b border-slate-200 px-3 dark:border-slate-800">
      {!exam && <Link href="/practice" className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">← Practice</Link>}
      <span className="font-medium">{title}</span>
      <Difficulty value={difficulty} />
      {preview && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">preview (unpublished)</span>}
      {children}
      <div className="ml-auto flex items-center gap-2">
        <button className="btn-secondary" disabled={busy !== null} onClick={onRun}>{busy === 'run' ? <Spinner /> : '▶'} Run</button>
        <button className="btn-primary" disabled={busy !== null} onClick={onSubmit}>{busy === 'submit' ? <Spinner /> : null} {exam ? 'Submit answer' : 'Submit'}</button>
      </div>
    </div>
  );
}

/** Status line + hidden-test chips shared by every question type; `renderVisible` draws visible tests. */
export function ResultShell({ result, busy, error, renderVisible }: { result: ClientSubmission | null; busy: string | null; error: unknown; renderVisible: (t: ClientSubmission['tests'][number]) => ReactNode }) {
  if (error) {
    if (error instanceof ApiError && error.status === 429) return <ErrorBox error={new Error(`You're submitting too fast. ${error.detail ?? ''}`)} />;
    return <ErrorBox error={error} />;
  }
  if (!result) return busy ? <p className="text-slate-500"><Spinner /> Queued…</p> : <p className="text-slate-500">Run or submit to see results.</p>;
  if (result.status === 'queued' || result.status === 'running')
    return <p className="text-slate-500"><Spinner /> {result.status === 'queued' ? 'Queued…' : 'Running…'}</p>;
  const hidden = result.tests.filter((t) => t.hidden);
  const visible = result.tests.filter((t) => !t.hidden);
  return (
    <div className="space-y-3" data-testid="result">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className={`text-lg font-semibold ${verdictTone(result.verdict)}`} data-testid="verdict">
          {result.verdict ? VERDICT_LABELS[result.verdict] : 'Failed'}
        </span>
        {result.verdict !== 'CE' && <span className="text-slate-500">{result.passed}/{result.total} tests passed</span>}
        {result.kind === 'submit' && result.score !== null && <span className="text-slate-500">Score: {result.score}%</span>}
      </div>
      {result.compileOutput && <pre className="overflow-x-auto rounded bg-rose-50 p-2 font-mono text-xs whitespace-pre-wrap text-rose-900 dark:bg-rose-950 dark:text-rose-200">{result.compileOutput}</pre>}
      {visible.map((t) => <div key={t.ordinal}>{renderVisible(t)}</div>)}
      {hidden.length > 0 && (
        <div>
          <div className="label">Hidden tests (details are not shown)</div>
          <div className="flex flex-wrap gap-1.5" data-testid="hidden-results">
            {hidden.map((t, i) => (
              <span key={t.ordinal} title={VERDICT_LABELS[t.verdict]} className={`rounded px-2 py-0.5 text-xs font-medium ${t.verdict === 'AC' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                #{i + 1} {t.verdict}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SaveLabel({ label }: { label: string }) {
  return <span className="text-xs text-slate-400" aria-live="polite">{label}</span>;
}
