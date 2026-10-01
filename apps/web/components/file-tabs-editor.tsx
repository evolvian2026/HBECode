'use client';

import { WebFiles, type WebFile } from '@hbe/shared';
import { useState, type ReactNode } from 'react';
import { CodeEditor } from '@/components/code-editor';

export const monacoLanguage = (path: string) => (path.endsWith('.html') ? 'html' : path.endsWith('.css') ? 'css' : 'javascript');

/** Multi-file editor (tabs + Monaco, one model per file). The entry file cannot be removed. */
export function FileTabsEditor({ files, onChange, entry, modelPrefix, readOnly = false, toolbar, addHint }: { files: WebFile[]; onChange: (f: WebFile[]) => void; entry: string; modelPrefix: string; readOnly?: boolean; toolbar?: ReactNode; addHint: string }) {
  const [active, setActive] = useState(() => (files.some((f) => f.path === entry) ? entry : (files[0]?.path ?? entry)));
  const [fileError, setFileError] = useState<string | null>(null);
  const current = files.find((f) => f.path === active) ?? files[0];

  const addFile = () => {
    const path = prompt(addHint)?.trim();
    if (!path) return;
    const next = [...files, { path, content: '' }];
    const ok = WebFiles.safeParse(next);
    if (!ok.success) return setFileError(`${path}: ${ok.error.issues[0]?.message ?? 'invalid file name'}`);
    setFileError(null);
    onChange(next);
    setActive(path);
  };
  const removeFile = (path: string) => {
    if (path === entry || !confirm(`Delete ${path}?`)) return;
    onChange(files.filter((f) => f.path !== path));
    if (active === path) setActive(entry);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-2 text-sm dark:border-slate-800" role="tablist" aria-label="Files">
        {files.map((f) => (
          <span key={f.path} className={`flex items-center ${f.path === current?.path ? 'border-b-2 border-brand-600' : ''}`}>
            <button type="button" role="tab" aria-selected={f.path === current?.path} className={`px-2 py-1.5 font-mono text-xs ${f.path === current?.path ? 'font-semibold' : 'text-slate-500'}`} onClick={() => setActive(f.path)}>
              {f.path}
            </button>
            {!readOnly && f.path !== entry && (
              <button type="button" className="px-1 text-xs text-slate-400 hover:text-rose-600" aria-label={`Delete ${f.path}`} onClick={() => removeFile(f.path)}>×</button>
            )}
          </span>
        ))}
        {!readOnly && <button type="button" className="px-2 py-1.5 text-xs text-brand-600" onClick={addFile} disabled={files.length >= 20}>+ File</button>}
        <span className="ml-auto flex items-center gap-2 pr-1">{toolbar}</span>
      </div>
      {fileError && <p role="alert" className="bg-rose-50 px-3 py-1 text-xs text-rose-800">{fileError}</p>}
      <div className="min-h-0 flex-1">
        {current && (
          <CodeEditor
            path={`file:///${modelPrefix}/${current.path}`}
            value={current.content}
            language={monacoLanguage(current.path)}
            readOnly={readOnly}
            onChange={(v) => onChange(files.map((f) => (f.path === current.path ? { ...f, content: v } : f)))}
            ariaLabel={`${current.path} editor`}
          />
        )}
      </div>
    </div>
  );
}
