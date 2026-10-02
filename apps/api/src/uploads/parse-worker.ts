/**
 * Parses one uploaded file in a worker thread: a hostile or huge file can only exhaust this
 * thread's own heap (resourceLimits) or time (the caller terminates it), never block the API's
 * event loop (heartbeats, proctoring, grading results).
 */
import { parentPort, workerData } from 'node:worker_threads';
import { parseFile, type FileFormat } from '@hbe/question-format';

const { buf, format } = workerData as { buf: Uint8Array; format: FileFormat };
parseFile(Buffer.from(buf), format).then(
  (result) => parentPort!.postMessage({ ok: true, result }),
  (e: unknown) => parentPort!.postMessage({ ok: false, error: (e as Error).message ?? String(e) }),
);
