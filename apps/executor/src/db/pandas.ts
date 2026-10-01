import { chown, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResultSet } from '@hbe/shared';
import type { ExecutorConfig } from '../config.js';
import { runInJail } from '../jail.js';
import { RUNTIME_SPECS } from '../runtimes.js';

/**
 * Pandas runs in the normal Python jail. The harness (not student-controlled) loads each dataset's
 * CSV tables into DataFrames, calls `solve(...)` with them by parameter name, and prints one JSON
 * line per dataset. The student's own prints are captured separately. All datasets run in one
 * process because importing pandas costs ~0.5 s; the CPU budget accounts for that.
 */
const HARNESS = String.raw`

# ---- harness ---------------------------------------------------------------
import sys as _sys, io as _io, json as _json, math as _math, inspect as _inspect, time as _time
import pandas as _pd

def _cell(v):
    if v is None:
        return None
    try:
        if _pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, 'item'):
        v = v.item()
    if isinstance(v, float) and (_math.isinf(v) or _math.isnan(v)):
        return None
    if isinstance(v, (int, float, bool, str)):
        return v
    if hasattr(v, 'isoformat'):
        return v.isoformat()
    return str(v)

def _to_result(r):
    if isinstance(r, _pd.Series):
        r = r.to_frame()
    if not isinstance(r, _pd.DataFrame):
        raise TypeError('solve() must return a pandas DataFrame or Series, got ' + type(r).__name__)
    r = r.reset_index(drop=not (r.index.name or any(r.index.names[:1]) ))
    cols = [str(c) for c in r.columns]
    return {'columns': cols, 'rows': [[_cell(v) for v in row] for row in r.itertuples(index=False, name=None)], 'truncated': len(r) > 1000}

def _main():
    datasets = _json.loads(_sys.stdin.read())
    params = list(_inspect.signature(solve).parameters)
    real_out = _sys.stdout
    for ds in datasets:
        t0 = _time.process_time()
        captured = _io.StringIO()
        try:
            tables = {name: _pd.read_csv(_io.StringIO(csv)) for name, csv in ds.items()}
            missing = [p for p in params if p not in tables]
            if missing:
                raise TypeError('solve() parameter(s) %s do not match the tables %s' % (missing, sorted(tables)))
            _sys.stdout = captured
            try:
                res = solve(**{p: tables[p].copy() for p in params})
            finally:
                _sys.stdout = real_out
            out = _to_result(res)
            out['rows'] = out['rows'][:1000]
            line = {'ok': True, 'result': out}
        except Exception as e:
            _sys.stdout = real_out
            line = {'ok': False, 'error': '%s: %s' % (type(e).__name__, e)}
        line['stdout'] = captured.getvalue()[:4000]
        line['cpuMs'] = int((_time.process_time() - t0) * 1000)
        real_out.write('\n@@HBE_RESULT@@' + _json.dumps(line) + '\n')
        real_out.flush()

_main()
`;

export interface PandasOutcome {
  ok: boolean;
  result?: ResultSet;
  error?: string;
  stdout: string;
  cpuMs: number;
  timedOut?: boolean;
}

export async function runPandas(cfg: ExecutorConfig, code: string, datasets: Record<string, string>[], perDatasetMs: number): Promise<{ outcomes: PandasOutcome[]; compileError?: string; internal?: string; wallMs: number }> {
  const spec = RUNTIME_SPECS.python;
  await mkdir(cfg.workRoot, { recursive: true });
  const dir = await mkdtemp(join(cfg.workRoot, 'pandas-'));
  try {
    await writeFile(join(dir, 'main.py'), `${code.replace(/\r\n?/g, '\n')}\n${HARNESS}`, { mode: 0o644 });
    await chown(dir, 65534, 65534);
    const cpuMs = 3000 + perDatasetMs * datasets.length;
    const r = await runInJail(cfg, {
      argv: ['/usr/bin/python3', '-B', 'main.py'],
      env: { ...spec.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1', MPLBACKEND: 'Agg' },
      workdir: dir,
      writableBox: false,
      stdin: JSON.stringify(datasets),
      cpuMs,
      wallMs: cpuMs * 2 + 2000,
      memMb: 768,
      pids: 32,
      tmpfsMb: 64,
      fileSizeMb: 16,
      stdoutLimit: 16 * 1024 * 1024,
      stderrLimit: 16 * 1024,
      extraMounts: [],
      cpuMsPerSec: 1000,
    });
    if (!r.stats) return { outcomes: [], internal: r.jailError ?? 'pandas jail failed', wallMs: r.wallMs };
    const lines = r.stdout.split('\n').filter((l) => l.startsWith('@@HBE_RESULT@@')).map((l) => JSON.parse(l.slice(14)) as PandasOutcome);
    if (lines.length === 0 && /SyntaxError|IndentationError/.test(r.stderr)) {
      return { outcomes: [], compileError: r.stderr.replace(/\/box\/main\.py/g, 'solution.py').slice(0, 4000), wallMs: r.wallMs };
    }
    const timedOut = r.stats.wallTimeout || r.stats.signal === 24;
    const outcomes = datasets.map((_, i) => lines[i] ?? { ok: false, error: timedOut ? 'time limit exceeded' : (r.stderr.split('\n').filter(Boolean).pop() ?? 'crashed'), stdout: '', cpuMs: 0, timedOut });
    for (const o of outcomes) if (o.cpuMs > perDatasetMs) Object.assign(o, { ok: false, timedOut: true, error: 'time limit exceeded' });
    return { outcomes, wallMs: r.wallMs };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
