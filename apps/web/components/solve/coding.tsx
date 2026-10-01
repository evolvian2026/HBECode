'use client';

import { VERDICT_LABELS, type SessionUser } from '@hbe/shared';
import { useMemo, useState } from 'react';
import { CodeEditor } from '@/components/code-editor';
import { Markdown } from '@/components/markdown';
import { initialDraft, ResultShell, SaveLabel, store, TopBar, useDraftSaver, useExecution, verdictTone, type Draft } from './common';

export interface CodingQuestion {
  type: 'coding';
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
  runtimes: { id: string; label: string; version: string; monaco: string; timeLimitMs: number; stub: string }[];
  preview: boolean;
}

export function CodingSolve({ q, drafts, user }: { q: CodingQuestion; drafts: Draft[]; user: SessionUser }) {
  const [codes, setCodes] = useState<Record<string, string>>(() => Object.fromEntries(q.runtimes.map((r) => [r.id, initialDraft(drafts, q.id, r.id, r.stub)])));
  const [runtime, setRuntime] = useState(() => {
    const last = store.get('hbe-runtime');
    return q.runtimes.some((r) => r.id === last) ? last! : ((q.runtimes.find((r) => r.id === 'python') ?? q.runtimes[0])?.id ?? '');
  });
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const [fontSize, setFontSize] = useState(() => Number(store.get('hbe-font') ?? 14));
  const [useCustom, setUseCustom] = useState(false);
  const [customInput, setCustomInput] = useState(q.samples[0]?.input ?? '');
  const [tab, setTab] = useState<'tests' | 'result'>('tests');
  const { save, label } = useDraftSaver(q.id, user);
  const { result, busy, error, execute } = useExecution(q.id);

  const rt = useMemo(() => q.runtimes.find((r) => r.id === runtime), [q, runtime]);
  const code = codes[runtime] ?? '';
  const onCode = (v: string) => {
    setCodes((c) => ({ ...c, [runtime]: v }));
    save(runtime, v);
  };
  const run = (kind: 'run' | 'submit') => {
    setTab('result');
    void execute(kind, runtime, code, kind === 'run' && useCustom ? { customInput } : {});
  };
  if (!rt) return <p className="p-6 text-slate-500">This question has no languages configured.</p>;

  return (
    <div className="flex h-screen flex-col">
      <TopBar title={q.title} difficulty={q.difficulty} preview={q.preview} busy={busy} onRun={() => run('run')} onSubmit={() => run('submit')} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
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

        <section className="flex min-h-0 flex-1 flex-col" aria-label="Editor">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800">
            <select className="input w-auto py-1" aria-label="Language" value={runtime} onChange={(e) => { setRuntime(e.target.value); store.set('hbe-runtime', e.target.value); }}>
              {q.runtimes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <span className="text-xs text-slate-500" title="Exact compiler/runtime version">{rt.version}</span>
            <span className="ml-auto" />
            <SaveLabel label={label} />
            <select className="input w-auto py-1" aria-label="Font size" value={fontSize} onChange={(e) => { setFontSize(Number(e.target.value)); store.set('hbe-font', e.target.value); }}>
              {[12, 13, 14, 16, 18, 20].map((s) => <option key={s} value={s}>{s}px</option>)}
            </select>
            <button className="btn-secondary px-2 py-1" onClick={() => setDark((d) => !d)} aria-label="Toggle editor theme">{dark ? '☀' : '☾'}</button>
            <button className="btn-secondary py-1" onClick={() => { if (confirm('Replace your code with the starter code?')) onCode(rt.stub); }}>Reset</button>
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
                <ResultShell
                  result={result}
                  busy={busy}
                  error={error}
                  renderVisible={(t) => (
                    <details open={t.verdict !== 'AC' || result?.tests.filter((x) => !x.hidden).length === 1} className="rounded border border-slate-200 p-2 dark:border-slate-800">
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
                  )}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
