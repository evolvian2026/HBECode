'use client';

import Editor, { loader, type OnMount } from '@monaco-editor/react';
import { useRef } from 'react';

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
}

export function CodeEditor({ value, language, onChange, theme = 'light', fontSize = 14, readOnly = false, height = '100%', ariaLabel = 'Code editor' }: CodeEditorProps) {
  const ref = useRef<Parameters<OnMount>[0] | null>(null);
  return (
    <Editor
      height={height}
      language={language}
      value={value}
      theme={theme === 'dark' ? 'vs-dark' : 'vs'}
      onChange={(v) => onChange?.(v ?? '')}
      onMount={(ed) => {
        ref.current = ed;
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
      }}
    />
  );
}
