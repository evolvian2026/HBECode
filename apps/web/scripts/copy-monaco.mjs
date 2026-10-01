// Self-host Monaco (no CDN) so the CSP can stay script-src 'self'.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = join(root, 'node_modules', 'monaco-editor');
const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
const dest = join(root, 'public', 'monaco');
const stamp = join(dest, '.version');
if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) process.exit(0);
rmSync(dest, { recursive: true, force: true });
cpSync(join(pkg, 'min', 'vs'), join(dest, 'vs'), { recursive: true });
writeFileSync(stamp, version);
console.log(`monaco ${version} copied to public/monaco`);
