/**
 * Phase 5: templates, bulk upload (preview → confirm → import → validate/publish), error
 * reports, exports, and the export → import round trip through the API.
 */
import { readWorkbook, recordsToXlsx, toRecords, ZIP_LIMITS } from '@hbe/question-format';
import { QuestionInput } from '@hbe/shared';
import type { CodingJob } from '@hbe/shared';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sumArray } from '../../../packages/db/src/seed/questions/sum-array.js';
import { enrollMfa, PASSWORD, seedOrg, systemQuery, type Org } from './fixtures.js';
import { Client, executor, startApp, type TestApp } from './harness.js';

let t: TestApp;
let org: Org;
const c: Record<'teacherA' | 'teacherB' | 'associateA' | 'studentA' | 'adminA' | 'root', Client> = {} as never;
let templateXlsx: Buffer;
const imported: string[] = [];

type Job = { status: string; counts: Record<string, number>; error: string | null; issues: { message: string }[]; rows: { key: string; status: string; action: string; errors: { loc: string; field?: string; message: string }[]; warnings: { message: string }[]; questionId: string | null; questionStatus: string | null; message: string | null }[] };

async function upload(cl: Client, file: Buffer, format: 'xlsx' | 'docx' | 'json', filename = `q.${format}`) {
  return cl.req('POST', `/api/v1/uploads?format=${format}&filename=${filename}`, file, { 'content-type': 'application/octet-stream' });
}
async function waitJob(cl: Client, id: string, until: (j: Job) => boolean = (j) => !['queued', 'parsing', 'importing'].includes(j.status)): Promise<Job> {
  for (let i = 0; i < 300; i++) {
    const j = (await cl.get(`/api/v1/uploads/${id}`)).json() as Job;
    if (until(j)) return j;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('upload did not finish');
}
async function uploadAndParse(cl: Client, file: Buffer, format: 'xlsx' | 'docx' | 'json') {
  const r = await upload(cl, file, format);
  expect(r.statusCode, r.body).toBe(202);
  const id = r.json().id as string;
  return { id, job: await waitJob(cl, id) };
}
const download = async (cl: Client, url: string) => {
  const r = await cl.get(url);
  expect(r.statusCode, r.body.slice(0, 200)).toBe(200);
  return r.rawPayload;
};
/** Fake executor: every test of every claimed job passes. */
async function drainExecutor(max = 50) {
  for (let i = 0; i < max; i++) {
    const r = await executor(t).claim();
    if (r.statusCode !== 200 || !r.body) return;
    const job = r.json() as CodingJob;
    await executor(t).result({ jobId: job.jobId, compile: { ok: true, output: '', wallMs: 1 }, tests: job.tests.map((x) => ({ id: x.id, verdict: 'AC', cpuMs: 1, wallMs: 1, memKb: 1, stdout: '', stderr: '' })) });
  }
}

beforeAll(async () => {
  t = await startApp({ UPLOAD_MAX_BYTES: String(12 * 1024 * 1024) });
  org = await seedOrg(t);
  const login = async (email: string) => {
    const cl = new Client(t);
    await cl.login(email, PASSWORD);
    return cl;
  };
  c.teacherA = await login(org.users.teacherA.email);
  c.teacherB = await login(org.users.teacherB.email);
  c.associateA = await login(org.users.associateA.email);
  c.studentA = await login(org.users.studentA.email);
  c.adminA = await login(org.users.clientAdminA.email);
  await enrollMfa(c.adminA);
  c.root = await login(org.users.admin.email);
  await enrollMfa(c.root);
});
afterAll(async () => {
  await t?.close();
});

describe('templates', () => {
  it('only question authors download templates', async () => {
    for (const who of ['studentA', 'associateA', 'adminA'] as const) expect((await c[who].get('/api/v1/uploads/templates/xlsx')).statusCode).toBe(403);
    const r = await c.teacherA.get('/api/v1/uploads/templates/xlsx');
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.headers['content-disposition']).toContain('attachment');
    templateXlsx = r.rawPayload;
    const sheets = (await readWorkbook(templateXlsx)).map((s) => s.name);
    expect(sheets).toEqual(['Instructions', 'Questions', 'Coding tests', 'Web checks', 'DB datasets', 'Code', 'Web files']);
    expect((await c.teacherA.get('/api/v1/uploads/templates/docx')).headers['content-type']).toContain('wordprocessingml');
  });
});

