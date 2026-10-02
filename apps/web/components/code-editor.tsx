'use client';

import Editor, { loader, type OnMount } from '@monaco-editor/react';
import { useRef } from 'react';
import { useExam } from '@/components/exam/context';

/** One edit that inserts more than this many characters without a paste is reported. */
const BULK_INSERT_CHARS = 40;

// Self-hosted Monaco (copied to /public/monaco by scripts/copy-monaco.mjs): no CDN, CSP-friendly.
loader.config({ paths: { vs: '/monaco/vs' } });

export interface CodeEditorProps {
  value: string;
  language: string;
  onChange?: (v: string) => void;
  theme?: 'light' | 'dark';
  fontSize?: number;
  readOnly?: boolean;
  height?: string | number;
  ariaLabel?: string;
  /** Monaco model path: one model (and undo history) per file in multi-file editors. */
  path?: string;
}

export function CodeEditor({ value, language, onChange, theme = 'light', fontSize = 14, readOnly = false, height = '100%', ariaLabel = 'Code editor', path }: CodeEditorProps) {
  const ref = useRef<Parameters<OnMount>[0] | null>(null);
  const exam = useExam();
  const examRef = useRef(exam);
  examRef.current = exam;
  return (
    <Editor
      height={height}
      path={path}
      language={language}
      value={value}
      theme={theme === 'dark' ? 'vs-dark' : 'vs'}
      onChange={(v) => onChange?.(v ?? '')}
      onMount={(ed) => {
        ref.current = ed;
        // Proctoring (tests only): large insertions that did not come from a paste suggest text
        // injected by another tool. Logged for review, never blocked.
        let lastPaste = 0;
        // Pastes themselves are logged by the page-level agent (and blocked if the test says so).
        ed.onDidPaste(() => {
          lastPaste = Date.now();
        });
        ed.onDidChangeModelContent((e) => {
          const ex = examRef.current;
          if (!ex || e.isFlush || e.isUndoing || e.isRedoing || Date.now() - lastPaste < 1000) return;
          const inserted = e.changes.reduce((n, c) => n + c.text.length, 0);
          if (inserted > BULK_INSERT_CHARS) ex.report('bulk_insert', { chars: inserted });
        });
      }}
      loading={<div className="p-4 text-sm text-slate-500">Loading editor…</div>}
      options={{
        fontSize,
        readOnly,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        ariaLabel,
        renderWhitespace: 'selection',
        // Monaco's own telemetry/links are off; no external requests.
        links: false,
        // In tests: no editor context menu (its Paste bypasses keyboard handling) and no drag-and-drop.
        contextmenu: !exam,
        dragAndDrop: !exam,
        dropIntoEditor: { enabled: !exam },
      }}
    />
  );
}
