'use client';

import { DB_DIALECTS, DIALECT_INFO, type DbDataset, type DbDialect, type DbQuestionInput, type DbSetup } from '@hbe/shared';
import { useState } from 'react';
import { CodeEditor } from '@/components/code-editor';
import { CommonDetails, Field, Tabs } from './fields';

export const emptyDb = (): DbQuestionInput => ({
  type: 'db',
  title: '',
  statement: '',
  difficulty: 'easy',
  tags: [],
  isPractice: true,
  dialects: ['postgres', 'mysql'],
  mode: 'query',
  schemaDisplay: '',
  samples: [],
  hidden: [],
  compare: { orderSensitive: false, columnNames: 'ignore_case', floatEpsilon: 1e-6, ignoreMongoId: true },
  starters: {},
  solutions: {},
  timeLimitMs: 2000,
});

type SetupKey = 'sql' | 'postgres' | 'mysql' | 'mongodb' | 'pandas';
const SETUP_LABEL: Record<SetupKey, string> = { sql: 'SQL (PostgreSQL + MySQL)', postgres: 'PostgreSQL only', mysql: 'MySQL only', mongodb: 'MongoDB (EJSON)', pandas: 'Pandas (CSV tables)' };

function setupKeys(dialects: DbDialect[]): SetupKey[] {
  const k: SetupKey[] = [];
  if (dialects.includes('postgres') || dialects.includes('mysql')) k.push('sql');
  if (dialects.includes('postgres')) k.push('postgres');
  if (dialects.includes('mysql')) k.push('mysql');
  if (dialects.includes('mongodb')) k.push('mongodb');
  if (dialects.includes('pandas')) k.push('pandas');
  return k;
}

