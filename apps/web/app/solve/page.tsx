'use client';

import { VERDICT_LABELS, type ClientSubmission, type Verdict } from '@hbe/shared';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, get, post, put, watchSubmission } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { CodeEditor } from '@/components/code-editor';
import { Markdown } from '@/components/markdown';
import { Difficulty, ErrorBox, Spinner } from '@/components/ui';

interface RuntimeView {
  id: string;
  label: string;
  version: string;
  monaco: string;
  timeLimitMs: number;
  stub: string;
}
interface Question {
  id: string;
  title: string;
  statement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  difficulty: string;
  tags: string[];
  memoryLimitMb: number;
  samples: { input: string; output: string; explanation: string }[];
  runtimes: RuntimeView[];
  preview: boolean;
}

const store = {
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

function verdictTone(v: Verdict | null | undefined) {
  if (v === 'AC') return 'text-emerald-600 dark:text-emerald-400';
  if (!v) return 'text-slate-500';
  return 'text-rose-600 dark:text-rose-400';
}

export default function Solve() {
  const user = useRequireUser();
  const [id, setId] = useState<string | null>(null);
  const [q, setQ] = useState<Question | null>(null);
  const [runtime, setRuntime] = useState<string>('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [dark, setDark] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [useCustom, setUseCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [result, setResult] = useState<ClientSubmission | null>(null);
  const [busy, setBusy] = useState<'run' | 'submit' | null>(null);
  const [tab, setTab] = useState<'tests' | 'result'>('tests');
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'offline' | ''>('');
  const stopWatch = useRef<(() => void) | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setId(new URLSearchParams(location.search).get('id'));
    setDark(document.documentElement.classList.contains('dark'));
    setFontSize(Number(store.get('hbe-font') ?? 14));
  }, []);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const [question, drafts] = await Promise.all([
          get<Question>(`/api/v1/practice/questions/${id}`),
          get<{ runtime: string; code: string }[]>(`/api/v1/drafts/${id}`).catch(() => []),
        ]);
        const initial: Record<string, string> = {};
        for (const r of question.runtimes) {
          initial[r.id] = drafts.find((d) => d.runtime === r.id)?.code ?? store.get(`hbe-draft:${id}:${r.id}`) ?? r.stub;
        }
        const last = store.get('hbe-runtime');
        setQ(question);
        setCodes(initial);
        setRuntime(question.runtimes.some((r) => r.id === last) ? last! : (question.runtimes.find((r) => r.id === 'python') ?? question.runtimes[0])?.id ?? '');
        setCustomInput(question.samples[0]?.input ?? '');
      } catch (e) {
        setError(e);
      }
    })();
    return () => stopWatch.current?.();
  }, [user, id]);

  const rt = useMemo(() => q?.runtimes.find((r) => r.id === runtime), [q, runtime]);
  const code = codes[runtime] ?? '';

  // Debounced autosave: localStorage immediately, server after 1.5 s of inactivity.
  const onCode = useCallback(
    (v: string) => {
      if (!id) return;
      setCodes((c) => ({ ...c, [runtime]: v }));
      store.set(`hbe-draft:${id}:${runtime}`, v);
      if (user?.role === 'guest') return;
      setSaved('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        put(`/api/v1/drafts/${id}/${runtime}`, { code: v })
          .then(() => setSaved('saved'))
          .catch(() => setSaved('offline'));
      }, 1500);
    },
    [id, runtime, user],
  );

  const execute = async (kind: 'run' | 'submit') => {
    if (!q || !rt) return;
    setBusy(kind);
    setError(null);
    setTab('result');
    setResult(null);
    stopWatch.current?.();
    try {
      const body: Record<string, unknown> = { questionId: q.id, runtime, code, kind };
      if (kind === 'run' && useCustom) body.customInput = customInput;
      const { id: sid } = await post<{ id: string }>('/api/v1/submissions', body);
      stopWatch.current = watchSubmission<ClientSubmission>(sid, (s) => {
        setResult(s);
        if (s.status === 'done' || s.status === 'failed') setBusy(null);
      });
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  };

  if (!user) return null;
  if (error && !q) return <div className="p-6"><ErrorBox error={error} /><Link className="btn-secondary mt-3" href="/practice">Back</Link></div>;
  if (!q || !rt) return <div className="p-8 text-center"><Spinner /></div>;

  return (
    <div className="flex h-screen flex-col">
      <div className="flex h-11 items-center gap-3 border-b border-slate-200 px-3 dark:border-slate-800">
        <Link href="/practice" className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">← Practice</Link>
        <span className="font-medium">{q.title}</span>
        <Difficulty value={q.difficulty} />
        {q.preview && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">preview (unpublished)</span>}
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-secondary" disabled={busy !== null} onClick={() => void execute('run')}>{busy === 'run' ? <Spinner /> : '▶'} Run</button>
          <button className="btn-primary" disabled={busy !== null} onClick={() => void execute('submit')}>{busy === 'submit' ? <Spinner /> : null} Submit</button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Problem panel */}
        <section className="min-h-0 overflow-y-auto border-slate-200 p-4 md:w-[42%] md:border-r dark:border-slate-800" aria-label="Problem">
          <Markdown>{q.statement}</Markdown>
          {q.inputFormat && (<><h3 className="mt-4 text-sm font-semibold">Input format</h3><Markdown>{q.inputFormat}</Markdown></>)}
          {q.outputFormat && (<><h3 className="mt-4 text-sm font-semibold">Output format</h3><Markdown>{q.outputFormat}</Markdown></>)}
          {q.constraints && (<><h3 className="mt-4 text-sm font-semibold">Constraints</h3><Markdown>{q.constraints}</Markdown></>)}
          {q.samples.map((s, i) => (
            <div key={i} className="mt-4">
              <h3 className="text-sm font-semibold">Example {i + 1}</h3>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <div><div className="label">Input</div><pre className="rounded bg-slate-100 p-2 font-mono text-xs whitespace-pre-wrap dark:bg-slate-800">{s.input}</pre></div>
                <div><div className="label">Output</div><pre className="rounded bg-slate-100 p-2 font-mono text-xs whitespace-pre-wrap dark:bg-slate-800">{s.output}</pre></div>
              </div>
              {s.explanation && <div className="mt-1 text-sm text-slate-600 dark:text-slate-400"><Markdown>{s.explanation}</Markdown></div>}
            </div>
          ))}
          <p className="mt-6 text-xs text-slate-500">Time limit: {rt.timeLimitMs} ms ({rt.label}) · Memory limit: {q.memoryLimitMb} MB</p>
        </section>

        {/* Editor + console */}
        <section className="flex min-h-0 flex-1 flex-col" aria-label="Editor">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800">
            <select
              className="input w-auto py-1"
              aria-label="Language"
              value={runtime}
              onChange={(e) => {
                setRuntime(e.target.value);
                store.set('hbe-runtime', e.target.value);
              }}
            >
              {q.runtimes.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500" title="Exact compiler/runtime version">{rt.version}</span>
            <span className="ml-auto text-xs text-slate-400" aria-live="polite">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved === 'offline' ? 'Saved locally' : ''}</span>
            <select className="input w-auto py-1" aria-label="Font size" value={fontSize} onChange={(e) => { setFontSize(Number(e.target.value)); store.set('hbe-font', e.target.value); }}>
              {[12, 13, 14, 16, 18, 20].map((s) => <option key={s} value={s}>{s}px</option>)}
            </select>
            <button className="btn-secondary px-2 py-1" onClick={() => setDark((d) => !d)} aria-label="Toggle editor theme">{dark ? '☀' : '☾'}</button>
            <button
              className="btn-secondary py-1"
              onClick={() => {
                if (confirm('Replace your code with the starter code?')) onCode(rt.stub);
              }}
            >
              Reset
            </button>
          </div>
          <div className="min-h-[240px] flex-1">
            <CodeEditor value={code} language={rt.monaco} onChange={onCode} theme={dark ? 'dark' : 'light'} fontSize={fontSize} ariaLabel={`${rt.label} code editor`} />
          </div>
          <div className="flex h-[38%] min-h-[180px] flex-col border-t border-slate-200 dark:border-slate-800">
            <div className="flex gap-1 border-b border-slate-200 px-2 text-sm dark:border-slate-800" role="tablist">
              {(['tests', 'result'] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={`px-3 py-1.5 ${tab === t ? 'border-b-2 border-brand-600 font-medium' : 'text-slate-500'}`} onClick={() => setTab(t)}>
                  {t === 'tests' ? 'Test input' : 'Result'}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
              {tab === 'tests' ? (
                <div>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} /> Run with custom input</label>
                  {useCustom ? (
                    <textarea className="input mt-2 h-28 font-mono text-xs" aria-label="Custom input" value={customInput} onChange={(e) => setCustomInput(e.target.value)} />
                  ) : (
                    <p className="mt-2 text-slate-500">Run checks your code against the {q.samples.length} example tests. Submit runs the hidden tests too.</p>
                  )}
                </div>
              ) : (
                <ResultPanel result={result} busy={busy} error={error} />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ResultPanel({ result, busy, error }: { result: ClientSubmission | null; busy: string | null; error: unknown }) {
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
      {visible.map((t) => (
        <details key={t.ordinal} open={t.verdict !== 'AC' || visible.length === 1} className="rounded border border-slate-200 p-2 dark:border-slate-800">
          <summary className="cursor-pointer">
            <span className={verdictTone(t.verdict)}>{t.expected === undefined && t.verdict === 'AC' ? 'Ran' : VERDICT_LABELS[t.verdict]}</span>
            <span className="ml-2 text-slate-500">{t.expected === undefined ? 'Custom input' : `Example ${t.ordinal}`} · {t.cpuMs} ms · {((t.memKb ?? 0) / 1024).toFixed(1)} MB</span>
          </summary>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div><div className="label">Input</div><pre className="max-h-32 overflow-auto rounded bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800">{t.input}</pre></div>
            {t.expected !== undefined && <div><div className="label">Expected</div><pre className="max-h-32 overflow-auto rounded bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800">{t.expected}</pre></div>}
            <div><div className="label">Your output</div><pre className="max-h-32 overflow-auto rounded bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800" data-testid="stdout">{t.stdout}</pre></div>
          </div>
          {t.stderr && <pre className="mt-2 max-h-40 overflow-auto rounded bg-rose-50 p-2 font-mono text-xs whitespace-pre-wrap text-rose-900 dark:bg-rose-950 dark:text-rose-200">{t.stderr}</pre>}
        </details>
      ))}
      {hidden.length > 0 && (
        <div>
          <div className="label">Hidden tests (inputs are not shown)</div>
          <div className="flex flex-wrap gap-1.5">
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
