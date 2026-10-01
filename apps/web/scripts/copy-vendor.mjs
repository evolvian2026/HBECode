// React 18 UMD builds for the web-question preview, from @hbe/web-runtime's own dependencies, so
// the browser preview and the grader inline byte-identical React.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(join(root, 'node_modules', '@hbe', 'web-runtime', 'package.json'));
const dest = join(root, 'public', 'vendor');
mkdirSync(dest, { recursive: true });
for (const [pkg, file] of [['react', 'react.production.min.js'], ['react-dom', 'react-dom.production.min.js']]) {
  copyFileSync(join(dirname(require.resolve(`${pkg}/package.json`)), 'umd', file), join(dest, file));
}
console.log('react UMD copied to public/vendor');
