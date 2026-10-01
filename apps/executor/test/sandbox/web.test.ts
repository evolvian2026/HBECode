/**
 * Web grading in jailed Chromium: correctness of the check DSL, resistance to page scripts that
 * try to fake results, and network isolation of student code.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { WebJob } from '@hbe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextId, Sandbox } from './harness.js';

let sb: Sandbox;
let hits = 0;
let server: Server;
let port = 0;

beforeAll(async () => {
  sb = await Sandbox.start();
  server = createServer((_req, res) => {
    hits++;
    res.end('ok');
  });
  await new Promise<void>((r) => server.listen(0, '0.0.0.0', () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  await sb?.stop();
  server?.close();
});

type Check = WebJob['checks'][number];
let ord = 0;
const check = (spec: Check['spec'], extra: Partial<Check> = {}): Check => ({ id: `c${++ord}`, ordinal: ord, hidden: false, title: 't', spec, ...extra });
const web = (framework: 'html' | 'react', files: Record<string, string>, checks: Check[]): WebJob => ({
  type: 'web', jobId: nextId(), kind: 'run', framework, files: Object.entries(files).map(([path, content]) => ({ path, content })), checks, checkTimeoutMs: 5000,
});

const PAGE = `<!doctype html><html lang="en"><head><link rel="stylesheet" href="styles.css"></head><body>
<header><h1 class="title">Todo</h1><nav class="menu"><a href="#">Home</a></nav></header>
<main><label for="t">Task</label><input id="t" type="text"><button id="add">Add</button><ul id="list"></ul>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="logo"></main>
<script src="app.js"></script></body></html>`;
const CSS = `.title{color:rgb(255,0,0);font-size:32px}.menu{display:flex}@media (max-width:600px){.menu{display:none}}#list li{padding:4px}`;
const JS = `document.getElementById('add').addEventListener('click',()=>{const v=document.getElementById('t').value.trim();if(!v)return;const li=document.createElement('li');li.textContent=v;document.getElementById('list').appendChild(li);document.getElementById('t').value='';});`;

describe('HTML/CSS/JS checks', () => {
  it('evaluates DOM, text, style, attribute, role, a11y, interaction and responsive checks', async () => {
    const r = await sb.run(
      web('html', { 'index.html': PAGE, 'styles.css': CSS, 'app.js': JS }, [
        check({ kind: 'exists', selector: 'header nav.menu a', count: { eq: 1 } }),
        check({ kind: 'text', selector: 'h1', match: { equals: 'Todo' } }),
        check({ kind: 'style', selector: '.title', property: 'color', match: { equals: 'rgb(255, 0, 0)' } }),
        check({ kind: 'style', selector: '.menu', property: 'display', match: { equals: 'flex' } }),
        check({ kind: 'style', selector: '.menu', property: 'display', match: { equals: 'none' } }, { viewport: { width: 375, height: 700 } }),
        check({ kind: 'attribute', selector: 'img', name: 'alt', match: { equals: 'logo' } }),
        check({ kind: 'role', role: 'button', name: 'Add' }),
        check({ kind: 'a11y', rule: 'input-labels' }),
        check({ kind: 'a11y', rule: 'img-alt' }),
        check({ kind: 'a11y', rule: 'document-lang' }),
        check({ kind: 'interaction', steps: [{ action: 'fill', selector: '#t', value: 'Buy milk' }, { action: 'click', selector: '#add' }], then: { kind: 'text', selector: '#list li', match: { equals: 'Buy milk' } } }),
        check({ kind: 'interaction', steps: [{ action: 'click', selector: '#add' }], then: { kind: 'exists', selector: '#list li', count: { eq: 0 } } }),
      ]),
    );
    expect(r.internalError).toBeUndefined();
    expect(r.tests.map((t) => [t.verdict, t.detail ?? ''])).toEqual(r.tests.map(() => ['AC', '']));
  });

  it('explains failures on visible checks and stays silent on hidden ones', async () => {
    const r = await sb.run(
      web('html', { 'index.html': PAGE, 'styles.css': '.title{color:blue}', 'app.js': '' }, [
        check({ kind: 'style', selector: '.title', property: 'color', match: { equals: 'rgb(255, 0, 0)' } }),
        check({ kind: 'style', selector: '.title', property: 'color', match: { equals: 'rgb(255, 0, 0)' } }, { hidden: true }),
        check({ kind: 'text', selector: '#missing', match: { contains: 'x' } }),
      ]),
    );
    expect(r.tests.map((t) => t.verdict)).toEqual(['WA', 'WA', 'WA']);
    expect(r.tests[0]!.detail).toBe('color of ".title" expected = "rgb(255, 0, 0)", got "rgb(0, 0, 255)"');
    expect(r.tests[1]!.detail).toBeUndefined();
    expect(r.tests[2]!.detail).toMatch(/no element matches "#missing"/);
  });

  it('cannot be fooled by page scripts that patch DOM and style APIs', async () => {
    const liar = `
      const real = window.getComputedStyle;
      window.getComputedStyle = (el) => new Proxy(real(el), { get: (t, p) => (p === 'color' ? 'rgb(255, 0, 0)' : p === 'getPropertyValue' ? () => 'rgb(255, 0, 0)' : t[p]) });
      CSSStyleDeclaration.prototype.getPropertyValue = () => 'rgb(255, 0, 0)';
      Object.defineProperty(Node.prototype, 'textContent', { get() { return 'Todo'; } });
      Element.prototype.getAttribute = () => 'logo';
      document.querySelectorAll = () => [1, 2, 3];
    `;
    const r = await sb.run(
      web('html', { 'index.html': PAGE.replace('Todo', 'Something else').replace('alt="logo"', 'alt="nope"'), 'styles.css': '.title{color:blue}', 'app.js': liar }, [
        check({ kind: 'style', selector: '.title', property: 'color', match: { equals: 'rgb(255, 0, 0)' } }),
        check({ kind: 'text', selector: 'h1', match: { equals: 'Todo' } }),
        check({ kind: 'attribute', selector: 'img', name: 'alt', match: { equals: 'logo' } }),
        check({ kind: 'exists', selector: 'nav a', count: { eq: 3 } }),
      ]),
    );
    expect(r.tests.map((t) => t.verdict)).toEqual(['WA', 'WA', 'WA', 'WA']);
  });

  it('student code cannot reach the network (fetch, XHR, image, beacon, WebSocket, WebRTC, navigation)', async () => {
    const host = (await sb.sh("ip route 2>/dev/null | awk '/default/ {print $3}' || true")).trim() || '172.17.0.1';
    const url = `http://${host}:${port}/hit`;
    const js = `
      const u = ${JSON.stringify(url)}; const out = [];
      fetch(u).then(() => out.push('fetch-OPEN')).catch(() => out.push('fetch-blocked')).finally(done);
      const x = new XMLHttpRequest(); x.open('GET', u); x.onload = () => out.push('xhr-OPEN'); x.onerror = () => out.push('xhr-blocked'); x.send();
      new Image().src = u + '?img'; navigator.sendBeacon && navigator.sendBeacon(u + '?beacon', 'x');
      try { const ws = new WebSocket(u.replace('http', 'ws')); ws.onopen = () => out.push('ws-OPEN'); } catch (e) {}
      try { const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:${host}:${port}' }] }); pc.createDataChannel('x'); pc.createOffer().then((o) => pc.setLocalDescription(o)); } catch (e) {}
      function done() { setTimeout(() => { document.getElementById('list').textContent = out.sort().join(','); }, 1500); }
    `;
    const r = await sb.run(web('html', { 'index.html': PAGE, 'styles.css': CSS, 'app.js': js }, [check({ kind: 'interaction', steps: [{ action: 'hover', selector: 'h1' }], then: { kind: 'text', selector: '#list', match: { matches: 'blocked' } } })]));
    await new Promise((res) => setTimeout(res, 2500));
    expect(r.tests[0]!.verdict).not.toBe('IE');
    expect(hits).toBe(0);
    // Positive control: the same URL IS reachable from the executor container (outside the jail),
    // so zero hits above means the jail blocked it, not that the listener was unreachable.
    await sb.sh(`/opt/node/bin/node -e "fetch('${url}').then(r=>r.text()).then(console.log)"`);
    expect(hits).toBe(1);
  });

  it('a step on a missing element fails fast with a reason, not a timeout', async () => {
    const t0 = Date.now();
    const r = await sb.run(
      web('html', { 'index.html': '<!doctype html><html lang="en"><body><p id="p">x</p></body></html>' }, [
        check({ kind: 'interaction', steps: [{ action: 'click', selector: '#add' }], then: { kind: 'exists', selector: 'li' } }),
        check({ kind: 'interaction', steps: [{ action: 'fill', selector: '#task', value: 'a' }], then: { kind: 'exists', selector: 'li' } }, { hidden: true }),
      ]),
    );
    expect(r.tests.map((t) => t.verdict)).toEqual(['WA', 'WA']);
    expect(r.tests[0]!.detail).toBe('could not click "#add" (not found, hidden or disabled)');
    expect(r.tests[1]!.detail).toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(8000); // was ~2 × 5 s before steps had their own wait
  });

  it('an infinite loop times out without breaking the next job; nothing persists between jobs', async () => {
    const loop = await sb.run(web('html', { 'index.html': '<!doctype html><html><body><p id="p">x</p><script>while(true){}</script></body></html>' }, [check({ kind: 'text', selector: '#p', match: { equals: 'x' } })]));
    expect(['TLE', 'RE']).toContain(loop.tests[0]!.verdict);
    const set = `<!doctype html><html><body><p id="p"></p><script>localStorage.setItem('k','leaked'); document.cookie='c=leaked'; document.getElementById('p').textContent='set';</script></body></html>`;
    const get = `<!doctype html><html><body><p id="p"></p><script>document.getElementById('p').textContent=(localStorage.getItem('k')||'')+'|'+document.cookie;</script></body></html>`;
    await sb.run(web('html', { 'index.html': set }, [check({ kind: 'text', selector: '#p', match: { equals: 'set' } })]));
    const r = await sb.run(web('html', { 'index.html': get }, [check({ kind: 'text', selector: '#p', match: { equals: '|' } })]));
    expect(r.tests[0]!.verdict).toBe('AC');
    const ps = await sb.sh("ps -eo user:20,args | awk '$1==\"nobody\" || $1==\"65534\"'");
    expect(ps.trim()).toBe('');
  });
});

describe('React', () => {
  const APP = `import { useState } from 'react';
import Counter from './Counter';
import './App.css';
export default function App() {
  const [items, setItems] = useState([]);
  return (<main><h1>Cart</h1><Counter onAdd={() => setItems([...items, 'item ' + (items.length + 1)])} />
    <ul aria-label="items">{items.map((i) => <li key={i}>{i}</li>)}</ul><p className="total">Total: {items.length}</p></main>);
}`;
  const COUNTER = `export default function Counter({ onAdd }) { return <button type="button" onClick={onAdd}>Add item</button>; }`;

  it('renders a multi-file React app and grades interactions', async () => {
    const r = await sb.run(
      web('react', { 'App.jsx': APP, 'Counter.jsx': COUNTER, 'App.css': '.total{font-weight:700}' }, [
        check({ kind: 'role', role: 'heading', name: 'Cart' }),
        check({ kind: 'style', selector: '.total', property: 'font-weight', match: { equals: '700' } }),
        check({ kind: 'interaction', steps: [{ action: 'click', selector: 'button' }, { action: 'click', selector: 'button' }], then: { kind: 'text', selector: '.total', match: { equals: 'Total: 2' } } }),
        check({ kind: 'interaction', steps: [{ action: 'click', selector: 'button' }], then: { kind: 'exists', selector: 'li', count: { eq: 1 } } }),
      ]),
    );
    expect(r.internalError).toBeUndefined();
    expect(r.tests.map((t) => t.verdict)).toEqual(['AC', 'AC', 'AC', 'AC']);
  });

  it('reports JSX syntax errors as a compile error', async () => {
    const r = await sb.run(web('react', { 'App.jsx': 'export default function App(){ return <div>; }' }, [check({ kind: 'exists', selector: 'div' })]));
    expect(r.compile.ok).toBe(false);
    expect(r.compile.output).toMatch(/^App\.jsx: /);
  });

  it('a runtime error in a component fails checks with an explanation', async () => {
    const r = await sb.run(web('react', { 'App.jsx': 'export default function App(){ throw new Error("boom"); }' }, [check({ kind: 'exists', selector: 'main' })]));
    expect(r.tests[0]!.verdict).toBe('WA');
    expect(r.tests[0]!.detail).toMatch(/boom/);
  });
});