describe('upload → preview → import', () => {
  let jobId: string;
  it('the unchanged template parses into 3 ready example questions (coding, web, db)', async () => {
    const { id, job } = await uploadAndParse(c.teacherA, templateXlsx, 'xlsx');
    jobId = id;
    expect(job.status).toBe('parsed');
    expect(job.rows.map((r) => [r.key, r.status, r.action])).toEqual([['Q1', 'ready', 'create'], ['Q2', 'ready', 'create'], ['Q3', 'ready', 'create']]);
    expect(job.counts).toMatchObject({ total: 3, ready: 3, invalid: 0, duplicate: 0 });
    // Nothing is created before confirmation.
    expect((await c.teacherA.get('/api/v1/questions')).json().items).toHaveLength(0);
  });
  it('other tenants, associates and students cannot see, confirm or discard it', async () => {
    for (const [m, url] of [['GET', `/api/v1/uploads/${jobId}`], ['GET', `/api/v1/uploads/${jobId}/report`], ['POST', `/api/v1/uploads/${jobId}/confirm`], ['DELETE', `/api/v1/uploads/${jobId}`]] as const) {
      expect((await c.teacherB.req(m, url, m === 'GET' ? undefined : {})).statusCode).toBe(404);
      expect((await c.associateA.req(m, url, m === 'GET' ? undefined : {})).statusCode).toBe(403);
    }
    expect((await c.teacherB.get('/api/v1/uploads')).json()).toEqual([]);
  });
  it('confirming imports the questions as drafts under the author’s tenant', async () => {
    expect((await c.teacherA.post(`/api/v1/uploads/${jobId}/confirm`, { publish: false })).statusCode).toBe(202);
    const job = await waitJob(c.teacherA, jobId);
    expect(job.status).toBe('done');
    expect(job.counts).toMatchObject({ imported: 3, failed: 0 });
    for (const r of job.rows) {
      expect(r).toMatchObject({ status: 'imported', questionStatus: 'draft' });
      imported.push(r.questionId!);
    }
    expect((await c.teacherA.post(`/api/v1/uploads/${jobId}/confirm`, { publish: false })).statusCode).toBe(409);
    const stored = await systemQuery<{ n: number }>(t, `SELECT count(*)::int AS n FROM hbe.upload_rows WHERE job_id = $1 AND payload IS NOT NULL`, [jobId]);
    expect(stored[0]!.n).toBe(0); // hidden data is not kept after import
  });
  it('uploading the same questions again marks them as duplicates', async () => {
    const { job } = await uploadAndParse(c.teacherA, templateXlsx, 'xlsx');
    expect(job.rows.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate']);
    expect((await c.teacherA.post(`/api/v1/uploads/${(await c.teacherA.get('/api/v1/uploads')).json()[0].id}/confirm`, {})).statusCode).toBe(400);
  });
  it('with publish, imported questions go through sandbox validation and publish', async () => {
    const q = { ...sumArray, title: 'Uploaded and published', hidden: sumArray.hidden.slice(0, 10) };
    const { id } = await uploadAndParse(c.teacherA, Buffer.from(JSON.stringify([q])), 'json');
    await c.teacherA.post(`/api/v1/uploads/${id}/confirm`, { publish: true });
    await waitJob(c.teacherA, id);
    await drainExecutor();
    const job = await waitJob(c.teacherA, id, (j) => j.rows[0]?.questionStatus === 'published');
    expect(job.rows[0]).toMatchObject({ status: 'imported', questionStatus: 'published' });
  });
});

describe('problems are reported per row, with a downloadable report', () => {
  it('bad rows are listed with sheet, row and column; good rows can still be imported', async () => {
    const rec = toRecords([{ question: QuestionInput.parse({ ...sumArray, title: 'Good one', hidden: sumArray.hidden.slice(0, 10) }) }, { question: QuestionInput.parse({ ...sumArray, title: 'Broken one', hidden: sumArray.hidden.slice(0, 10) }) }], true);
    rec.Questions[1]!.cells.difficulty = 'very hard';
    rec['Coding tests'].find((r) => r.cells.key === 'Q2' && r.cells.kind === 'hidden')!.cells.weight = 'heavy';
    const { id, job } = await uploadAndParse(c.teacherA, await recordsToXlsx(rec), 'xlsx');
    expect(job.rows.map((r) => r.status)).toEqual(['ready', 'invalid']);
    expect(job.rows[1]!.errors).toContainEqual(expect.objectContaining({ field: 'weight', message: '"heavy" is not a number' }));
    expect(job.rows[1]!.errors[0]!.loc).toMatch(/^Coding tests, row \d+$/);
    const report = await readWorkbook(await download(c.teacherA, `/api/v1/uploads/${id}/report`));
    const lines = report[0]!.rows.map((r) => r.cells.join(' | '));
    expect(lines[0]).toBe('severity | question key | title | where | column | problem');
    expect(lines.some((l) => l.startsWith('error | Q2 | Broken one | Coding tests, row') && l.includes('weight | "heavy" is not a number'))).toBe(true);
    await c.teacherA.post(`/api/v1/uploads/${id}/confirm`, {});
    const done = await waitJob(c.teacherA, id);
    expect(done.rows.map((r) => r.status)).toEqual(['imported', 'invalid']);
  });
  it('rejects wrong file types, oversize files, damaged files and zip bombs', async () => {
    expect((await upload(c.teacherA, Buffer.from('{"not":"a zip"}'), 'xlsx')).statusCode).toBe(400);
    expect((await upload(c.teacherA, Buffer.from('PK\u0003\u0004 not json'), 'json')).statusCode).toBe(400);
    expect((await upload(c.teacherA, Buffer.alloc(12 * 1024 * 1024 + 1, 0x50), 'xlsx')).statusCode).toBe(413);
    const damaged = await uploadAndParse(c.teacherA, Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(100, 7)]), 'xlsx');
    expect(damaged.job).toMatchObject({ status: 'failed' });
    expect(damaged.job.error).toMatch(/damaged file/);
    const bomb = new JSZip();
    bomb.file('xl/workbook.xml', '<workbook/>');
    bomb.file('xl/worksheets/sheet1.xml', Buffer.alloc(ZIP_LIMITS.maxEntry + 1024, 0x20));
    const b = await uploadAndParse(c.teacherA, await bomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), 'xlsx');
    expect(b.job.status).toBe('failed');
    expect(b.job.error).toMatch(/larger than 64 MB when unpacked/);
    expect((await upload(c.studentA, templateXlsx, 'xlsx')).statusCode).toBe(403);
  }, 60_000);
});

