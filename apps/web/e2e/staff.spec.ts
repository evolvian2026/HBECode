import { expect, test } from '@playwright/test';

const PW = process.env.E2E_PASSWORD ?? 'demo-password-123';
const shots = process.env.E2E_SCREENSHOTS;

test('teacher sees the validated question with per-language timings', async ({ page }) => {
  await page.goto('/login/');
  await page.getByLabel('Email').fill('teacher@demo.edu');
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/questions\/$/);
  await page.getByRole('link', { name: 'Sum of an Array' }).click();
  // Global questions are read-only for teachers (super admin owns the global bank).
  await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Tests' }).click();
  await expect(page.getByText('Hidden tests (10/15')).toBeVisible();
  await page.getByRole('tab', { name: 'Languages' }).click();
  await expect(page.getByRole('button', { name: /Reference solution/ })).toHaveCount(0 + 1);
  if (shots) await page.screenshot({ path: `${shots}/04-teacher-question.png`, fullPage: true });
});

test('teacher creates a question; the checklist blocks validation until it is complete', async ({ page }) => {
  await page.goto('/login/');
  await page.getByLabel('Email').fill('teacher@demo.edu');
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.locator('input').first().fill(`Reverse a string ${Date.now()}`);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Created.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validate', exact: true })).toBeDisabled();
  await expect(page.getByText('exactly 2 sample test cases are required').or(page.getByText('10–15 hidden test cases are required'))).toBeVisible();
});

test('institution admin is forced through MFA enrolment', async ({ page }) => {
  await page.goto('/login/');
  await page.getByLabel('Email').fill('admin@demo.edu');
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/setup-mfa\/$/);
  await expect(page.getByRole('img', { name: 'Authenticator QR code' })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/05-mfa-setup.png`, fullPage: true });
});
