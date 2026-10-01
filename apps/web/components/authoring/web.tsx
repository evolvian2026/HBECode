'use client';

import { CheckSpec, entryFile, type WebCheck, type WebQuestionInput } from '@hbe/shared';
import { useState } from 'react';
import { FileTabsEditor } from '@/components/file-tabs-editor';
import { WebPreview } from '@/components/web-preview';
import { CommonDetails, Field, JsonField, Tabs } from './fields';

export const CHECK_TEMPLATES: Record<string, CheckSpec> = {
  'Element exists': { kind: 'exists', selector: 'nav a', count: { min: 3 } },
  'Text content': { kind: 'text', selector: 'h1', match: { equals: 'Hello' } },
  Attribute: { kind: 'attribute', selector: 'img', name: 'alt', match: { contains: 'logo' } },
  'Computed style': { kind: 'style', selector: '.menu', property: 'display', match: { equals: 'flex' } },
  'ARIA role': { kind: 'role', role: 'button', name: 'Add' },
  Accessibility: { kind: 'a11y', rule: 'img-alt' },
  Interaction: { kind: 'interaction', steps: [{ action: 'click', selector: '#add' }], then: { kind: 'text', selector: '#count', match: { equals: '1' } } },
};

const STARTERS = {
  html: [
    { path: 'index.html', content: '<!doctype html>\n<html lang="en">\n<head>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n\n  <script src="script.js"></script>\n</body>\n</html>\n' },
    { path: 'styles.css', content: '' },
    { path: 'script.js', content: '' },
  ],
  react: [
    { path: 'App.jsx', content: "import { useState } from 'react';\nimport './App.css';\n\nexport default function App() {\n  return <main></main>;\n}\n" },
    { path: 'App.css', content: '' },
  ],
};

export const emptyWeb = (framework: 'html' | 'react'): WebQuestionInput => ({
  type: 'web',
  framework,
  title: '',
  statement: '',
  difficulty: 'easy',
  tags: [],
  isPractice: true,
  starterFiles: STARTERS[framework],
  // The reference starts as a copy of the starter; authors complete it.
  referenceFiles: STARTERS[framework],
  samples: [],
  hidden: [],
  checkTimeoutMs: 5000,
});

function CheckRow({ c, onChange, onRemove, idPrefix }: { c: WebCheck; onChange: (c: WebCheck) => void; onRemove: () => void; idPrefix: string }) {
  return (
    <div className="card space-y-2" data-testid="check-row">
      <div className="grid gap-2 md:grid-cols-[1fr_90px_220px_auto]">
        <Field label="Title (students see sample titles)"><input className="input" value={c.title} onChange={(e) => onChange({ ...c, title: e.target.value })} /></Field>
        <Field label="Weight"><input className="input" type="number" min={1} max={100} value={c.weight} onChange={(e) => onChange({ ...c, weight: Number(e.target.value) })} /></Field>
        <Field label="Viewport (blank = 1280×800)">
          <div className="flex gap-1">
            <input className="input" type="number" placeholder="width" aria-label="Viewport width" value={c.viewport?.width ?? ''} onChange={(e) => onChange({ ...c, viewport: e.target.value ? { width: Number(e.target.value), height: c.viewport?.height ?? 800 } : undefined })} />
            <input className="input" type="number" placeholder="height" aria-label="Viewport height" value={c.viewport?.height ?? ''} disabled={!c.viewport} onChange={(e) => c.viewport && onChange({ ...c, viewport: { ...c.viewport, height: Number(e.target.value) } })} />
          </div>
        </Field>
        <div className="flex items-end gap-2 pb-1">
          <select className="input w-auto py-1 text-xs" aria-label="Insert template" value="" onChange={(e) => e.target.value && onChange({ ...c, spec: CHECK_TEMPLATES[e.target.value]! })}>
            <option value="">Template…</option>
            {Object.keys(CHECK_TEMPLATES).map((k) => <option key={k}>{k}</option>)}
          </select>
          <button type="button" className="text-xs text-rose-600 hover:underline" onClick={onRemove}>Remove</button>
        </div>
      </div>
      <JsonField value={c.spec} onChange={(spec) => onChange({ ...c, spec })} schema={CheckSpec} height={140} ariaLabel={`${c.title || 'check'} definition`} modelPath={`file:///${idPrefix}.json`} />
    </div>
  );
}

