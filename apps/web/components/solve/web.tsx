'use client';

import { entryFile, VERDICT_LABELS, WebFiles, type SessionUser, type WebFile, type WebFramework } from '@hbe/shared';
import { useState } from 'react';
import { FileTabsEditor } from '@/components/file-tabs-editor';
import { Markdown } from '@/components/markdown';
import { WebPreview } from '@/components/web-preview';
import { initialDraft, ResultShell, SaveLabel, TopBar, useDraftSaver, useExecution, verdictTone, type Draft } from './common';

export interface WebQuestion {
  type: 'web';
  id: string;
  title: string;
  statement: string;
  difficulty: string;
  tags: string[];
  framework: WebFramework;
  starterFiles: WebFile[];
  samples: { title: string }[];
  hiddenCount: number;
  preview: boolean;
}

const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', width: undefined },
  { id: 'tablet', label: 'Tablet · 768', width: 768 },
  { id: 'mobile', label: 'Mobile · 375', width: 375 },
] as const;

function parseDraft(code: string, fallback: WebFile[]): WebFile[] {
  try {
    const r = WebFiles.safeParse(JSON.parse(code));
    return r.success ? r.data : fallback;
  } catch {
    return fallback;
  }
}

export function WebSolve({ q, drafts, user }: { q: WebQuestion; drafts: Draft[]; user: SessionUser }) {
  const entry = entryFile(q.framework);
  const [files, setFiles] = useState<WebFile[]>(() => parseDraft(initialDraft(drafts, q.id, q.framework, ''), q.starterFiles));
  const [editorKey, setEditorKey] = useState(0);
  const [panel, setPanel] = useState<'preview' | 'result'>('preview');
  const [viewport, setViewport] = useState<(typeof VIEWPORTS)[number]['id']>('desktop');
  const { save, label } = useDraftSaver(q.id, user);
  const { result, busy, error, execute } = useExecution(q.id);

  const update = (next: WebFile[]) => {
    setFiles(next);
    save(q.framework, JSON.stringify(next));
  };
  const run = (kind: 'run' | 'submit') => {
    setPanel('result');
    void execute(kind, q.framework, JSON.stringify(files));
  };
  const vp = VIEWPORTS.find((v) => v.id === viewport)!;

  return (
    <div className="flex h-screen flex-col">
      <TopBar title={q.title} difficulty={q.difficulty} preview={q.preview} busy={busy} onRun={() => run('run')} onSubmit={() => run('submit')}>
        <span className="text-xs text-slate-500">{q.framework === 'react' ? 'React 18' : 'HTML · CSS · JavaScript'}</span>
      </TopBar>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="min-h-0 overflow-y-auto border-slate-200 p-4 lg:w-[28%] lg:border-r dark:border-slate-800" aria-label="Problem">
          <Markdown>{q.statement}</Markdown>
          <h3 className="mt-5 text-sm font-semibold">What is checked</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-700 dark:text-slate-300">
            {q.samples.map((s, i) => <li key={i}>{s.title}</li>)}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Run checks the {q.samples.length} examples above. Submit also runs {q.hiddenCount > 0 ? q.hiddenCount : 'the'} hidden checks (structure, styling, responsiveness, accessibility and behaviour).
          </p>
        </section>

        <section className="flex min-h-[320px] min-w-0 flex-1 flex-col border-slate-200 lg:border-r dark:border-slate-800" aria-label="Editor">
          <FileTabsEditor
            key={editorKey}
            files={files}
            onChange={update}
            entry={entry}
            modelPrefix={`${q.id}/solve`}
            addHint={q.framework === 'react' ? 'New file name (e.g. components/Card.jsx or styles.css)' : 'New file name (e.g. about.html, utils.js, theme.css)'}
            toolbar={
              <>
                <SaveLabel label={label} />
                <button type="button" className="btn-secondary my-1 px-2 py-0.5 text-xs" onClick={() => { if (confirm('Replace all files with the starter files?')) { update(q.starterFiles); setEditorKey((k) => k + 1); } }}>Reset</button>
              </>
            }
          />
        </section>

        <section className="flex min-h-[320px] flex-col lg:w-[38%]" aria-label="Output">
          <div className="flex items-center gap-1 border-b border-slate-200 px-2 text-sm dark:border-slate-800" role="tablist">
            {(['preview', 'result'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={panel === t} className={`px-3 py-1.5 ${panel === t ? 'border-b-2 border-brand-600 font-medium' : 'text-slate-500'}`} onClick={() => setPanel(t)}>
                {t === 'preview' ? 'Preview' : 'Result'}
              </button>
            ))}
            {panel === 'preview' && (
              <select className="input ml-auto w-auto py-0.5 text-xs" aria-label="Viewport" value={viewport} onChange={(e) => setViewport(e.target.value as typeof viewport)}>
                {VIEWPORTS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <div className={panel === 'preview' ? 'h-full' : 'hidden'}>
              <WebPreview framework={q.framework} files={files} width={vp.width} />
            </div>
            {panel === 'result' && (
              <div className="h-full overflow-y-auto p-3 text-sm">
                <ResultShell
                  result={result}
                  busy={busy}
                  error={error}
                  renderVisible={(t) => (
                    <div className="rounded border border-slate-200 p-2 dark:border-slate-800" data-testid="check">
                      <span className={verdictTone(t.verdict)}>{t.verdict === 'AC' ? '✓' : '✗'} {VERDICT_LABELS[t.verdict]}</span>
                      <span className="ml-2">{t.title ?? `Check ${t.ordinal}`}</span>
                      {t.detail && <p className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-400">{t.detail}</p>}
                    </div>
                  )}
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
