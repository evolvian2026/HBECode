'use client';

import type { AttemptNotice, AttemptView, StartAttemptResult, TestSettings } from '@hbe/shared';
import { ATTEMPT_TOKEN_HEADER } from '@hbe/shared';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, get } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { ErrorBox, Spinner } from '@/components/ui';
import { ExamContext, type ExamCtx } from '@/components/exam/context';
import { createWebcam, deviceFingerprint, useProctoring } from '@/components/exam/proctor';
import { CodingSolve, type CodingQuestion } from '@/components/solve/coding';
import { DbSolve, type DbQuestion } from '@/components/solve/db';
import { store, type Draft } from '@/components/solve/common';
import { WebSolve, type WebQuestion } from '@/components/solve/web';

interface MyTest {
  id: string;
  title: string;
  description: string;
  status: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  questionCount: number;
  settings: TestSettings;
  attempt: { id: string; status: string; deadlineAt: string; score: number | null; maxScore: number | null } | null;
}

type Phase = 'loading' | 'intro' | 'pending' | 'denied' | 'active' | 'ended' | 'replaced';
const STATUS_LABEL: Record<string, string> = { submitted: 'Submitted', auto_submitted: 'Submitted automatically', terminated: 'Ended by the proctor' };
const tokenKey = (testId: string) => `hbe-attempt-token:${testId}`;

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function Exam() {
  const user = useRequireUser();
  // Read after mount: during client-side navigation the URL changes only after the first render.
  const [testId, setTestId] = useState('');
  useEffect(() => setTestId(new URLSearchParams(location.search).get('test') ?? ''), []);
  const [test, setTest] = useState<MyTest | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [attemptId, setAttemptId] = useState('');
  const [token, setToken] = useState('');
  const [view, setView] = useState<AttemptView | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [offset, setOffset] = useState(0); // server clock - client clock
  const [now, setNow] = useState(() => Date.now());
  const [violations, setViolations] = useState({ count: 0, level: 0 });
  const [current, setCurrent] = useState(0);
  const [question, setQuestion] = useState<{ q: CodingQuestion | WebQuestion | DbQuestion; drafts: Draft[] } | null>(null);
  const [notices, setNotices] = useState<AttemptNotice[]>([]);
  const [fullscreen, setFullscreen] = useState(true);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [endStatus, setEndStatus] = useState('');
  const webcam = useRef<ReturnType<typeof createWebcam> | null>(null);
  const seen = useRef(new Set<string>());

  const loadTest = useCallback(async () => {
    const list = await get<MyTest[]>('/api/v1/my/tests');
    const t = list.find((x) => x.id === testId) ?? null;
    setTest(t);
    return t;
  }, [testId]);

  useEffect(() => {
    if (!user || !testId) return;
    loadTest()
      .then((t) => {
        if (!t) return setError(new Error('This test is not available to you.'));
        if (t.attempt && t.attempt.status !== 'in_progress') {
          setEndStatus(t.attempt.status);
          setPhase('ended');
        } else setPhase('intro');
      })
      .catch(setError);
  }, [user, testId, loadTest]);

  // The clock only displays the server's deadline; the server enforces it.
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    const f = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  const end = useCallback(
    async (status: string) => {
      setEndStatus(status);
      setPhase('ended');
      webcam.current?.stop();
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      await loadTest().catch(() => undefined);
    },
    [loadTest],
  );

  const onSessionError = useCallback(
    (detail: string) => {
      if (detail === 'attempt_closed') void end('auto_submitted');
      else if (detail === 'session_replaced' || detail === 'session_inactive') {
        setPhase('replaced');
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      }
    },
    [end],
  );

  const loadView = useCallback(
    async (id: string, tok: string) => {
      const v = await api<AttemptView>('GET', `/api/v1/attempts/${id}`, undefined, { [ATTEMPT_TOKEN_HEADER]: tok });
      setView(v);
      setDeadline(Date.parse(v.deadlineAt));
      setOffset(Date.parse(v.serverNow) - Date.now());
      setViolations({ count: v.violationCount, level: v.warningLevel });
      if (v.status !== 'in_progress') await end(v.status);
      return v;
    },
    [end],
  );

  const begin = async () => {
    if (!test) return;
    setError(null);
    try {
      if (test.settings.requireFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => undefined);
      if (test.settings.webcam === 'flagged' && !webcam.current) {
        webcam.current = createWebcam();
        if (!(await webcam.current.start())) webcam.current = null;
      }
      await startOrPoll();
    } catch (e) {
      setError(e);
    }
  };

  const startOrPoll = async () => {
    const saved = store.get(tokenKey(testId)) ?? undefined;
    const r = await api<StartAttemptResult>('POST', `/api/v1/tests/${testId}/attempt`, { fingerprint: await deviceFingerprint() }, saved ? { [ATTEMPT_TOKEN_HEADER]: saved } : {});
    setAttemptId(r.attemptId);
    if (r.state === 'active' || r.state === 'pending') {
      store.set(tokenKey(testId), r.token);
      setToken(r.token);
    }
    if (r.state === 'active') {
      await loadView(r.attemptId, r.token);
      setPhase('active');
    } else if (r.state === 'pending') setPhase('pending');
    else if (r.state === 'denied') setPhase('denied');
    else await end(r.status);
    return r.state;
  };

  // A blocked device asks again every 3 s until a proctor decides.
  useEffect(() => {
    if (phase !== 'pending') return;
    const i = setInterval(() => void startOrPoll().catch(() => undefined), 3000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const showNotice = useCallback((n: AttemptNotice) => {
    const key = `hbe-notices:${n.id}`;
    if (seen.current.has(n.id) || sessionStorage.getItem(key)) return;
    seen.current.add(n.id);
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    setNotices((xs) => [...xs, n]);
  }, []);

  const proctor = useProctoring(
    phase === 'active' && view
      ? {
          attemptId,
          token,
          settings: view.settings,
          onState: (s) => {
            if (s.deadlineAt) setDeadline(Date.parse(s.deadlineAt));
            if (s.serverNow) setOffset(Date.parse(s.serverNow) - Date.now());
            if (s.violationCount !== undefined) setViolations({ count: s.violationCount, level: s.warningLevel ?? 0 });
          },
          onNotice: showNotice,
          onSessionError,
          onEnded: (st) => void end(st),
          capture: webcam.current ? () => webcam.current!.capture() : undefined,
        }
      : null,
  );

  const examCtx: ExamCtx | null = useMemo(
    () => (phase === 'active' && view ? { attemptId, token, report: (type, data) => proctor.report(type, data), onSessionError, blockClipboard: view.settings.blockClipboard } : null),
    [phase, view, attemptId, token, proctor, onSessionError],
  );

  // Load the selected question (pinned version) and its drafts.
  const qid = view?.questions[current]?.questionId;
  useEffect(() => {
    if (phase !== 'active' || !qid) return;
    setQuestion(null);
    const h = { [ATTEMPT_TOKEN_HEADER]: token };
    Promise.all([api<CodingQuestion | WebQuestion | DbQuestion>('GET', `/api/v1/attempts/${attemptId}/questions/${qid}`, undefined, h), api<Draft[]>('GET', `/api/v1/attempts/${attemptId}/drafts/${qid}`, undefined, h)])
      .then(([q, drafts]) => setQuestion({ q, drafts }))
      .catch((e) => (e instanceof ApiError && e.status === 409 ? onSessionError(e.detail ?? '') : setError(e)));
  }, [phase, qid, attemptId, token, onSessionError]);

  // Refresh per-question progress (submissions, best scores) when switching questions.
  useEffect(() => {
    if (phase === 'active' && attemptId && token) void loadView(attemptId, token).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const remaining = deadline - (now + offset);
  // At zero, ask the server to close the attempt (it would anyway; this just updates the screen).
  const closing = useRef(false);
  useEffect(() => {
    if (phase !== 'active' || deadline === 0 || remaining > 0 || closing.current) return;
    closing.current = true;
    void api<{ status: string }>('POST', `/api/v1/attempts/${attemptId}/submit`, {}, { [ATTEMPT_TOKEN_HEADER]: token })
      .then((r) => end(r.status))
      .catch(() => end('auto_submitted'));
  }, [phase, remaining, deadline, attemptId, token, end]);

  const finish = async () => {
    if (!confirm('Finish the test? Your latest saved code for each question is graded. You cannot come back.')) return;
    await proctor.flush();
    try {
      const r = await api<{ status: string }>('POST', `/api/v1/attempts/${attemptId}/submit`, {}, { [ATTEMPT_TOKEN_HEADER]: token });
      await end(r.status);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onSessionError(e.detail ?? '');
      else setError(e);
    }
  };

  if (!user) return null;
  if (error && phase !== 'active') return <Centered><ErrorBox error={error} /><Link className="btn-secondary mt-4 inline-block" href="/tests">Back to tests</Link></Centered>;
  if (phase === 'loading' || !test) return <Centered><Spinner /></Centered>;

  if (phase === 'intro') {
    const resuming = test.attempt?.status === 'in_progress';
    const s = test.settings;
    return (
      <Centered>
        <h1 className="text-2xl font-semibold">{test.title}</h1>
        {test.description && <p className="mt-2 whitespace-pre-wrap text-slate-600 dark:text-slate-400">{test.description}</p>}
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{test.questionCount} question{test.questionCount === 1 ? '' : 's'} · {test.durationMin} minutes · closes {new Date(test.endsAt).toLocaleString()}</p>
        <div className="card mt-6 text-left text-sm" data-testid="rules">
          <h2 className="font-medium">Before you start</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
            <li>The timer runs on the server. It keeps running if you close this page, and the test is submitted automatically when it ends.</li>
            <li>This test is <b>proctored</b>. Leaving the page or window{ s.requireFullscreen ? ', leaving fullscreen' : ''}, and copy/paste{ s.blockClipboard ? ' (disabled)' : '' } are recorded and shown to your proctor.
              {s.violations.autoSubmitAt > 0 ? ` After ${s.violations.autoSubmitAt} recorded violations the test is submitted automatically.` : ''}</li>
            <li>Use one device. If the test is opened on another device, that device waits until a proctor approves it.</li>
            {s.webcam === 'flagged' && <li>Your webcam is used only when a violation is recorded: one still image is stored for the proctor and deleted after the retention period. Nothing is recorded otherwise.</li>}
          </ul>
          <label className="mt-3 flex items-start gap-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I understand{ s.webcam === 'flagged' ? ' and consent to the webcam use described above' : '' }.</span>
          </label>
        </div>
        <button className="btn-primary mt-6" disabled={!consent} onClick={() => void begin()}>{resuming ? 'Resume test' : 'Start test'}</button>
        <ErrorBox error={error} />
      </Centered>
    );
  }
  if (phase === 'pending')
    return (
      <Centered>
        <Spinner />
        <h1 className="mt-3 text-xl font-semibold" data-testid="device-pending">Waiting for your proctor</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">This test is already open on another device. A proctor has been notified and must approve this device before you can continue. The timer keeps running.</p>
      </Centered>
    );
  if (phase === 'denied')
    return <Centered><h1 className="text-xl font-semibold" data-testid="device-denied">This device was not approved</h1><p className="mt-2 text-slate-600 dark:text-slate-400">Continue the test on the device where you started it, or ask your proctor.</p></Centered>;
  if (phase === 'replaced')
    return <Centered><h1 className="text-xl font-semibold" data-testid="device-replaced">This test moved to another device</h1><p className="mt-2 text-slate-600 dark:text-slate-400">Your proctor approved another device for this attempt. This page can no longer make changes.</p></Centered>;
  if (phase === 'ended') {
    const a = test.attempt;
    return (
      <Centered>
        <h1 className="text-2xl font-semibold" data-testid="exam-ended">{STATUS_LABEL[endStatus || a?.status || ''] ?? 'Test finished'}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{test.title}</p>
        {a?.score !== null && a?.score !== undefined && <p className="mt-4 text-lg" data-testid="exam-score">Score: {a.score} / {a.maxScore}</p>}
        {a?.score === null && test.settings.showResults && <p className="mt-4 text-sm text-slate-500">Grading may take a few seconds. Reload to see your score.</p>}
        <Link className="btn-secondary mt-6 inline-block" href="/tests">Back to tests</Link>
      </Centered>
    );
  }

  // ---------------------------------------------------------------- active
  const v = view!;
  const low = remaining < 5 * 60_000;
  return (
    <ExamContext.Provider value={examCtx}>
      <div className="flex h-screen flex-col" style={{ ['--solve-h' as string]: 'calc(100vh - 3rem)' }}>
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-950">
          <span className="font-semibold">{v.title}</span>
          <nav className="flex gap-1" aria-label="Questions">
            {v.questions.map((q, i) => (
              <button key={q.questionId} onClick={() => setCurrent(i)} title={q.title} aria-current={i === current}
                className={`h-7 min-w-7 rounded px-2 text-sm ${i === current ? 'bg-brand-600 text-white' : q.submissions > 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800'}`}>
                {i + 1}
              </button>
            ))}
          </nav>
          <span className="ml-auto text-sm text-slate-500" data-testid="violations" title="Recorded proctoring violations">⚑ {violations.count}</span>
          <span className={`font-mono text-lg tabular-nums ${low ? 'text-rose-600' : ''}`} data-testid="timer" aria-label="Time left">{fmt(remaining)}</span>
          <button className="btn-primary" onClick={() => void finish()}>Finish test</button>
        </header>
        {violations.level > 0 && (
          <div className={`px-3 py-1 text-sm ${violations.level >= 2 ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-900'}`} role="status" data-testid="warning-banner">
            {violations.level >= 2 ? 'Final warning' : 'Warning'}: {violations.count} proctoring violation{violations.count === 1 ? '' : 's'} recorded.
            {v.settings.violations.autoSubmitAt > 0 ? ` The test is submitted automatically at ${v.settings.violations.autoSubmitAt}.` : ''}
          </div>
        )}
        <main className="min-h-0 flex-1">
          {question ? (
            question.q.type === 'web' ? <WebSolve key={qid} q={question.q} drafts={question.drafts} user={user} />
            : question.q.type === 'db' ? <DbSolve key={qid} q={question.q} drafts={question.drafts} user={user} />
            : <CodingSolve key={qid} q={question.q} drafts={question.drafts} user={user} />
          ) : <div className="p-8 text-center"><Spinner /></div>}
        </main>
        {notices.length > 0 && (
          <div className="fixed right-4 bottom-4 z-40 max-w-sm space-y-2" aria-live="assertive">
            {notices.map((n) => (
              <div key={n.id} role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shadow-lg" data-testid="notice">
                <div className="font-medium">Message from the proctoring system</div>
                <p className="mt-1">{n.message}</p>
                <button className="mt-2 text-xs underline" onClick={() => setNotices((xs) => xs.filter((x) => x.id !== n.id))}>Dismiss</button>
              </div>
            ))}
          </div>
        )}
        {v.settings.requireFullscreen && !fullscreen && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center text-white" data-testid="fullscreen-gate">
            <h2 className="text-xl font-semibold">Return to fullscreen to continue</h2>
            <p className="mt-2 max-w-md text-slate-300">Leaving fullscreen was recorded. The timer is still running.</p>
            <button className="btn-primary mt-4" onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}>Enter fullscreen</button>
          </div>
        )}
      </div>
    </ExamContext.Provider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-xl px-4 py-16 text-center">{children}</div>;
}

