'use client';

import { VERDICT_LABELS, type DbDialect, type ResultSet, type SessionUser } from '@hbe/shared';
import { useState } from 'react';
import { CodeEditor } from '@/components/code-editor';
import { Markdown } from '@/components/markdown';
import { initialDraft, ResultShell, SaveLabel, store, TopBar, useDraftSaver, useExecution, verdictTone, type Draft } from './common';
import { useExam } from '@/components/exam/context';

export interface DbQuestion {
  type: 'db';
  id: string;
  title: string;
  statement: string;
  difficulty: string;
  tags: string[];
  mode: 'query' | 'dml';
  schemaDisplay: string;
  timeLimitMs: number;
  dialects: { id: DbDialect; label: string; version: string; monaco: string; starter: string }[];
  samples: { explanation: string; expected: Partial<Record<DbDialect, ResultSet>> }[];
  hiddenCount: number;
  preview: boolean;
}

const cell = (v: unknown) => (v === null || v === undefined ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function ResultTable({ result, label, max = 50 }: { result: { columns: string[]; rows: unknown[][]; truncated?: boolean }; label: string; max?: number }) {
  return (
    <div className="min-w-0">
      <div className="label">{label} <span className="font-normal text-slate-400">({result.rows.length}{result.truncated ? '+' : ''} rows)</span></div>
      <div className="max-h-64 overflow-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="w-full font-mono text-xs" aria-label={label}>
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
            <tr>{result.columns.map((c, i) => <th key={i} className="px-2 py-1 text-left font-semibold">{c}</th>)}</tr>
          </thead>
          <tbody>
            {result.rows.slice(0, max).map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                {r.map((v, j) => <td key={j} className={`px-2 py-0.5 whitespace-pre ${v === null ? 'text-slate-400 italic' : ''}`}>{cell(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {result.rows.length > max && <p className="px-2 py-1 text-xs text-slate-500">… {result.rows.length - max} more rows</p>}
      </div>
    </div>
  );
}

export function DbSolve({ q, drafts, user }: { q: DbQuestion; drafts: Draft[]; user: SessionUser }) {
  const exam = useExam();
  const [dialect, setDialect] = useState<DbDialect>(() => {
    const last = store.get('hbe-dialect');
    return (q.dialects.find((d) => d.id === last) ?? q.dialects[0])!.id;
  });
  const [codes, setCodes] = useState<Record<string, string>>(() => Object.fromEntries(q.dialects.map((d) => [d.id, initialDraft(drafts, q.id, d.id, d.starter, exam?.attemptId)])));
  const [tab, setTab] = useState<'examples' | 'result'>('examples');
  const { save, label } = useDraftSaver(q.id, user);
  const { result, busy, error, execute } = useExecution(q.id);
  const d = q.dialects.find((x) => x.id === dialect) ?? q.dialects[0]!;
  const code = codes[d.id] ?? '';
  const onCode = (v: string) => {
    setCodes((c) => ({ ...c, [d.id]: v }));
    save(d.id, v);
  };
  const run = (kind: 'run' | 'submit') => {
    setTab('result');
    void execute(kind, d.id, code);
  };
  const hint =
    d.id === 'mongodb'
      ? 'Write a JSON query: {"collection": "…", "pipeline": [ … ]} or {"collection": "…", "find": {"filter": { … }, "sort": { … }}}. JavaScript is not allowed.'
      : d.id === 'pandas'
        ? 'solve() receives each table as a DataFrame parameter with the table\'s name, e.g. solve(employees). Return a DataFrame.'
        : q.mode === 'dml'
          ? 'Write the statements that change the data; the resulting table state is compared.'
          : 'Write a single SELECT query. The database is read-only.';

  return (
    <div className="flex h-[var(--solve-h,100vh)] flex-col">
      <TopBar title={q.title} difficulty={q.difficulty} preview={q.preview} busy={busy} onRun={() => run('run')} onSubmit={() => run('submit')} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="min-h-0 overflow-y-auto border-slate-200 p-4 md:w-[42%] md:border-r dark:border-slate-800" aria-label="Problem">
          <Markdown>{q.statement}</Markdown>
          <h3 className="mt-5 text-sm font-semibold">Schema</h3>
          <div className="text-sm"><Markdown>{q.schemaDisplay}</Markdown></div>
          <p className="mt-6 text-xs text-slate-500">Time limit: {q.timeLimitMs} ms · {d.version}</p>
        </section>

        <section className="flex min-h-0 flex-1 flex-col" aria-label="Editor">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800">
            <select className="input w-auto py-1" aria-label="Database" value={d.id} onChange={(e) => { setDialect(e.target.value as DbDialect); store.set('hbe-dialect', e.target.value); }}>
              {q.dialects.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <span className="text-xs text-slate-500">{d.version}</span>
            <span className="ml-auto" />
            <SaveLabel label={label} />
            <button className="btn-secondary py-1" onClick={() => { if (confirm('Replace your code with the starter code?')) onCode(d.starter); }}>Reset</button>
          </div>
          <p className="border-b border-slate-200 px-3 py-1 text-xs text-slate-500 dark:border-slate-800">{hint}</p>
          <div className="min-h-[220px] flex-1">
            <CodeEditor path={`file:///${d.id}`} value={code} language={d.monaco} onChange={onCode} ariaLabel={`${d.label} editor`} />
          </div>
          <div className="flex h-[42%] min-h-[200px] flex-col border-t border-slate-200 dark:border-slate-800">
            <div className="flex gap-1 border-b border-slate-200 px-2 text-sm dark:border-slate-800" role="tablist">
              {(['examples', 'result'] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={`px-3 py-1.5 ${tab === t ? 'border-b-2 border-brand-600 font-medium' : 'text-slate-500'}`} onClick={() => setTab(t)}>
                  {t === 'examples' ? 'Expected output' : 'Result'}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
              {tab === 'examples' ? (
                q.samples.map((s, i) => (
                  <div key={i}>
                    <h3 className="text-sm font-semibold">Example {i + 1}</h3>
                    {s.explanation && <div className="text-slate-600 dark:text-slate-400"><Markdown>{s.explanation}</Markdown></div>}
                    {s.expected[d.id] ? <ResultTable result={s.expected[d.id]!} label="Expected" /> : <p className="text-xs text-slate-500">Expected output is not available yet.</p>}
                  </div>
                ))
              ) : (
                <ResultShell
                  result={result}
                  busy={busy}
                  error={error}
                  renderVisible={(t) => (
                    <details open={t.verdict !== 'AC'} className="rounded border border-slate-200 p-2 dark:border-slate-800">
                      <summary className="cursor-pointer">
                        <span className={verdictTone(t.verdict)}>{VERDICT_LABELS[t.verdict]}</span>
                        <span className="ml-2 text-slate-500">Example {t.ordinal}{t.cpuMs !== undefined ? ` · ${t.cpuMs} ms` : ''}</span>
                      </summary>
                      {t.detail && <p className="mt-1 font-mono text-xs text-rose-700 dark:text-rose-300" data-testid="detail">{t.detail}</p>}
                      <div className="mt-2 grid gap-3 lg:grid-cols-2">
                        {t.result && <ResultTable result={t.result} label="Your result" />}
                        {t.expectedResult && <ResultTable result={t.expectedResult} label="Expected" />}
                      </div>
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
