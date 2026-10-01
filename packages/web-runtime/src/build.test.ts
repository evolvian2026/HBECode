import { describe, expect, it } from 'vitest';
import { BuildError, buildDocument, previewHead } from './index.js';
import { loadVendor } from './vendor-node.js';

const vendor = loadVendor();

describe('buildDocument', () => {
  it('inlines local CSS and JS into index.html and puts the CSP first in <head>', () => {
    const html = buildDocument({
      framework: 'html',
      head: previewHead(),
      files: [
        { path: 'index.html', content: '<!doctype html><html><head><title>t</title><link rel="stylesheet" href="styles.css"></head><body><script src="./app.js"></script></body></html>' },
        { path: 'styles.css', content: 'h1{color:red}' },
        { path: 'app.js', content: 'console.log("</script>")' },
      ],
    });
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<title>'));
    expect(html).toContain('<style data-file="styles.css">h1{color:red}</style>');
    expect(html).toContain('console.log("<\\/script>")');
    expect(html).not.toContain('src="./app.js"');
  });
  it('bundles React modules with imports and CSS', () => {
    const html = buildDocument({
      framework: 'react',
      vendor,
      files: [
        { path: 'App.jsx', content: "import { useState } from 'react';\nimport Button from './Button';\nimport './App.css';\nexport default function App(){ const [n,setN]=useState(0); return <Button onClick={()=>setN(n+1)}>{n}</Button>; }" },
        { path: 'Button.jsx', content: 'export default function Button(p){ return <button {...p} />; }' },
        { path: 'App.css', content: 'button{color:blue}' },
      ],
    });
    expect(html).toContain('"Button.jsx":function(module,exports,require)');
    expect(html).toContain('React.createElement');
    expect(html).toContain('createRoot');
  });
  it('reports JSX syntax errors with the file name', () => {
    expect(() => buildDocument({ framework: 'react', vendor, files: [{ path: 'App.jsx', content: 'export default () => <div>' }] })).toThrow(BuildError);
  });
});
