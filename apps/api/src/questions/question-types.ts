/**
 * Mapping between each question type's input shape and the shared storage tables. Hidden data
 * always lands in RLS-protected places: hidden checks/datasets in `test_cases` (staff only),
 * reference files/queries/solutions in `language_secrets` (authors only).
 */
import type { languageSecrets, languageStubs, questionVersions, testCases } from '@hbe/db';
import {
  DB_DIALECTS,
  DbCompare,
  RUNTIMES,
  WebFiles,
  type CodingQuestionInput,
  type DbDataset,
  type DbDialect,
  type DbQuestionInput,
  type QuestionInput,
  type ResultSet,
  type RuntimeId,
  type WebCheck,
  type WebQuestionInput,
} from '@hbe/shared';

type VersionRow = typeof questionVersions.$inferSelect;
type TestRow = typeof testCases.$inferSelect;
type StubRow = typeof languageStubs.$inferSelect;
type SecretRow = typeof languageSecrets.$inferSelect;

export type NewTest = Omit<typeof testCases.$inferInsert, 'versionId'>;
export interface Template {
  runtime: string;
  stub: string;
  driver: string;
  solution: string;
}

export interface StorageRows {
  version: Pick<VersionRow, 'title' | 'statement' | 'constraints' | 'inputFormat' | 'outputFormat' | 'difficulty' | 'tags' | 'timeComplexity' | 'spaceComplexity' | 'baseTimeLimitMs' | 'memoryLimitMb' | 'compare' | 'spec'> & { validation: null };
  tests: NewTest[];
  templates: Template[];
}

const EXACT = { mode: 'exact' as const };

export function toStorage(q: QuestionInput): StorageRows {
  if (q.type === 'web') {
    return {
      version: {
        title: q.title, statement: q.statement, constraints: '', inputFormat: '', outputFormat: '', difficulty: q.difficulty, tags: q.tags,
        timeComplexity: '', spaceComplexity: '', baseTimeLimitMs: q.checkTimeoutMs, memoryLimitMb: 256, compare: EXACT,
        spec: { type: 'web', framework: q.framework }, validation: null,
      },
      tests: [
        ...q.samples.map((c, i) => webTest(c, 'sample', i)),
        ...q.hidden.map((c, i) => webTest(c, 'hidden', i)),
      ],
      templates: [{ runtime: q.framework, stub: JSON.stringify(q.starterFiles), driver: '', solution: JSON.stringify(q.referenceFiles) }],
    };
  }
  if (q.type === 'db') {
    return {
      version: {
        title: q.title, statement: q.statement, constraints: '', inputFormat: '', outputFormat: '', difficulty: q.difficulty, tags: q.tags,
        timeComplexity: '', spaceComplexity: '', baseTimeLimitMs: q.timeLimitMs, memoryLimitMb: 256, compare: EXACT,
        spec: { type: 'db', dialects: q.dialects, mode: q.mode, schemaDisplay: q.schemaDisplay, stateQuery: q.stateQuery ?? null, compare: q.compare },
        validation: null,
      },
      tests: [
        ...q.samples.map((d, i) => dbTest(d, 'sample', i)),
        ...q.hidden.map((d, i) => dbTest(d, 'hidden', i)),
      ],
      templates: q.dialects.map((d) => ({ runtime: d, stub: q.starters[d] ?? defaultStarter(d), driver: '', solution: q.solutions[d] ?? '' })),
    };
  }
  return {
    version: {
      title: q.title, statement: q.statement, constraints: q.constraints, inputFormat: q.inputFormat, outputFormat: q.outputFormat,
      difficulty: q.difficulty, tags: q.tags, timeComplexity: q.timeComplexity, spaceComplexity: q.spaceComplexity,
      baseTimeLimitMs: q.baseTimeLimitMs, memoryLimitMb: q.memoryLimitMb, compare: q.compare, spec: { type: 'coding' }, validation: null,
    },
    tests: [
      ...q.samples.map((s, i) => ({ visibility: 'sample' as const, ordinal: i + 1, input: s.input, expected: s.output, explanation: s.explanation, weight: 0 })),
      ...q.hidden.map((h, i) => ({ visibility: 'hidden' as const, ordinal: i + 1, input: h.input, expected: h.output, weight: h.weight, isStress: h.isStress })),
    ],
    templates: (Object.entries(q.templates) as [RuntimeId, { stub: string; driver: string; solution: string }][]).map(([runtime, t]) => ({ runtime, ...t })),
  };
}

function webTest(c: WebCheck, visibility: 'sample' | 'hidden', i: number): NewTest {
  return { visibility, ordinal: i + 1, input: '', expected: '', explanation: '', weight: c.weight, spec: { title: c.title, viewport: c.viewport ?? null, check: c.spec } };
}
function dbTest(d: DbDataset, visibility: 'sample' | 'hidden', i: number): NewTest {
  // `expected` holds { dialect: ResultSet } once validation has run the reference solutions.
  return { visibility, ordinal: i + 1, input: '', expected: '{}', explanation: d.explanation, weight: d.weight, spec: { setup: d.setup } };
}

export function defaultStarter(d: DbDialect): string {
  if (d === 'mongodb') return '{\n  "collection": "",\n  "pipeline": []\n}\n';
  if (d === 'pandas') return 'import pandas as pd\n\ndef solve() -> pd.DataFrame:\n    ...\n';
  return '-- Write your query here\n';
}

export function questionType(v: Pick<VersionRow, 'spec'>): 'coding' | 'web' | 'db' {
  const t = (v.spec as { type?: string }).type;
  return t === 'web' || t === 'db' ? t : 'coding';
}

