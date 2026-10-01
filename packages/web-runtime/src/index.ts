import type { WebFile, WebFramework } from '@hbe/shared';
import { transform } from 'sucrase';

/**
 * Build one self-contained HTML document from a student's files. Used by the browser preview
 * (inside a sandboxed iframe) and by the grader (inside jailed Chromium), so what students see is
 * exactly what is graded. Nothing is fetched: CSS/JS are inlined, React 18 UMD is inlined.
 */
export interface Vendor {
  react: string;
  reactDom: string;
}

export class BuildError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
  }
}

const inlineSafe = (code: string) => code.replace(/<\/(script)/gi, '<\\/$1');
const styleSafe = (css: string) => css.replace(/<\/(style)/gi, '<\\/$1');

function normalise(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/** HTML/CSS/JS: inline local stylesheets and scripts referenced by index.html. */
function buildHtml(files: Map<string, string>, head: string): string {
  let html = files.get('index.html') ?? '<!doctype html><html><head></head><body></body></html>';
  html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (tag, href: string) => {
    if (!/rel=["']?stylesheet/i.test(tag)) return tag;
    const css = files.get(normalise(href));
    return css === undefined ? tag : `<style data-file="${normalise(href)}">${styleSafe(css)}</style>`;
  });
  html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, pre: string, src: string, post: string) => {
    const js = files.get(normalise(src));
    return js === undefined ? tag : `<script${pre}${post} data-file="${normalise(src)}">${inlineSafe(js)}</script>`;
  });
  return injectHead(html, head);
}

function injectHead(html: string, head: string): string {
  if (!head) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${head}`);
  return `${head}${html}`;
}

/** React: transform each module with sucrase and link them with a tiny CommonJS loader. */
function buildReact(files: Map<string, string>, vendor: Vendor, head: string): string {
  const modules: string[] = [];
  for (const [path, src] of files) {
    if (path.endsWith('.css')) {
      modules.push(`${JSON.stringify(path)}:function(module){var s=document.createElement('style');s.setAttribute('data-file',${JSON.stringify(path)});s.textContent=${JSON.stringify(src)};document.head.appendChild(s);module.exports={};}`);
      continue;
    }
    if (!/\.(jsx?|js)$/.test(path)) continue;
    let code: string;
    try {
      code = transform(src, { transforms: ['jsx', 'imports'], jsxRuntime: 'classic', production: true, filePath: path }).code;
    } catch (e) {
      throw new BuildError(path, (e as Error).message.replace(/\s*\(\d+:\d+\)$/, (m) => m));
    }
    modules.push(`${JSON.stringify(path)}:function(module,exports,require){${code}\n}`);
  }
  if (!files.has('App.jsx')) throw new BuildError('App.jsx', 'missing entry file');
  const loader = `(function(){
var defs={${modules.join(',\n')}};var cache={};
function resolve(from,name){
  if(name==='react')return '@react';if(name==='react-dom'||name==='react-dom/client')return '@react-dom';
  var base=from.split('/');base.pop();var p=(name.charAt(0)==='.'?base.concat(name.split('/')):name.split('/'));var out=[];
  for(var i=0;i<p.length;i++){if(p[i]==='..')out.pop();else if(p[i]&&p[i]!=='.')out.push(p[i]);}
  var n=out.join('/');var c=[n,n+'.jsx',n+'.js',n+'/index.jsx',n+'/index.js'];
  for(var j=0;j<c.length;j++){if(defs[c[j]])return c[j];}
  throw new Error('Cannot find module '+JSON.stringify(name)+' from '+from);
}
function load(id){
  if(id==='@react')return window.React;if(id==='@react-dom'){return Object.assign({},window.ReactDOM,{createRoot:window.ReactDOM.createRoot});}
  if(cache[id])return cache[id].exports;var m={exports:{}};cache[id]=m;
  defs[id](m,m.exports,function(n){return load(resolve(id,n));});return m.exports;
}
window.addEventListener('error',function(e){showError(e.error||e.message);});
function showError(err){var d=document.getElementById('__hbe_error');if(!d){d=document.createElement('pre');d.id='__hbe_error';d.style.cssText='position:fixed;left:0;right:0;bottom:0;margin:0;padding:8px;background:#fee;color:#900;font:12px monospace;white-space:pre-wrap;z-index:2147483647';document.body.appendChild(d);}d.textContent=String(err&&err.stack||err);}
try{var App=load('App.jsx');App=App&&App.__esModule?App.default:(App.default||App);
window.ReactDOM.createRoot(document.getElementById('root')).render(window.React.createElement(App));}catch(e){showError(e);}
})();`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div>
<script>${inlineSafe(vendor.react)}</script><script>${inlineSafe(vendor.reactDom)}</script><script>${inlineSafe(loader)}</script></body></html>`;
}

export function buildDocument(opts: { framework: WebFramework; files: WebFile[]; vendor?: Vendor; head?: string }): string {
  const files = new Map(opts.files.map((f) => [normalise(f.path), f.content]));
  const head = opts.head ?? '';
  if (opts.framework === 'html') return buildHtml(files, head);
  if (!opts.vendor) throw new Error('React vendor scripts are required');
  return buildReact(files, opts.vendor, head);
}

/**
 * CSP for the preview iframe: no network at all; inline scripts/styles only (the document is
 * self-contained). Placed first in <head>, so later <meta> tags from student HTML can only add
 * restrictions, never remove these.
 */
export const PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";
export const previewHead = () => `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
