import { expect, request, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/**
 * Phase 4 browser flows against the running stack (docker compose up + seed):
 *  1. a student takes a test; a second device is blocked until a proctor approves it on the
 *     live monitor; the first device is then locked out; the answer is graded by the real executor;
 *  2. start → violate → auto-submit (exit criterion), seen by the student and the proctor.
 */
const PW = process.env.E2E_PASSWORD ?? 'demo-password-123';
const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const shots = process.env.E2E_SCREENSHOTS;
const STUDENT = 'student@demo.edu';

function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.location().url.includes('/preview/frame.html')) return;
    if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => void d.accept());
  return problems;
}

async function login(page: Page, email: string) {
  await page.goto('/login/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  // Let the post-login redirect from / finish, or the next goto is interrupted by it.
  await page.waitForURL((u) => !/^\/(login\/?)?$/.test(u.pathname));
}

/** API session for test setup (CSRF double-submit + Origin, like the browser). */
async function apiAs(email: string): Promise<{ ctx: APIRequestContext; call: (method: string, path: string, data?: unknown) => Promise<unknown> }> {
  const ctx = await request.newContext({ baseURL: API, extraHTTPHeaders: { origin: WEB } });
  const csrf = ((await (await ctx.get('/api/v1/auth/csrf')).json()) as { csrfToken: string }).csrfToken;
  const call = async (method: string, path: string, data?: unknown) => {
    const r = await ctx.fetch(path, { method, data, headers: { 'x-csrf-token': csrf } });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.status() === 204 ? null : r.json();
  };
  await call('POST', '/api/v1/auth/login', { email, password: PW });
  return { ctx, call };
}

/** Wait until the seed question is published, then create + assign + publish a test. */
async function createTest(settings: Record<string, unknown>, title: string): Promise<string> {
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
  const student = users.items.find((u) => u.email === STUDENT)!;
  const now = Date.now();
  const t = (await teacher.call('POST', '/api/v1/tests', {
    title, startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 3600_000).toISOString(), durationMin: 30,
    questions: [{ questionId: qid, points: 100 }], settings,
  })) as { id: string };
  await teacher.call('POST', `/api/v1/tests/${t.id}/assign`, { userIds: [student.id] });
  await teacher.call('POST', `/api/v1/tests/${t.id}/publish`);
  await teacher.ctx.dispose();
  return t.id;
}

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: WEB });
  return ctx.newPage();
}

async function setCode(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await page.evaluate((c) => {
    const m = (window as unknown as { monaco: { editor: { getEditors(): { setValue(v: string): void; getDomNode(): HTMLElement | null }[] } } }).monaco;
    m.editor.getEditors().filter((e) => (e.getDomNode()?.offsetParent ?? null) !== null)[0]!.setValue(c);
  }, code);
}

async function startExam(page: Page, testTitle: string) {
  await page.goto('/tests/');
  const card = page.getByTestId('my-test').filter({ hasText: testTitle });
  await card.getByRole('link', { name: /Start|Resume/ }).click();
  await expect(page.getByTestId('rules')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Start test|Resume test/ }).click();
}

