import { expect, test } from '@playwright/test';
import { totp } from './totp';

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@hbecode.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'admin-password-dev-1' };

test('super admin enrols MFA, signs in with a code and adds an institution', async ({ page, context }) => {
  await page.goto('/login/');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  let secret = process.env.E2E_ADMIN_TOTP_SECRET ?? '';
  if (await page.getByLabel('6-digit code from your authenticator app').isVisible({ timeout: 3000 }).catch(() => false)) {
    test.skip(!secret, 'admin already enrolled MFA in an earlier run; set E2E_ADMIN_TOTP_SECRET to re-run');
    await page.getByLabel('6-digit code from your authenticator app').fill(totp(secret));
    await page.getByRole('button', { name: 'Verify' }).click();
  } else {
    await expect(page).toHaveURL(/\/setup-mfa\/$/);
    secret = (await page.locator('code').first().textContent())!.trim();
    await page.getByLabel('Code').fill(totp(secret));
    await page.getByRole('button', { name: 'Enable' }).click();
    await expect(page).toHaveURL(/\/admin\/tenants\/$/);
    // A fresh session now needs the second factor; the enrolment code cannot be reused.
    await context.clearCookies();
    await page.goto('/login/');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('6-digit code from your authenticator app').fill(totp(secret, 1));
    await page.getByRole('button', { name: 'Verify' }).click();
  }
  await expect(page).toHaveURL(/\/admin\/tenants\/$/);
  const slug = `inst-${Date.now()}`;
  await page.getByLabel('Institution name').fill('Example Institute of Technology');
  await page.getByLabel('Slug').fill(slug);
  await page.getByRole('button', { name: 'Add institution' }).click();
  await expect(page.getByText(slug)).toBeVisible();
});
