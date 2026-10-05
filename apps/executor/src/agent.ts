import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ExecJob, jobCapability, type Capability, type ExecResult } from '@hbe/shared';
import type { ExecutorConfig } from './config.js';
import { runJob } from './runner.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pull-based agent: each slot long-polls the API for a job, runs it, and posts the result.
 * The executor holds only its own bearer token — no database or Redis credentials.
 */
export class Agent {
  private stopping = false;
  private active = 0;

  constructor(
    private readonly cfg: ExecutorConfig,
    private readonly runtimes: Capability[],
    private readonly versions: Record<string, string>,
    private readonly log: (msg: string, extra?: Record<string, unknown>) => void,
  ) {}

  /** Start offering a capability that became available after startup (a DB runner came up). */
  addCapability(cap: Capability, version: string): void {
    if (this.runtimes.includes(cap)) return;
    this.runtimes.push(cap);
    this.versions[cap] = version;
  }

  start(): Promise<void[]> {
    return Promise.all(Array.from({ length: this.cfg.slots }, (_, i) => this.slot(i)));
  }

  async stop(): Promise<void> {
    this.stopping = true;
    while (this.active > 0) await sleep(100);
  }

  /**
   * Heartbeat for the container healthcheck: touched after every answered claim and finished job,
   * so a wedged agent (or one that cannot reach the API) turns unhealthy within minutes.
   */
  private beat(): void {
    void writeFile(join(this.cfg.workRoot, '.alive'), String(Date.now())).catch(() => undefined);
  }

  private headers() {
    return { authorization: `Bearer ${this.cfg.token}`, 'content-type': 'application/json' };
  }

  private async claim(): Promise<ExecJob | null> {
    const res = await fetch(`${this.cfg.apiUrl}/api/v1/internal/executor/claim`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ executorId: this.cfg.executorId, runtimes: this.runtimes, versions: this.versions }),
      signal: AbortSignal.timeout(35_000),
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`claim failed: HTTP ${res.status}`);
    return ExecJob.parse(await res.json());
  }

  private async report(result: ExecResult): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(`${this.cfg.apiUrl}/api/v1/internal/executor/jobs/${encodeURIComponent(result.jobId)}/result`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(result),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok || res.status === 409 || res.status === 404) return; // 409/404: lease lost; the job was re-dispatched
        throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        this.log('result upload failed', { jobId: result.jobId, attempt, error: (e as Error).message });
        await sleep(500 * 2 ** attempt);
      }
    }
  }

  private async slot(i: number): Promise<void> {
    let backoff = 500;
    while (!this.stopping) {
      let job: ExecJob | null = null;
      try {
        job = await this.claim();
        backoff = 500;
        this.beat();
      } catch (e) {
        this.log('claim error', { slot: i, error: (e as Error).message });
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 15_000);
        continue;
      }
      if (!job) continue;
      this.active++;
      const t0 = Date.now();
      try {
        const result = await runJob(this.cfg, job);
        await this.report(result);
        this.beat();
        this.log('job done', {
          jobId: job.jobId,
          capability: jobCapability(job),
          tests: result.tests.length,
          compileOk: result.compile.ok,
          ms: Date.now() - t0,
          internalError: result.internalError,
        });
      } finally {
        this.active--;
      }
    }
  }
}