test('student takes a test; a second device waits for proctor approval; the answer is graded', async ({ browser }) => {
  test.setTimeout(240_000);
  const title = `E2E device test ${Date.now()}`;
  const testId = await createTest({ requireFullscreen: false, blockClipboard: true, webcam: 'off', violations: { warnAt: 3, finalWarnAt: 5, autoSubmitAt: 0 } }, title);

  // Device 1 starts the test.
  const dev1 = await newPage(browser);
  const p1 = guard(dev1);
  await login(dev1, STUDENT);
  await startExam(dev1, title);
  await expect(dev1.getByTestId('timer')).toHaveText(/^(29|30):\d\d$/);
  await expect(dev1.getByRole('heading', { name: 'Example 1' })).toBeVisible();
  await dev1.getByLabel('Language').selectOption('python');
  await setCode(dev1, 'def sum_array(a):\n    return sum(a)\n');
  await dev1.getByRole('button', { name: 'Submit answer' }).click();
  await expect(dev1.getByTestId('verdict')).toHaveText('Accepted', { timeout: 60_000 });
  if (shots) await dev1.screenshot({ path: `${shots}/p4-01-exam.png`, fullPage: true });

  // Device 2 (another browser, same student) is blocked.
  const dev2 = await newPage(browser);
  const p2 = guard(dev2);
  await login(dev2, STUDENT);
  await startExam(dev2, title);
  await expect(dev2.getByTestId('device-pending')).toBeVisible();

  // The proctor sees the request live and approves it.
  const proctor = await newPage(browser);
  const p3 = guard(proctor);
  await login(proctor, 'ta@demo.edu');
  await proctor.goto(`/tests/monitor/?id=${testId}`);
  await expect(proctor.getByText('Live', { exact: true })).toBeVisible();
  const req = proctor.getByTestId('device-request');
  await expect(req).toBeVisible();
  if (shots) await proctor.screenshot({ path: `${shots}/p4-02-monitor-device-request.png`, fullPage: true });
  await req.getByRole('button', { name: 'Approve device' }).click();
  await expect(req).toHaveCount(0);

  // Device 2 continues; device 1 is locked out.
  await expect(dev2.getByTestId('timer')).toBeVisible({ timeout: 15_000 });
  await expect(dev2.getByRole('heading', { name: 'Example 1' })).toBeVisible();
  await expect(dev1.getByTestId('device-replaced')).toBeVisible({ timeout: 20_000 });

  // Device 2 finishes: score from the graded submission.
  await dev2.getByRole('button', { name: 'Finish test' }).click();
  await expect(dev2.getByTestId('exam-ended')).toHaveText('Submitted');
  await expect.poll(async () => {
    await dev2.reload();
    return (await dev2.getByTestId('exam-score').textContent().catch(() => null)) ?? '';
  }, { timeout: 30_000 }).toBe('Score: 100 / 100');
  const row = proctor.getByTestId(`row-${STUDENT}`);
  await expect(row).toContainText('Submitted');
  await expect(row).toContainText('100/100');
  if (shots) await proctor.screenshot({ path: `${shots}/p4-03-monitor-submitted.png`, fullPage: true });
  expect([...p1, ...p2, ...p3]).toEqual([]);
});

test('start → violate → auto-submit, with warnings on the way', async ({ browser }) => {
  test.setTimeout(180_000);
  const title = `E2E violation test ${Date.now()}`;
  const testId = await createTest({ requireFullscreen: true, blockClipboard: true, webcam: 'off', violations: { warnAt: 1, finalWarnAt: 2, autoSubmitAt: 3 } }, title);
  const page = await newPage(browser);
  const problems = guard(page);
  await login(page, STUDENT);
  await startExam(page, title);
  await expect(page.getByTestId('timer')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(page.locator('.monaco-editor').first()).toBeVisible();

  // 1: copy (blocked, recorded)
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+C');
  await expect(page.getByTestId('violations')).toHaveText('⚑ 1');
  await expect(page.getByTestId('warning-banner')).toContainText('Warning');
  await expect(page.getByTestId('notice')).toContainText('proctoring violations');
  // 2: paste (blocked: the editor content does not change)
  const before = await page.locator('.monaco-editor').first().innerText();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.getByTestId('warning-banner')).toContainText('Final warning');
  expect(await page.locator('.monaco-editor').first().innerText()).toBe(before);
  // 3: leaving fullscreen → the server auto-submits.
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.getByTestId('exam-ended')).toHaveText('Submitted automatically', { timeout: 15_000 });

  const proctor = await newPage(browser);
  await login(proctor, 'teacher@demo.edu');
  await proctor.goto(`/tests/monitor/?id=${testId}`);
  const row = proctor.getByTestId(`row-${STUDENT}`);
  await expect(row).toContainText('Auto-submitted');
  await expect(row.getByTestId('violation-count')).toHaveText('3');
  await row.getByRole('button', { name: 'Timeline' }).click();
  await expect(proctor.getByTestId('timeline')).toContainText('Auto-submitted');
  await expect(proctor.getByTestId('timeline')).toContainText('Left fullscreen');
  if (shots) await proctor.screenshot({ path: `${shots}/p4-04-timeline.png`, fullPage: true });
  expect(problems).toEqual([]);
});

test('teacher creates, assigns and publishes a test in the UI', async ({ page }) => {
  const problems = guard(page);
  await login(page, 'teacher@demo.edu');
  await page.goto('/tests/edit/');
  const title = `UI-made test ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Search questions').fill('Sum of an Array');
  await page.getByRole('button', { name: 'Add' }).first().click();
  const value = await page.getByLabel('Students', { exact: true }).locator('option', { hasText: STUDENT }).getAttribute('value');
  await page.getByLabel('Students', { exact: true }).selectOption(value!);
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/Published\./)).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/p4-05-editor.png`, fullPage: true });
  expect(problems).toEqual([]);
});