describe('export', () => {
  it('only authors export, only questions they can edit, and it is audited', async () => {
    const ids = imported.join(',');
    expect((await c.associateA.get(`/api/v1/exports/questions?format=json&ids=${ids}`)).statusCode).toBe(403);
    expect((await c.studentA.get(`/api/v1/exports/questions?format=json&ids=${ids}`)).statusCode).toBe(403);
    expect((await c.teacherB.get(`/api/v1/exports/questions?format=json&ids=${ids}`)).statusCode).toBe(404);
    // A global question (super admin) is readable by teachers but cannot be exported with its solutions.
    const g = await c.root.post('/api/v1/questions', { ...sumArray, title: 'Global probe', hidden: sumArray.hidden.slice(0, 10), global: true });
    expect(g.statusCode).toBe(201);
    const r = await c.teacherA.get(`/api/v1/exports/questions?format=json&ids=${g.json().id}`);
    expect([r.statusCode, r.json().detail]).toEqual([403, expect.stringMatching(/only questions you can edit/)]);
    const ok = await c.teacherA.get(`/api/v1/exports/questions?format=json&ids=${ids}`);
    expect(ok.json().questions).toHaveLength(3);
    const audit = await systemQuery<{ n: number }>(t, `SELECT count(*)::int AS n FROM hbe.audit_logs WHERE action = 'question.export'`);
    expect(audit[0]!.n).toBeGreaterThanOrEqual(1);
  });

  it.each(['xlsx', 'docx', 'json'] as const)('export (%s) → import into another institution is lossless', async (format) => {
    const file = await download(c.teacherA, `/api/v1/exports/questions?format=${format}&ids=${imported.join(',')}`);
    // Institution B has the same questions only from its earlier rounds; make titles unique per format.
    const { id, job } = await uploadAndParse(c.teacherB, file, format);
    const fresh = job.rows.filter((r) => r.status === 'ready');
    if (format === 'xlsx') {
      expect(fresh).toHaveLength(3);
      expect(job.rows.every((r) => r.warnings.some((w) => /not a question you can edit here/.test(w.message)))).toBe(true);
      await c.teacherB.post(`/api/v1/uploads/${id}/confirm`, {});
      const done = await waitJob(c.teacherB, id);
      for (let i = 0; i < 3; i++) {
        const a = (await c.teacherA.get(`/api/v1/questions/${imported[i]}`)).json().question;
        const b = (await c.teacherB.get(`/api/v1/questions/${done.rows[i]!.questionId}`)).json().question;
        expect(b).toEqual(a);
      }
    } else {
      // Already imported into B by the xlsx round: same content → duplicates, which proves the parse matched.
      expect(job.rows.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate']);
    }
  });

  it('re-importing an exported file with an id updates that question', async () => {
    const file = (await c.teacherA.get(`/api/v1/exports/questions?format=json&ids=${imported[0]}`)).json();
    file.questions[0].title = 'Renamed through a re-import';
    const { id, job } = await uploadAndParse(c.teacherA, Buffer.from(JSON.stringify(file)), 'json');
    expect(job.rows[0]).toMatchObject({ status: 'ready', action: 'update' });
    await c.teacherA.post(`/api/v1/uploads/${id}/confirm`, {});
    await waitJob(c.teacherA, id);
    expect((await c.teacherA.get(`/api/v1/questions/${imported[0]}`)).json().question.title).toBe('Renamed through a re-import');
  });
});

describe('audit', () => {
  it('records uploads, confirmations and imports', async () => {
    const actions = (await systemQuery<{ action: string }>(t, 'SELECT DISTINCT action FROM hbe.audit_logs')).map((r) => r.action);
    for (const a of ['upload.create', 'upload.confirm', 'upload.import', 'question.export', 'question.create', 'question.update']) expect(actions).toContain(a);
  });
});
