import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The full seed bank (`@hbe/db/seed`) generates 170 questions at import time (~9 CPU-seconds).
 * Only the seed CLI may import it; anything on the server's import graph made the API take
 * 3.5 minutes to start on a 0.1-CPU instance (Phase 8 load test).
 */
describe('startup cost', () => {
  it('no server module imports the full seed bank', () => {
    const src = fileURLToPath(new URL('../src', import.meta.url));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.includes(`${join(src, 'cli')}`) && /from '@hbe\/db\/seed'/.test(readFileSync(p, 'utf8'))) offenders.push(p);
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
