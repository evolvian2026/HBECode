/** Runs the pairwise comparison off the API's event loop (O(n²) in the worst case). */
import { parentPort, workerData } from 'node:worker_threads';
import { comparePairs, fingerprints, sourceOf, subtract, tokenize, type PairResult } from './winnow.js';

export interface Group {
  questionId: string;
  type: string;
  lang: string;
  starter: string;
  docs: { id: string; code: string }[];
}
export interface WorkerInput {
  groups: Group[];
  threshold: number;
  minFingerprints: number;
  k: number;
  w: number;
}

const input = workerData as WorkerInput;
try {
  const out: { questionId: string; pairs: PairResult[] }[] = [];
  for (const g of input.groups) {
    const starter = fingerprints(tokenize(sourceOf(g.starter, g.type), g.lang), input.k, input.w);
    const docs = g.docs.map((d) => ({ id: d.id, fp: subtract(fingerprints(tokenize(sourceOf(d.code, g.type), g.lang), input.k, input.w), starter) }));
    out.push({ questionId: g.questionId, pairs: comparePairs(docs, input) });
  }
  parentPort!.postMessage({ ok: true, out });
} catch (e) {
  parentPort!.postMessage({ ok: false, error: (e as Error).message });
}
