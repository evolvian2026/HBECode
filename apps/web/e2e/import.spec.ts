import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Plain ASCII scratch dir: test-result folders inherit Unicode test titles. */
const scratch = () => mkdtempSync(join(tmpdir(), 'hbe-e2e-'));
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 5: templates, upload preview with per-row problems, the problem report, import, and
 * export → re-import (update) through the UI.
 */
const PW = process.env.E2E_PASSWORD ?? 'demo-password-123';
const shots = process.env.E2E_SCREENSHOTS;

function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function login(page: Page, email: string) {
  await page.goto('/login/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/(questions|practice|tests|admin)\//); // the post-login redirect has happened
}

async function save(page: Page, click: () => Promise<void>, dir: string) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const path = `${dir}/${dl.suggestedFilename()}`;
  await dl.saveAs(path);
  return { path, name: dl.suggestedFilename() };
}

test('teacher downloads the templates; the Excel template reads back as 3 example questions', async ({ page }) => {
  const dir = scratch();
  const problems = guard(page);
  await login(page, 'teacher@demo.edu');
  await page.goto('/questions/import/');
  const xlsx = await save(page, () => page.getByRole('button', { name: 'Excel template' }).click(), dir);
  const docx = await save(page, () => page.getByRole('button', { name: 'Word template' }).click(), dir);
  expect(xlsx.name).toBe('hbecode-question-template.xlsx');
  expect(docx.name).toBe('hbecode-question-template.docx');
  expect(readFileSync(xlsx.path).subarray(0, 2).toString()).toBe('PK');
  await page.getByLabel('Question file').setInputFiles(xlsx.path);
  await expect(page.getByTestId('upload-counts')).toContainText('3 questions');
  // The examples may already exist in this institution from an earlier run: ready or duplicate, never errors.
  await expect(page.getByTestId('upload-counts')).toContainText('0 with errors');
  for (const k of ['Q1', 'Q2', 'Q3']) await expect(page.getByTestId(`upload-row-${k}`)).toContainText(/ready|duplicate/);
  if (shots) await page.screenshot({ path: `${shots}/p5-01-template-preview.png`, fullPage: true });
  expect(problems).toEqual([]);
});

test('preview shows per-row problems and a report; good rows import; export then re-import updates', async ({ page }) => {
  const dir = scratch();
  const problems = guard(page);
  await login(page, 'teacher@demo.edu');
  await page.goto('/questions/import/');
  const stamp = Date.now();
  const good = { type: 'coding', title: `Imported draft ${stamp}`, statement: 'Read two integers and print their sum. This is an imported draft.', difficulty: 'easy', tags: ['import'] };
  const bad = { type: 'coding', title: `Broken ${stamp}`, statement: 'x', difficulty: 'impossible' };
  const file = `${dir}/questions-${stamp}.json`;
  writeFileSync(file, JSON.stringify({ format: 'hbecode-questions', version: 1, questions: [good, bad] }));
  await page.waitForLoadState('networkidle'); // hydrated (the page has fetched recent uploads)
  await page.getByLabel('Question file').setInputFiles(file);
  await expect(page.getByTestId('upload-counts')).toContainText('2 questions · 1 ready · 1 with errors');
  await expect(page.getByTestId('upload-row-Q2')).toContainText('difficulty');
  await expect(page.getByTestId('upload-row-Q1')).toContainText('not ready to publish');
  const report = await save(page, () => page.getByRole('button', { name: 'Download problem report' }).click(), dir);
  expect(report.name).toBe('upload-problems.xlsx');
  if (shots) await page.screenshot({ path: `${shots}/p5-02-preview-errors.png`, fullPage: true });

  // A draft without tests cannot pass validation yet: import without publishing.
  await page.getByLabel(/Validate each question/).uncheck();
  await page.getByRole('button', { name: 'Import 1 question' }).click();
  await expect(page.getByTestId('upload-row-Q1')).toContainText('imported');
  await expect(page.getByTestId('upload-counts')).toContainText('1 imported');

  // Export it from the question bank, then import the file again: it updates the same question.
  await page.goto('/questions/');
  await page.getByLabel('Search').fill(`Imported draft ${stamp}`);
  await page.getByLabel(`Select Imported draft ${stamp}`).check();
  await page.getByLabel('Export format').selectOption('xlsx');
  const exported = await save(page, () => page.getByRole('button', { name: 'Export' }).click(), dir);
  await page.goto('/questions/import/');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Question file').setInputFiles(exported.path);
  await expect(page.getByTestId('upload-row-Q1')).toContainText('update');
  await expect(page.getByTestId('upload-row-Q1')).toContainText('ready');
  if (shots) await page.screenshot({ path: `${shots}/p5-03-reimport-update.png`, fullPage: true });
  expect(problems).toEqual([]);
});

test('the template’s example questions pass real sandbox validation and publish', async ({ page }) => {
  test.setTimeout(240_000);
  const dir = scratch();
  const problems = guard(page);
  await login(page, 'teacher@demo.edu');
  await page.goto('/questions/import/');
  const xlsx = await save(page, () => page.getByRole('button', { name: 'Excel template' }).click(), dir);
  await page.getByLabel('Question file').setInputFiles(xlsx.path);
  await expect(page.getByTestId('upload-counts')).toContainText('3 questions');
  const counts = (await page.getByTestId('upload-counts').textContent()) ?? '';
  test.skip(!counts.includes('3 ready'), 'the examples were already imported into this institution (re-run on the same volume)');
  await expect(page.getByLabel(/Validate each question/)).toBeChecked();
  await page.getByRole('button', { name: 'Import 3 questions' }).click();
  // Coding (8 languages), HTML and SQL (PostgreSQL + MySQL) references run in the real executor.
  await expect(page.getByTestId('validation-progress')).toContainText('3 published · 0 running · 0 failed', { timeout: 200_000 });
  if (shots) await page.screenshot({ path: `${shots}/p5-04-validated.png`, fullPage: true });
  expect(problems).toEqual([]);
});