function CsvTables({ tables, onChange }: { tables: Record<string, string>; onChange: (t: Record<string, string> | undefined) => void }) {
  const entries = Object.entries(tables);
  const put = (list: [string, string][]) => onChange(list.length ? Object.fromEntries(list) : undefined);
  return (
    <div className="space-y-2">
      {entries.map(([name, csv], i) => (
        <div key={i} className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
          <input className="input font-mono text-xs" aria-label="Table name" value={name} onChange={(e) => put(entries.map((x, j) => (j === i ? [e.target.value.toLowerCase(), x[1]] : x)))} />
          <textarea className="input h-24 font-mono text-xs" aria-label={`${name} CSV`} placeholder={'id,name\n1,Asha'} value={csv} onChange={(e) => put(entries.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
          <button type="button" className="self-start text-xs text-rose-600 hover:underline" onClick={() => put(entries.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn-secondary text-xs" onClick={() => put([...entries, [`table${entries.length + 1}`, '']])}>Add table</button>
    </div>
  );
}

function DatasetCard({ d, dialects, label, onChange, onRemove, onDuplicate }: { d: DbDataset; dialects: DbDialect[]; label: string; onChange: (d: DbDataset) => void; onRemove: () => void; onDuplicate: () => void }) {
  const keys = setupKeys(dialects);
  const [k, setK] = useState<SetupKey>(keys[0] ?? 'sql');
  const key = keys.includes(k) ? k : (keys[0] ?? 'sql');
  const setSetup = (patch: Partial<DbSetup>) => {
    const next = { ...d.setup, ...patch };
    for (const [kk, v] of Object.entries(next)) if (v === undefined || v === '') delete (next as Record<string, unknown>)[kk];
    onChange({ ...d, setup: next });
  };
  return (
    <div className="card space-y-2" data-testid="dataset">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium">{label}</h4>
        <div className="flex gap-1 text-xs">
          {keys.map((x) => (
            <button type="button" key={x} className={`rounded px-2 py-0.5 ${key === x ? 'bg-brand-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`} onClick={() => setK(x)}>
              {SETUP_LABEL[x]}{d.setup[x] ? ' ✓' : ''}
            </button>
          ))}
        </div>
        <span className="ml-auto flex gap-3 text-xs">
          <button type="button" className="text-brand-600 hover:underline" onClick={onDuplicate}>Duplicate</button>
          <button type="button" className="text-rose-600 hover:underline" onClick={onRemove}>Remove</button>
        </span>
      </div>
      {key === 'pandas' ? (
        <CsvTables tables={d.setup.pandas ?? {}} onChange={(t) => setSetup({ pandas: t })} />
      ) : (
        <div className="h-44 overflow-hidden rounded border border-slate-200 dark:border-slate-800">
          <CodeEditor
            path={`file:///author/${label.replace(/\W+/g, '-')}/${key}`}
            value={(d.setup[key] as string | undefined) ?? ''}
            language={key === 'mongodb' ? 'json' : 'sql'}
            onChange={(v) => setSetup({ [key]: v })}
            ariaLabel={`${label} ${SETUP_LABEL[key]} setup`}
          />
        </div>
      )}
      <p className="text-xs text-slate-500">
        {key === 'sql' && 'CREATE TABLE + INSERT statements, used by both SQL databases unless overridden.'}
        {key === 'mongodb' && 'An object of collection name → array of documents, e.g. {"orders": [{"_id": 1, "total": {"$numberDecimal": "9.50"}}]}.'}
        {key === 'pandas' && 'Each table becomes a DataFrame passed to solve() under its name.'}
        {(key === 'postgres' || key === 'mysql') && 'Optional: replaces the shared SQL for this database.'}
      </p>
      <div className="grid gap-2 md:grid-cols-[1fr_100px]">
        <Field label="Explanation (shown for samples)"><input className="input" value={d.explanation} onChange={(e) => onChange({ ...d, explanation: e.target.value })} /></Field>
        <Field label="Weight"><input className="input" type="number" min={1} max={100} value={d.weight} onChange={(e) => onChange({ ...d, weight: Number(e.target.value) })} /></Field>
      </div>
    </div>
  );
}

const newDataset = (): DbDataset => ({ setup: {}, explanation: '', weight: 1 });

export function DbFields({ q, setQ, writable }: { q: DbQuestionInput; setQ: (f: (q: DbQuestionInput) => DbQuestionInput) => void; writable: boolean }) {
  const [tab, setTab] = useState<'details' | 'datasets' | 'queries'>('details');
  const [dialect, setDialect] = useState<DbDialect>(q.dialects[0] ?? 'postgres');
  const set = <K extends keyof DbQuestionInput>(k: K, v: DbQuestionInput[K]) => setQ((x) => ({ ...x, [k]: v }));
  const cur = q.dialects.includes(dialect) ? dialect : (q.dialects[0] ?? 'postgres');
  const list = (which: 'samples' | 'hidden') => (
    q[which].map((d, i) => (
      <DatasetCard
        key={`${which}${i}`}
        d={d}
        dialects={q.dialects}
        label={`${which === 'samples' ? 'Sample' : 'Hidden'} dataset ${i + 1}`}
        onChange={(n) => set(which, q[which].map((x, j) => (j === i ? n : x)))}
        onRemove={() => set(which, q[which].filter((_, j) => j !== i))}
        onDuplicate={() => q.hidden.length < 15 && set('hidden', [...q.hidden, structuredClone(d)])}
      />
    ))
  );

  return (
    <>
      <Tabs tabs={['details', 'datasets', 'queries'] as const} value={tab} onChange={setTab} label={(t) => (t === 'details' ? 'Details' : t === 'datasets' ? `Datasets (${q.samples.length + q.hidden.length})` : 'Queries')} />
      {/* Tabs stay usable in read-only mode; only the fields are disabled. */}
      <fieldset disabled={!writable} className="space-y-4">
      {tab === 'details' && (
        <>
          <CommonDetails q={q} set={set}>
            <Field label="Mode">
              <select className="input" value={q.mode} onChange={(e) => set('mode', e.target.value as DbQuestionInput['mode'])}>
                <option value="query">Query (compare result set)</option>
                <option value="dml">Modify data (compare table state)</option>
              </select>
            </Field>
            <Field label="Time limit (ms)"><input className="input" type="number" min={200} max={10000} value={q.timeLimitMs} onChange={(e) => set('timeLimitMs', Number(e.target.value))} /></Field>
          </CommonDetails>
          <Field label="Databases" hint="Each selected database needs a reference solution and a setup for every dataset; their results must agree.">
            <div className="flex flex-wrap gap-3 text-sm">
              {DB_DIALECTS.map((d) => (
                <label key={d} className="flex items-center gap-1">
                  <input type="checkbox" checked={q.dialects.includes(d)} disabled={!writable || (q.dialects.length === 1 && q.dialects.includes(d))} onChange={(e) => set('dialects', e.target.checked ? DB_DIALECTS.filter((x) => x === d || q.dialects.includes(x)) : q.dialects.filter((x) => x !== d))} />
                  {DIALECT_INFO[d].label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Schema shown to students (Markdown)"><textarea className="input h-32 font-mono text-xs" placeholder={'**employees**(id INT, name TEXT, dept_id INT, salary NUMERIC)'} value={q.schemaDisplay} onChange={(e) => set('schemaDisplay', e.target.value)} /></Field>
          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.compare.orderSensitive} onChange={(e) => set('compare', { ...q.compare, orderSensitive: e.target.checked })} /> Row order matters (ORDER BY)</label>
            <Field label="Column names">
              <select className="input" value={q.compare.columnNames} onChange={(e) => set('compare', { ...q.compare, columnNames: e.target.value as DbQuestionInput['compare']['columnNames'] })}>
                <option value="ignore_case">Must match (any case)</option><option value="exact">Must match exactly</option><option value="ignore">Ignored (positions only)</option>
              </select>
            </Field>
            <Field label="Float tolerance"><input className="input" type="number" step="any" min={0} max={1} value={q.compare.floatEpsilon} onChange={(e) => set('compare', { ...q.compare, floatEpsilon: Number(e.target.value) })} /></Field>
            {q.dialects.includes('mongodb') && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.compare.ignoreMongoId} onChange={(e) => set('compare', { ...q.compare, ignoreMongoId: e.target.checked })} /> Ignore Mongo <code>_id</code></label>}
          </div>
          {q.mode === 'dml' && (
            <Field label="State query (SQL, run after the student's statements; its result is compared)" hint="e.g. SELECT * FROM accounts ORDER BY id">
              <input className="input font-mono text-xs" value={q.stateQuery?.sql ?? ''} onChange={(e) => set('stateQuery', { ...q.stateQuery, sql: e.target.value || undefined })} />
            </Field>
          )}
        </>
      )}
      {tab === 'datasets' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Expected results are not typed in: validation runs the reference solutions on every dataset and stores their output. At least half of the hidden datasets must give a different result from the samples, so hard-coded answers fail.
          </p>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Sample datasets ({q.samples.length}/2, results shown to students)</h3>
            <button type="button" className="btn-secondary ml-auto" disabled={q.samples.length >= 2} onClick={() => set('samples', [...q.samples, newDataset()])}>Add sample</button>
          </div>
          {list('samples')}
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Hidden datasets ({q.hidden.length}/15 — need 8–15)</h3>
            <button type="button" className="btn-secondary ml-auto" disabled={q.hidden.length >= 15} onClick={() => set('hidden', [...q.hidden, newDataset()])}>Add hidden</button>
          </div>
          {list('hidden')}
        </div>
      )}
      {tab === 'queries' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {q.dialects.map((d) => (
              <button type="button" key={d} onClick={() => setDialect(d)} className={`btn ${cur === d ? 'bg-brand-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                {DIALECT_INFO[d].label}{q.solutions[d]?.trim() ? ' ✓' : ''}
              </button>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Starter (students see this)">
              <div className="h-72 overflow-hidden rounded border border-slate-200 dark:border-slate-800">
                <CodeEditor path={`file:///author/starter/${cur}`} value={q.starters[cur] ?? ''} language={DIALECT_INFO[cur].monaco} readOnly={!writable} onChange={(v) => set('starters', { ...q.starters, [cur]: v })} ariaLabel={`${DIALECT_INFO[cur].label} starter`} />
              </div>
            </Field>
            <Field label="Reference solution (hidden)">
              <div className="h-72 overflow-hidden rounded border border-slate-200 dark:border-slate-800">
                <CodeEditor path={`file:///author/solution/${cur}`} value={q.solutions[cur] ?? ''} language={DIALECT_INFO[cur].monaco} readOnly={!writable} onChange={(v) => set('solutions', { ...q.solutions, [cur]: v })} ariaLabel={`${DIALECT_INFO[cur].label} reference solution`} />
              </div>
            </Field>
          </div>
        </div>
      )}
      </fieldset>
    </>
  );
}
