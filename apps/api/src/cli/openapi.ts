import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from '../openapi.js';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
console.log(`wrote ${out}`);
