'use client';

import { RUNTIMES, RUNTIME_IDS, REQUIRED_RUNTIMES, publishProblems, type CodingQuestionInput, type RuntimeId } from '@hbe/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '@/lib/api';
import { useRequireUser, useSession } from '@/lib/session';
import { CodeEditor } from '@/components/code-editor';
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
  question: CodingQuestionInput;
}

const empty = (): CodingQuestionInput => ({
  title: '',
  statement: '',
  constraints: '',
  inputFormat: '',
  outputFormat: '',
  difficulty: 'easy',
  tags: [],
  timeComplexity: '',
  spaceComplexity: '',
  baseTimeLimitMs: 1000,
  memoryLimitMb: 256,
  compare: { mode: 'trim_trailing' },
  isPractice: true,
  samples: [
    { input: '', output: '', explanation: '' },
    { input: '', output: '', explanation: '' },
  ],
  hidden: [],
  templates: {},
});

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <div>
    <label className="label">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>
);

export default function EditQuestion() {
  const user = useRequireUser();
  const { can } = useSession();
  const [id, setId] = useState<string | null>(null);
  const [q, setQ] = useState<CodingQuestionInput>(empty());
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<'details' | 'tests' | 'code'>('details');
  const [lang, setLang] = useState<RuntimeId>('python');
  const [part, setPart] = useState<'stub' | 'driver' | 'solution'>('stub');
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
    const qid = new URLSearchParams(location.search).get('id');
    setId(qid);
    if (qid && user) load(qid).catch(setError);
  }, [user]);

  // Poll while the sandbox validates the reference solutions.
  useEffect(() => {
    if (!id || !detail?.validation?.pending) return;
    const t = setInterval(() => void load(id).catch(() => undefined), 1500);
    return () => clearInterval(t);
  }, [id, detail?.validation?.pending]);

  const problems = useMemo(() => publishProblems(q), [q]);
  const set = <K extends keyof CodingQuestionInput>(k: K, v: CodingQuestionInput[K]) => setQ((x) => ({ ...x, [k]: v }));

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
  const tpl = q.templates[lang] ?? { stub: '', driver: '', solution: '' };
  const v = detail?.validation;

  return (
    <Page
      title={id ? q.title || 'Untitled' : 'New coding question'}
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
          <div className="mb-3 flex gap-1 border-b border-slate-200 text-sm dark:border-slate-800" role="tablist">
            {(['details', 'tests', 'code'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`px-3 py-1.5 capitalize ${tab === t ? 'border-b-2 border-brand-600 font-medium' : 'text-slate-500'}`} onClick={() => setTab(t)}>
                {t === 'code' ? 'Languages' : t}
              </button>
            ))}
          </div>
          <fieldset disabled={!writable} className="space-y-4">
            {tab === 'details' && (
              <>
                <Field label="Title"><input className="input" value={q.title} onChange={(e) => set('title', e.target.value)} /></Field>
                <Field label="Description (Markdown)"><textarea className="input h-40 font-mono text-xs" value={q.statement} onChange={(e) => set('statement', e.target.value)} /></Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Input format"><textarea className="input h-24 font-mono text-xs" value={q.inputFormat} onChange={(e) => set('inputFormat', e.target.value)} /></Field>
                  <Field label="Output format"><textarea className="input h-24 font-mono text-xs" value={q.outputFormat} onChange={(e) => set('outputFormat', e.target.value)} /></Field>
                </div>
                <Field label="Constraints"><textarea className="input h-20 font-mono text-xs" value={q.constraints} onChange={(e) => set('constraints', e.target.value)} /></Field>
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Difficulty">
                    <select className="input" value={q.difficulty} onChange={(e) => set('difficulty', e.target.value as CodingQuestionInput['difficulty'])}>
                      <option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option>
                    </select>
                  </Field>
                  <Field label="Tags (comma-separated)"><input className="input" value={q.tags.join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))} /></Field>
                  <Field label="Time complexity"><input className="input" placeholder="O(n log n)" value={q.timeComplexity} onChange={(e) => set('timeComplexity', e.target.value)} /></Field>
                  <Field label="Space complexity"><input className="input" placeholder="O(n)" value={q.spaceComplexity} onChange={(e) => set('spaceComplexity', e.target.value)} /></Field>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Base time limit (ms)" hint="C/C++ ×1, Go/Rust ×1.5, Java/C# ×2, JS ×2.5, Python ×3">
                    <input className="input" type="number" min={100} max={10000} value={q.baseTimeLimitMs} onChange={(e) => set('baseTimeLimitMs', Number(e.target.value))} />
                  </Field>
                  <Field label="Memory limit (MB)"><input className="input" type="number" min={32} max={1024} value={q.memoryLimitMb} onChange={(e) => set('memoryLimitMb', Number(e.target.value))} /></Field>
                  <Field label="Output comparison">
                    <select className="input" value={q.compare.mode} onChange={(e) => set('compare', { mode: e.target.value as CodingQuestionInput['compare']['mode'], epsilon: e.target.value === 'float' ? (q.compare.epsilon ?? 1e-6) : undefined })}>
                      <option value="exact">Exact</option><option value="trim_trailing">Ignore trailing whitespace</option><option value="unordered_lines">Unordered lines</option><option value="float">Float tolerance</option>
                    </select>
                  </Field>
                  {q.compare.mode === 'float' && <Field label="Epsilon"><input className="input" type="number" step="any" value={q.compare.epsilon ?? 1e-6} onChange={(e) => set('compare', { mode: 'float', epsilon: Number(e.target.value) })} /></Field>}
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.isPractice} onChange={(e) => set('isPractice', e.target.checked)} /> Available in practice mode</label>
              </>
            )}

            {tab === 'tests' && (
              <>
                <h3 className="font-medium">Sample tests (exactly 2, shown to students)</h3>
                {q.samples.map((s, i) => (
                  <div key={i} className="card grid gap-2 md:grid-cols-3">
                    <Field label={`Sample ${i + 1} input`}><textarea className="input h-24 font-mono text-xs" value={s.input} onChange={(e) => set('samples', q.samples.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))} /></Field>
                    <Field label="Expected output"><textarea className="input h-24 font-mono text-xs" value={s.output} onChange={(e) => set('samples', q.samples.map((x, j) => (j === i ? { ...x, output: e.target.value } : x)))} /></Field>
                    <Field label="Explanation"><textarea className="input h-24 text-xs" value={s.explanation} onChange={(e) => set('samples', q.samples.map((x, j) => (j === i ? { ...x, explanation: e.target.value } : x)))} /></Field>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">Hidden tests ({q.hidden.length}/15 — need 10–15)</h3>
                  <button type="button" className="btn-secondary ml-auto" disabled={q.hidden.length >= 15} onClick={() => set('hidden', [...q.hidden, { input: '', output: '', weight: 1, isStress: false }])}>Add hidden test</button>
                </div>
                {q.hidden.map((h, i) => (
                  <div key={i} className="card grid gap-2 md:grid-cols-[1fr_1fr_140px]">
                    <Field label={`Hidden ${i + 1} input`}><textarea className="input h-20 font-mono text-xs" value={h.input.length > 20000 ? `${h.input.slice(0, 20000)}\n… (${h.input.length} chars)` : h.input} readOnly={h.input.length > 20000} onChange={(e) => set('hidden', q.hidden.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))} /></Field>
                    <Field label="Expected output"><textarea className="input h-20 font-mono text-xs" value={h.output} onChange={(e) => set('hidden', q.hidden.map((x, j) => (j === i ? { ...x, output: e.target.value } : x)))} /></Field>
                    <div className="space-y-2">
                      <Field label="Weight"><input className="input" type="number" min={1} max={100} value={h.weight} onChange={(e) => set('hidden', q.hidden.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} /></Field>
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={h.isStress} onChange={(e) => set('hidden', q.hidden.map((x, j) => (j === i ? { ...x, isStress: e.target.checked } : x)))} /> Max-constraint stress test</label>
                      <button type="button" className="text-xs text-rose-600 hover:underline" onClick={() => set('hidden', q.hidden.filter((_, j) => j !== i))}>Remove</button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {tab === 'code' && (
              <>
                <div className="flex flex-wrap gap-1">
                  {RUNTIME_IDS.map((r) => (
                    <button type="button" key={r} onClick={() => setLang(r)} className={`btn ${lang === r ? 'bg-brand-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                      {RUNTIMES[r].label}{REQUIRED_RUNTIMES.includes(r) ? '*' : ''}{q.templates[r] ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  * required. The stub is what students see. The hidden driver reads input, calls the student&apos;s function and prints the output. For C, C++, Python, JavaScript and Rust it is
                  appended to the student&apos;s code (or put a line containing <code>@@STUDENT_CODE@@</code> where it should go). Java, Go and C# compile it as a separate file
                  ({RUNTIMES.java.label}: <code>public class Main</code> + student <code>class Solution</code>).
                </p>
                <div className="flex gap-1 text-sm">
                  {(['stub', 'driver', 'solution'] as const).map((p) => (
                    <button type="button" key={p} className={`px-2 py-1 capitalize ${part === p ? 'border-b-2 border-brand-600 font-medium' : 'text-slate-500'}`} onClick={() => setPart(p)}>
                      {p === 'stub' ? 'Starter stub' : p === 'driver' ? 'Hidden driver' : 'Reference solution'}
                    </button>
                  ))}
                  {q.templates[lang] && <button type="button" className="ml-auto text-xs text-rose-600 hover:underline" onClick={() => { const t = { ...q.templates }; delete t[lang]; set('templates', t); }}>Remove {RUNTIMES[lang].label}</button>}
                </div>
                <div className="h-[420px] overflow-hidden rounded border border-slate-200 dark:border-slate-800">
                  <CodeEditor
                    key={`${lang}-${part}`}
                    value={tpl[part]}
                    language={RUNTIMES[lang].monaco}
                    readOnly={!writable}
                    onChange={(val) => set('templates', { ...q.templates, [lang]: { ...tpl, [part]: val } })}
                    ariaLabel={`${RUNTIMES[lang].label} ${part}`}
                  />
                </div>
              </>
            )}
          </fieldset>
        </div>

        <aside className="space-y-4">
          {!writable ? (
            <div className="card text-sm text-slate-600 dark:text-slate-400">
              {detail?.global ? 'Global question: read-only. Only super admins can edit the global bank; drivers and reference solutions are hidden.' : 'Read-only view.'}
            </div>
          ) : (
          <div className="card">
            <h3 className="mb-2 text-sm font-medium">Publish checklist</h3>
            {problems.length === 0 ? <p className="text-sm text-emerald-700 dark:text-emerald-400">Structure is complete. Validation will run every reference solution against every test.</p> : (
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
                {Object.entries(v.runtimes).sort(([a], [b]) => RUNTIME_IDS.indexOf(a as RuntimeId) - RUNTIME_IDS.indexOf(b as RuntimeId)).map(([rt, r]) => (
                  <li key={rt} className="flex justify-between">
                    <span>{RUNTIMES[rt as RuntimeId]?.label ?? rt}</span>
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