export interface DbSpec {
  dialects: DbDialect[];
  mode: 'query' | 'dml';
  schemaDisplay: string;
  stateQuery: DbQuestionInput['stateQuery'] | null;
  compare: DbCompare;
}
export const dbSpec = (v: Pick<VersionRow, 'spec'>) => v.spec as unknown as DbSpec;
export const webSpec = (v: Pick<VersionRow, 'spec'>) => v.spec as unknown as { framework: 'html' | 'react' };
export const webCheckOf = (t: Pick<TestRow, 'spec'>) => t.spec as unknown as { title: string; viewport: WebCheck['viewport'] | null; check: WebCheck['spec'] };
export const datasetOf = (t: Pick<TestRow, 'spec'>) => t.spec as unknown as { setup: DbDataset['setup'] };
export function expectedOf(t: Pick<TestRow, 'expected'>): Partial<Record<DbDialect, ResultSet>> {
  try {
    return JSON.parse(t.expected || '{}') as Partial<Record<DbDialect, ResultSet>>;
  } catch {
    return {};
  }
}

/** Rebuild the authoring input from storage (drivers/solutions only when the caller may see them). */
export function fromStorage(v: VersionRow, isPractice: boolean, tests: TestRow[], stubs: StubRow[], secrets: SecretRow[], canWrite: boolean): QuestionInput {
  const samples = tests.filter((t) => t.visibility === 'sample');
  const hidden = tests.filter((t) => t.visibility === 'hidden');
  const type = questionType(v);
  if (type === 'web') {
    const fw = webSpec(v).framework;
    const stub = stubs.find((s) => s.runtime === fw);
    const sec = secrets.find((s) => s.runtime === fw);
    const parseFiles = (s: string | undefined) => {
      const r = WebFiles.safeParse(JSON.parse(s || '[]'));
      return r.success ? r.data : [];
    };
    const toCheck = (t: TestRow): WebCheck => {
      const c = webCheckOf(t);
      return { title: c.title, weight: t.weight, viewport: c.viewport ?? undefined, spec: c.check };
    };
    const q: WebQuestionInput = {
      type: 'web', framework: fw, title: v.title, statement: v.statement, difficulty: v.difficulty, tags: v.tags, isPractice,
      starterFiles: parseFiles(stub?.stub), referenceFiles: canWrite ? parseFiles(sec?.solution) : [],
      samples: samples.map(toCheck), hidden: hidden.map(toCheck), checkTimeoutMs: v.baseTimeLimitMs,
    };
    return q;
  }
  if (type === 'db') {
    const s = dbSpec(v);
    const toDs = (t: TestRow): DbDataset => ({ setup: datasetOf(t).setup, explanation: t.explanation, weight: t.weight });
    const q: DbQuestionInput = {
      type: 'db', title: v.title, statement: v.statement, difficulty: v.difficulty, tags: v.tags, isPractice,
      dialects: s.dialects, mode: s.mode, schemaDisplay: s.schemaDisplay, stateQuery: s.stateQuery ?? undefined,
      compare: DbCompare.parse(s.compare ?? {}),
      samples: samples.map(toDs), hidden: hidden.map(toDs),
      starters: Object.fromEntries(stubs.map((x) => [x.runtime, x.stub])),
      solutions: canWrite ? Object.fromEntries(secrets.map((x) => [x.runtime, x.solution])) : {},
      timeLimitMs: v.baseTimeLimitMs,
    };
    return q;
  }
  const templates = Object.fromEntries(
    stubs.map((st) => {
      const sec = secrets.find((x) => x.runtime === st.runtime);
      return [st.runtime, canWrite ? { stub: st.stub, driver: sec?.driver ?? '', solution: sec?.solution ?? '' } : { stub: st.stub }];
    }),
  ) as CodingQuestionInput['templates'];
  const q: CodingQuestionInput = {
    type: 'coding', title: v.title, statement: v.statement, constraints: v.constraints, inputFormat: v.inputFormat, outputFormat: v.outputFormat,
    difficulty: v.difficulty, tags: v.tags, timeComplexity: v.timeComplexity, spaceComplexity: v.spaceComplexity,
    baseTimeLimitMs: v.baseTimeLimitMs, memoryLimitMb: v.memoryLimitMb, compare: v.compare, isPractice,
    samples: samples.map((t) => ({ input: t.input, output: t.expected, explanation: t.explanation })),
    hidden: hidden.map((t) => ({ input: t.input, output: t.expected, weight: t.weight, isStress: t.isStress })),
    templates,
  };
  return q;
}

/** What validation runs: every reference solution, plus (web) the starter files. */
export function validationTargets(q: QuestionInput): { runtime: string; role: 'reference' | 'starter'; code: string; key: string }[] {
  if (q.type === 'web') {
    return [
      { runtime: q.framework, role: 'reference', code: JSON.stringify(q.referenceFiles), key: q.framework },
      { runtime: q.framework, role: 'starter', code: JSON.stringify(q.starterFiles), key: `${q.framework}:starter` },
    ];
  }
  if (q.type === 'db') return q.dialects.map((d) => ({ runtime: d, role: 'reference' as const, code: q.solutions[d] ?? '', key: d }));
  return (Object.keys(q.templates) as RuntimeId[]).map((rt) => ({ runtime: rt, role: 'reference' as const, code: q.templates[rt]!.solution, key: rt }));
}

/** Time limit per test for a runtime (coding multipliers; web/DB use the question's own limit). */
export function limitFor(v: Pick<VersionRow, 'baseTimeLimitMs' | 'spec'>, runtime: string): number {
  if (questionType(v) === 'coding' && runtime in RUNTIMES) return Math.round(v.baseTimeLimitMs * RUNTIMES[runtime as RuntimeId].timeMultiplier);
  return v.baseTimeLimitMs;
}

export const isDialect = (s: string): s is DbDialect => (DB_DIALECTS as readonly string[]).includes(s);
