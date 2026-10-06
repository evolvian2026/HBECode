import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { writeChromeWrapper } from '../src/web/chrome.js';

describe('jailed Chromium wrapper', () => {
  it('binds only paths that exist on this machine (arm64 Ubuntu has no /lib64)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hbe-chrome-'));
    try {
      const script = readFileSync(await writeChromeWrapper(loadConfig({ WORK_ROOT: dir, CHROMIUM_PATH: '/opt/chromium/chrome-linux/headless_shell' })), 'utf8');
      const binds = [...script.matchAll(/'-R' '([^']+)'/g)].map((m) => m[1]!);
      expect(binds).toContain('/usr');
      // The Chromium directory itself is checked at startup (versions.ts), not here.
      for (const b of binds.filter((x) => !x.startsWith('/opt/chromium'))) expect(existsSync(b), b).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
