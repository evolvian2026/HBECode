import { readFile } from 'node:fs/promises';
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Phase 6 browser flows against the running stack (docker compose up + seed + executor):
 * two students answer a test with the same program (one disguised); the teacher opens the
 * institution overview and the test report, exports it, runs the similarity check and compares
 * the flagged pair side by side; a student sees their own progress.
 */
const PW = process.env.E2E_PASSWORD ?? 'demo-password-123';
const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const shots = process.env.E2E_SCREENSHOTS;
const STUDENT = 'student@demo.edu';
const STUDENT2 = 'student2@demo.edu';

const ORIGINAL = `def sum_array(a):
    total = 0
    count = 0
    for value in a:
        if value is None:
            continue
        total = total + value
        count += 1
    if count == 0:
        return 0
    result = total
    return result
`;
// Same program: renamed identifiers, different spacing and comments.
const DISGUISED = `def sum_array(a):
    # add everything up
    acc = 0
    n = 0
    for item in a:
        if item is None:
            continue
        acc = acc + item
        n += 1

    if n == 0:
        return 0
    out = acc
    return out
`;

function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function login(page: Page, email: string, password = PW) {
  await page.goto('/login/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

type Call = (method: string, path: string, data?: unknown, headers?: Record<string, string>) => Promise<unknown>;
async function apiAs(email: string, password = PW): Promise<{ ctx: APIRequestContext; call: Call }> {
  const ctx = await request.newContext({ baseURL: API, extraHTTPHeaders: { origin: WEB } });
  const csrf = ((await (await ctx.get('/api/v1/auth/csrf')).json()) as { csrfToken: string }).csrfToken;
  const call: Call = async (method, path, data, headers = {}) => {
    const r = await ctx.fetch(path, { method, data, headers: { 'x-csrf-token': csrf, ...headers } });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.status() === 204 ? null : r.json();
  };
  if (email) await call('POST', '/api/v1/auth/login', { email, password });
  return { ctx, call };
}

/** Start the attempt, submit one answer, wait for the executor's verdict, finish the attempt. */
async function answer(email: string, password: string, testId: string, questionId: string, code: string) {
  const s = await apiAs(email, password);
  const a = (await s.call('POST', `/api/v1/tests/${testId}/attempt`, {})) as { attemptId: string; token: string };
  const h = { 'x-attempt-token': a.token };
  const sub = (await s.call('POST', '/api/v1/submissions', { questionId, runtime: 'python', code, kind: 'submit', attemptId: a.attemptId }, h)) as { id: string };
  await expect.poll(async () => ((await s.call('GET', `/api/v1/submissions/${sub.id}`)) as { status: string; verdict: string | null }).verdict, { timeout: 90_000 }).toBe('AC');
  await s.call('POST', `/api/v1/attempts/${a.attemptId}/submit`, {}, h);
  await s.ctx.dispose();
}

test('teacher reviews the overview and a test report, exports it and compares a flagged pair; a student sees their progress', async ({ browser }) => {
  test.setTimeout(300_000);
  const stamp = Date.now();
  const title = `E2E report test ${stamp}`;

  // The test, assigned to both students.
  const teacher = await apiAs('teacher@demo.edu');
  let qid = '';
  await expect
    .poll(async () => {
      const r = (await teacher.call('GET', '/api/v1/questions?status=published&q=Sum%20of%20an%20Array')) as { items: { id: string }[] };
      qid = r.items[0]?.id ?? '';
      return qid;
    }, { timeout: 120_000 })
    .not.toBe('');
  const users = (await teacher.call('GET', '/api/v1/users?role=student&limit=100')) as { items: { id: string; email: string }[] };
  const s1 = users.items.find((u) => u.email === STUDENT)!;
  const s2 = users.items.find((u) => u.email === STUDENT2)!;
  const now = Date.now();
  const t = (await teacher.call('POST', '/api/v1/tests', {
    title, startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 3600_000).toISOString(), durationMin: 30,
    questions: [{ questionId: qid, points: 100 }], settings: { requireFullscreen: false, blockClipboard: false, webcam: 'off', showResults: true },
  })) as { id: string };
  await teacher.call('POST', `/api/v1/tests/${t.id}/assign`, { userIds: [s1.id, s2.id] });
  await teacher.call('POST', `/api/v1/tests/${t.id}/publish`);
  await teacher.ctx.dispose();

  await answer(STUDENT, PW, t.id, qid, ORIGINAL);
  await answer(STUDENT2, PW, t.id, qid, DISGUISED);

  // Institution overview.
  const page = await (await browser.newContext({ baseURL: WEB, acceptDownloads: true })).newPage();
  const problems = guard(page);
  await login(page, 'teacher@demo.edu');
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page).toHaveURL(/\/reports\/$/);
  await expect(page.getByTestId('chart-submits').locator('svg path').first()).toBeVisible();
  await page.getByTestId('chart-submits').locator('svg rect').last().hover();
  await expect(page.getByRole('tooltip')).toContainText('Submissions:');
  if (shots) await page.screenshot({ path: `${shots}/p6-01-overview.png`, fullPage: true });

  // Test report.
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { name: `Report · ${title}` })).toBeVisible();
  const rows = page.getByTestId('students-table').locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('100 / 100 (100%)');
  await expect(page.getByTestId('chart-distribution')).toBeVisible();

  // Export (CSV): both students, formula-safe text, UTF-8 BOM.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain(STUDENT);
  expect(csv).toContain(STUDENT2);
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Excel' }).click()]);
  expect(xlsx.suggestedFilename()).toBe('test-report.xlsx');

  // Similarity check → one flagged pair → side-by-side compare with highlighted lines.
  await page.getByRole('button', { name: 'Run similarity check' }).click();
  await expect(page.getByTestId('plag-status')).toContainText('1 pair', { timeout: 60_000 });
  const pair = page.getByTestId('plag-pairs').locator('tbody tr');
  await expect(pair).toHaveCount(1);
  await expect(pair).toContainText('Demo student 2');
  await pair.getByRole('button', { name: 'Compare' }).click();
  const compare = page.getByTestId('plag-compare');
  await expect(compare).toContainText('% similar');
  expect(await compare.locator('[data-match]').count()).toBeGreaterThan(4);
  await expect(rows.filter({ hasText: 'Demo student 2' }).locator('td').nth(6)).toHaveText(/^\d+%$/);
  if (shots) await page.screenshot({ path: `${shots}/p6-02-test-report.png`, fullPage: true });

  // Student: own progress, with the released score.
  const sp = await (await browser.newContext({ baseURL: WEB })).newPage();
  const p2 = guard(sp);
  await login(sp, STUDENT);
  await sp.getByRole('link', { name: 'My progress' }).click();
  const mine = sp.getByTestId('student-tests').locator('tr', { hasText: title });
  await expect(mine).toContainText('100 / 100');
  if (shots) await sp.screenshot({ path: `${shots}/p6-03-my-progress.png`, fullPage: true });
  // Staff-only reports are refused for a student.
  await sp.goto('/reports/');
  await expect(sp.getByRole('alert')).toBeVisible();
  expect([...problems, ...p2]).toEqual([]);
});
