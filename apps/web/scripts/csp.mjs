// Post-build: inject a Content-Security-Policy <meta> into every exported page. Inline scripts
// that Next.js emits are allowed by hash (no 'unsafe-inline' for scripts). frame-ancestors and
// the other headers that cannot live in <meta> are set by the host (render.yaml / serve.mjs).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../out', import.meta.url));
const api = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

function* html(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* html(p);
    else if (f.endsWith('.html')) yield p;
  }
}

export function policy(scriptHashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.map((h) => `'${h}'`).join(' ')}`.trim(),
    // Monaco and Next inject <style> elements at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${api}`,
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

let pages = 0;
for (const file of html(out)) {
  let doc = readFileSync(file, 'utf8');
  const hashes = new Set();
  for (const m of doc.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (m[1]) hashes.add(`sha256-${createHash('sha256').update(m[1]).digest('base64')}`);
  }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy([...hashes])}"/>`;
  doc = doc.replace(/<meta http-equiv="Content-Security-Policy"[^>]*\/>/, '').replace(/<head>/, `<head>${meta}`);
  writeFileSync(file, doc);
  pages++;
}
console.log(`CSP injected into ${pages} pages`);
