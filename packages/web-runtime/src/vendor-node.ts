import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Vendor } from './index.js';

/** React 18 UMD builds from node_modules (grader side). The browser loads the same files from /vendor. */
export function loadVendor(): Vendor {
  const require = createRequire(import.meta.url);
  const root = (pkg: string) => dirname(require.resolve(pkg));
  return {
    react: readFileSync(join(root('react'), 'umd', 'react.production.min.js'), 'utf8'),
    reactDom: readFileSync(join(root('react-dom'), 'umd', 'react-dom.production.min.js'), 'utf8'),
  };
}
