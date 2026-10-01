'use client';

import type { WebFile, WebFramework } from '@hbe/shared';
import { useEffect, useRef, useState } from 'react';

/**
 * Live preview of a student's web files. The document is built by the same @hbe/web-runtime code
 * the grader uses, then shown in /preview/frame.html inside a sandboxed iframe WITHOUT
 * allow-same-origin: the student's code runs in an opaque origin (no access to this page, its
 * cookies or storage) under a CSP with no network access at all. srcdoc/blob: frames would
 * inherit this page's CSP (hash-only scripts), which is why a separate frame page is used.
 */
type Runtime = typeof import('@hbe/web-runtime');
let runtimeP: Promise<Runtime> | null = null;
let vendorP: Promise<{ react: string; reactDom: string }> | null = null;
const runtime = () => (runtimeP ??= import('@hbe/web-runtime'));
const vendor = () =>
  (vendorP ??= Promise.all(['/vendor/react.production.min.js', '/vendor/react-dom.production.min.js'].map((u) => fetch(u).then((r) => {
    if (!r.ok) throw new Error(`could not load ${u}`);
    return r.text();
  })))
    .then(([react, reactDom]) => ({ react: react!, reactDom: reactDom! }))
    .catch((e: unknown) => {
      vendorP = null;
      throw e;
    }));

export function WebPreview({ framework, files, width }: { framework: WebFramework; files: WebFile[]; width?: number }) {
  const [doc, setDoc] = useState<{ html: string; gen: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const rt = await runtime();
        const html = rt.buildDocument({ framework, files, vendor: framework === 'react' ? await vendor() : undefined, head: rt.previewHead() });
        if (!cancelled) {
          setError(null);
          setDoc({ html, gen: ++gen.current });
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [framework, files]);

  useEffect(() => {
    if (!doc) return;
    const onMessage = (e: MessageEvent) => {
      // Only the frame we created for this generation may ask for the document.
      if (e.source !== frame.current?.contentWindow || (e.data as { type?: string })?.type !== 'hbe-preview-ready') return;
      frame.current?.contentWindow?.postMessage({ type: 'hbe-preview', html: doc.html }, '*');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [doc]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-slate-100 dark:bg-slate-900">
      {error && <pre role="alert" className="max-h-40 overflow-auto bg-rose-50 p-2 font-mono text-xs whitespace-pre-wrap text-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</pre>}
      <div className="flex min-h-0 flex-1 justify-center overflow-auto">
        {doc && (
          <iframe
            key={doc.gen}
            ref={frame}
            title="Preview"
            src="/preview/frame.html"
            sandbox="allow-scripts allow-forms allow-modals"
            referrerPolicy="no-referrer"
            className="h-full border-0 bg-white"
            style={{ width: width ? `${width}px` : '100%' }}
            data-testid="preview"
          />
        )}
      </div>
    </div>
  );
}