const newCheck = (): WebCheck => ({ title: 'New check', weight: 1, spec: CHECK_TEMPLATES['Element exists']! });

export function WebFields({ q, setQ, isNew, writable }: { q: WebQuestionInput; setQ: (f: (q: WebQuestionInput) => WebQuestionInput) => void; isNew: boolean; writable: boolean }) {
  const [tab, setTab] = useState<'details' | 'files' | 'checks'>('details');
  const [which, setWhich] = useState<'starterFiles' | 'referenceFiles'>('starterFiles');
  const set = <K extends keyof WebQuestionInput>(k: K, v: WebQuestionInput[K]) => setQ((x) => ({ ...x, [k]: v }));
  const entry = entryFile(q.framework);
  const files = q[which];

  return (
    <>
      <Tabs tabs={['details', 'files', 'checks'] as const} value={tab} onChange={setTab} label={(t) => (t === 'details' ? 'Details' : t === 'files' ? 'Files' : `Checks (${q.samples.length + q.hidden.length})`)} />
      {tab === 'details' && (
        <CommonDetails q={q} set={set}>
          <Field label="Framework" hint={isNew ? undefined : 'Cannot change after creation'}>
            <select className="input" value={q.framework} disabled={!isNew} onChange={(e) => setQ(() => ({ ...emptyWeb(e.target.value as 'html' | 'react'), title: q.title, statement: q.statement }))}>
              <option value="html">HTML / CSS / JavaScript</option><option value="react">React</option>
            </select>
          </Field>
          <Field label="Per-check timeout (ms)"><input className="input" type="number" min={1000} max={15000} value={q.checkTimeoutMs} onChange={(e) => set('checkTimeoutMs', Number(e.target.value))} /></Field>
        </CommonDetails>
      )}
      {tab === 'files' && (
        <div className="space-y-2">
          <div className="flex gap-2 text-sm">
            {(['starterFiles', 'referenceFiles'] as const).map((w) => (
              <button type="button" key={w} className={`btn ${which === w ? 'bg-brand-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`} onClick={() => setWhich(w)}>
                {w === 'starterFiles' ? 'Starter files (students start here)' : 'Reference solution (hidden)'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Validation requires the reference to pass every check and the starter files to fail at least one hidden check. Entry file: <code>{entry}</code>.
          </p>
          <div className="grid h-[480px] gap-2 lg:grid-cols-2">
            <div className="min-h-0 overflow-hidden rounded border border-slate-200 dark:border-slate-800">
              <FileTabsEditor key={which} files={files} onChange={(f) => set(which, f)} entry={entry} modelPrefix={`author/${which}`} readOnly={!writable} addHint="New file name (e.g. styles.css, components/Card.jsx)" />
            </div>
            <div className="min-h-0 overflow-hidden rounded border border-slate-200 dark:border-slate-800">
              <WebPreview framework={q.framework} files={files} />
            </div>
          </div>
        </div>
      )}
      {tab === 'checks' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Each check is one JSON object. Styles are computed values (colours as <code>rgb(…)</code>, sizes in px). Interaction checks run steps, then assert. Viewport sets responsive checks (e.g. 375 wide).
          </p>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Sample checks ({q.samples.length}/2, titles shown to students)</h3>
            <button type="button" className="btn-secondary ml-auto" disabled={q.samples.length >= 2} onClick={() => set('samples', [...q.samples, newCheck()])}>Add sample check</button>
          </div>
          {q.samples.map((c, i) => <CheckRow key={`s${i}`} idPrefix={`author/sample-${i}`} c={c} onChange={(n) => set('samples', q.samples.map((x, j) => (j === i ? n : x)))} onRemove={() => set('samples', q.samples.filter((_, j) => j !== i))} />)}
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Hidden checks ({q.hidden.length}/15 — need 8–15)</h3>
            <button type="button" className="btn-secondary ml-auto" disabled={q.hidden.length >= 15} onClick={() => set('hidden', [...q.hidden, newCheck()])}>Add hidden check</button>
          </div>
          {q.hidden.map((c, i) => <CheckRow key={`h${i}`} idPrefix={`author/hidden-${i}`} c={c} onChange={(n) => set('hidden', q.hidden.map((x, j) => (j === i ? n : x)))} onRemove={() => set('hidden', q.hidden.filter((_, j) => j !== i))} />)}
        </div>
      )}
    </>
  );
}
