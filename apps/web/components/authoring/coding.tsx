'use client';

import { RUNTIMES, RUNTIME_IDS, REQUIRED_RUNTIMES, type CodingQuestionInput, type RuntimeId } from '@hbe/shared';
import { useState } from 'react';
import { CodeEditor } from '@/components/code-editor';
import { Field, Tabs } from './fields';

export const emptyCoding = (): CodingQuestionInput => ({
  type: 'coding',
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

export function CodingFields({ q, setQ, writable }: { q: CodingQuestionInput; setQ: (f: (q: CodingQuestionInput) => CodingQuestionInput) => void; writable: boolean }) {
  const [tab, setTab] = useState<'details' | 'tests' | 'code'>('details');
  const [lang, setLang] = useState<RuntimeId>('python');
  const [part, setPart] = useState<'stub' | 'driver' | 'solution'>('stub');
  const set = <K extends keyof CodingQuestionInput>(k: K, v: CodingQuestionInput[K]) => setQ((x) => ({ ...x, [k]: v }));
  const tpl = q.templates[lang] ?? { stub: '', driver: '', solution: '' };
  return (
    <>
      <Tabs tabs={['details', 'tests', 'code'] as const} value={tab} onChange={setTab} label={(t) => (t === 'code' ? 'Languages' : t === 'tests' ? 'Tests' : 'Details')} />
      {/* Tabs stay usable in read-only mode; only the fields are disabled. */}
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
    </>
  );
}
