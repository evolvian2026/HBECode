import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RUNTIME_IDS, type RuntimeId } from '@hbe/shared';
import { RUNTIME_SPECS } from './runtimes.js';

const run = promisify(execFile);

/**
 * Check that each installed toolchain reports the pinned version. A runtime whose version
 * drifted (or is missing) is not offered to the API, so students never see a version label
 * that differs from what actually runs their code.
 */
export async function detectRuntimes(): Promise<{ available: RuntimeId[]; versions: Record<string, string>; problems: string[] }> {
  const available: RuntimeId[] = [];
  const versions: Record<string, string> = {};
  const problems: string[] = [];
  for (const id of RUNTIME_IDS) {
    const spec = RUNTIME_SPECS[id];
    try {
      const { stdout, stderr } = await run(spec.versionCmd[0]!, spec.versionCmd.slice(1), { timeout: 15_000 });
      const text = `${stdout}\n${stderr}`;
      const line = text.split('\n').find((l) => spec.versionPattern.test(l));
      if (line) {
        available.push(id);
        versions[id] = line.trim();
      } else {
        problems.push(`${id}: version mismatch (${text.split('\n')[0]?.trim()})`);
      }
    } catch (e) {
      problems.push(`${id}: not installed (${(e as Error).message.split('\n')[0]})`);
    }
  }
  return { available, versions, problems };
}
