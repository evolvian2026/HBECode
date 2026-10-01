/**
 * Student MongoDB submissions are JSON, never JavaScript:
 *   { "collection": "orders", "pipeline": [ ... ] }
 *   { "collection": "orders", "find": { "filter": {}, "projection": {}, "sort": {}, "limit": 10 } }
 * Server-side JavaScript is disabled on the runner, and these operators are rejected before the
 * query is sent: they execute code, write to other collections, or inspect the server.
 */
const FORBIDDEN = new Set([
  '$where', '$function', '$accumulator', '$out', '$merge', '$currentOp', '$listSessions', '$listLocalSessions',
  '$planCacheStats', '$indexStats', '$collStats', '$changeStream', '$changeStreamSplitLargeEvent', '$documents',
  '$listSearchIndexes', '$queryStats', '$shardedDataDistribution', '$listSampledQueries',
]);

export interface MongoQuery {
  collection: string;
  pipeline?: Record<string, unknown>[];
  find?: { filter?: Record<string, unknown>; projection?: Record<string, unknown>; sort?: Record<string, unknown>; limit?: number; skip?: number };
}

export class MongoQueryError extends Error {}

export function parseMongoQuery(text: string): MongoQuery {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw new MongoQueryError(`Not valid JSON: ${(e as Error).message}`);
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new MongoQueryError('Expected an object like {"collection": "...", "pipeline": [...]}');
  const q = v as Record<string, unknown>;
  if (typeof q.collection !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(q.collection)) throw new MongoQueryError('"collection" must be a collection name');
  if ((q.pipeline === undefined) === (q.find === undefined)) throw new MongoQueryError('Give exactly one of "pipeline" or "find"');
  if (q.pipeline !== undefined && (!Array.isArray(q.pipeline) || q.pipeline.length > 50)) throw new MongoQueryError('"pipeline" must be an array of at most 50 stages');
  const extra = Object.keys(q).filter((k) => !['collection', 'pipeline', 'find'].includes(k));
  if (extra.length) throw new MongoQueryError(`Unknown field(s): ${extra.join(', ')}`);
  if (q.find !== undefined) {
    if (!q.find || typeof q.find !== 'object' || Array.isArray(q.find)) throw new MongoQueryError('"find" must be an object');
    const bad = Object.keys(q.find).filter((k) => !['filter', 'projection', 'sort', 'limit', 'skip'].includes(k));
    if (bad.length) throw new MongoQueryError(`Unknown find option(s): ${bad.join(', ')}`);
  }
  assertSafe(q.pipeline ?? q.find, 0);
  return q as unknown as MongoQuery;
}

function assertSafe(v: unknown, depth: number): void {
  if (depth > 40) throw new MongoQueryError('Query is nested too deeply');
  if (Array.isArray(v)) {
    for (const x of v) assertSafe(x, depth + 1);
    return;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN.has(k)) throw new MongoQueryError(`Operator ${k} is not allowed`);
      assertSafe(x, depth + 1);
    }
  }
}
