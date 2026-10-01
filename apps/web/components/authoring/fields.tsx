'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { CodeEditor } from '@/components/code-editor';

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <div>
    <label className="label">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>
);

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly T[]; value: T; onChange: (t: T) => void; label: (t: T) => string }) {
  return (
    <div className="mb-3 flex gap-1 border-b border-slate-200 text-sm dark:border-slate-800" role="tablist">
      {tabs.map((t) => (
        <button type="button" key={t} role="tab" aria-selected={value === t} className={`px-3 py-1.5 ${value === t ? 'border-b-2 border-brand-600 font-medium' : 'text-slate-500'}`} onClick={() => onChange(t)}>
          {label(t)}
        </button>
      ))}
    </div>
  );
}

/**
 * JSON editor for a structured value. Keeps the author's text while it is invalid and only
 * propagates values that parse and pass `schema`; the error is shown inline.
 */
export function JsonField<S extends z.ZodType>({ value, onChange, schema, height = 160, readOnly, ariaLabel, modelPath }: { value: z.input<S> | z.output<S>; onChange: (v: z.output<S>) => void; schema: S; height?: number; readOnly?: boolean; ariaLabel: string; modelPath: string }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);
  const last = useRef(JSON.stringify(value));
  // Follow external changes (e.g. a template inserted) without clobbering the author's typing.
  useEffect(() => {
    const s = JSON.stringify(value);
    if (s !== last.current) {
      last.current = s;
      setText(JSON.stringify(value, null, 2));
      setErr(null);
    }
  }, [value]);
  const edit = (t: string) => {
    setText(t);
    let parsed: unknown;
    try {
      parsed = JSON.parse(t);
    } catch (e) {
      return setErr((e as Error).message);
    }
    const r = schema.safeParse(parsed);
    if (!r.success) return setErr(r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
    setErr(null);
    last.current = JSON.stringify(r.data);
    onChange(r.data);
  };
  return (
    <div>
      <div className="overflow-hidden rounded border border-slate-200 dark:border-slate-800" style={{ height }}>
        <CodeEditor path={modelPath} value={text} language="json" onChange={edit} readOnly={readOnly} ariaLabel={ariaLabel} />
      </div>
      {err && <p className="mt-1 text-xs text-rose-700 dark:text-rose-400" role="alert">{err}</p>}
    </div>
  );
}

export function CommonDetails<Q extends { title: string; statement: string; difficulty: 'easy' | 'moderate' | 'hard'; tags: string[]; isPractice: boolean }>({ q, set, children }: { q: Q; set: <K extends keyof Q>(k: K, v: Q[K]) => void; children?: ReactNode }) {
  return (
    <>
      <Field label="Title"><input className="input" value={q.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Description (Markdown)"><textarea className="input h-40 font-mono text-xs" value={q.statement} onChange={(e) => set('statement', e.target.value)} /></Field>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Difficulty">
          <select className="input" value={q.difficulty} onChange={(e) => set('difficulty', e.target.value as Q['difficulty'])}>
            <option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option>
          </select>
        </Field>
        <Field label="Tags (comma-separated)"><input className="input" value={q.tags.join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))} /></Field>
        {children}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.isPractice} onChange={(e) => set('isPractice', e.target.checked as Q['isPractice'])} /> Available in practice mode</label>
    </>
  );
}
