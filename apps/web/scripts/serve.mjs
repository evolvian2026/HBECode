// Minimal static server for local/e2e runs with the same security headers as production.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../out', import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain' };
export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "frame-ancestors 'none'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
};

export const PREVIEW_FRAMING = { 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'" };

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let p = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!p.startsWith(root)) return void res.writeHead(400).end();
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) p = join(root, '404.html');
  // The preview frame may be framed by our own pages (and only them); see render.yaml.
  const framing = url.pathname.startsWith('/preview/') ? PREVIEW_FRAMING : {};
  res.writeHead(existsSync(p) && !p.endsWith('404.html') ? 200 : 404, { 'content-type': types[extname(p)] ?? 'application/octet-stream', ...SECURITY_HEADERS, ...framing });
  createReadStream(p).pipe(res);
}).listen(port, () => console.log(`web on http://localhost:${port}`));
