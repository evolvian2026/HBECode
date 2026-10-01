import { expect, test, type Page } from '@playwright/test';

const STUDENT = { email: process.env.E2E_STUDENT_EMAIL ?? 'student@demo.edu', password: process.env.E2E_PASSWORD ?? 'demo-password-123' };
const shots = process.env.E2E_SCREENSHOTS;

/** Fail the test on any CSP violation or uncaught page error. */
function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function setCode(page: Page, code: string) {
  const editor = page.locator('.monaco-editor').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  // Monaco auto-indents typed newlines; insertText bypasses that.
  await page.keyboard.insertText(code);
}

test('student solves a problem: run samples, custom input, submit hidden tests', async ({ page }) => {
  const problems = guard(page);
  await login(page, STUDENT.email, STUDENT.password);
  await expect(page).toHaveURL(/\/practice\/$/);
  await page.getByRole('link', { name: /Sum of an Array/ }).click();
  await expect(page.getByRole('heading', { name: 'Example 1' })).toBeVisible();
  await page.getByLabel('Language').selectOption('python');
  await expect(page.getByText('CPython 3.12')).toBeVisible();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/01-ide.png`, fullPage: true });

  // Wrong answer first.
  await setCode(page, 'def sum_array(a):\n    return sum(a) + 1\n');
  await page.getByRole('button', { name: /Run/ }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Wrong answer');

  // Custom input shows program output.
  await setCode(page, 'def sum_array(a):\n    return sum(a)\n');
  await page.getByRole('tab', { name: 'Test input' }).click();
  await page.getByLabel('Run with custom input').check();
  await page.getByRole('textbox', { name: 'Custom input' }).fill('3\n10 20 30\n');
  await page.getByRole('button', { name: /Run/ }).click();
  await expect(page.getByTestId('stdout').first()).toHaveText('60');

  // Submit runs the hidden tests: verdicts only.
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Accepted');
  await expect(page.getByText('Score: 100%')).toBeVisible();
  await expect(page.getByText('Hidden tests (details are not shown)')).toBeVisible();
  await expect(page.getByText('#10 AC')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/02-accepted.png`, fullPage: true });

  // Autosave: reload restores the code from the server draft.
  await page.waitForTimeout(2000);
  await page.reload();
  await expect(page.locator('.monaco-editor')).toContainText('return sum(a)');
  expect(problems).toEqual([]);
});

test('compile errors point at the student file and never show the driver', async ({ page }) => {
  const problems = guard(page);
  await login(page, STUDENT.email, STUDENT.password);
  await page.getByRole('link', { name: /Sum of an Array/ }).click();
  await page.getByLabel('Language').selectOption('c');
  await setCode(page, 'long long sum_array(int n, const long long *a) {\n    return oops;\n}\n');
  await page.getByRole('tab', { name: 'Test input' }).click();
  await page.getByLabel('Run with custom input').uncheck();
  await page.getByRole('button', { name: /Run/ }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Compilation error');
  const out = page.getByTestId('result');
  await expect(out).toContainText('solution.c:2');
  await expect(out).not.toContainText('scanf');
  if (shots) await page.screenshot({ path: `${shots}/03-compile-error.png`, fullPage: true });
  expect(problems).toEqual([]);
});

test('guest can practice without an account', async ({ page }) => {
  guard(page);
  await page.goto('/login/');
  await page.getByRole('button', { name: /Continue as guest/ }).click();
  await expect(page).toHaveURL(/\/practice\/$/);
  await expect(page.getByRole('link', { name: /Sum of an Array/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Question bank' })).toHaveCount(0);
});
