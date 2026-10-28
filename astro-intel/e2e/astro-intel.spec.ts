import { expect, Page, test } from '@playwright/test';

// Matches e2e/start-backend.sh
const ADMIN = { email: 'admin@e2e.test', password: 'E2e-Admin-Pass-1' };
const USER = { name: 'E2E Tester', email: `user-${Date.now()}@e2e.test`, password: 'E2e-User-Pass-1' };

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

// The optional voice-agent service (universal-agent, port 8010) is not part of this
// app. Without it every page logs a connection error, so the tests stand in for it.
test.beforeEach(async ({ page }) => {
  await page.route('http://localhost:8010/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#siEmail').fill(email);
  await page.locator('#siPass').fill(password);
  await page.locator('button.login-btn').click();
}

test.describe('public pages', () => {
  test('home page loads with a sign-in link @mobile', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.locator('a.nav-signin')).toBeVisible();
    await page.locator('a.nav-signin').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#siEmail')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('backend health check is ok', async ({ request }) => {
    const res = await request.get('http://localhost:8080/health');
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).status).toBe('ok');
  });

  for (const path of ['/intake', '/review', '/report', '/profile', '/metrics', '/fde', '/admin/users']) {
    test(`signed-out visitor is sent to /login from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});

test.describe('sign in and sign up', () => {
  test('empty sign-in shows field errors @mobile', async ({ page }) => {
    await page.goto('/login');
    await page.locator('button.login-btn').click();
    await expect(page.locator('.field-err').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('wrong password is rejected', async ({ page }) => {
    await signIn(page, ADMIN.email, 'not-the-password');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/invalid|incorrect|wrong/i).first()).toBeVisible();
  });

  test('a new user can create an account, sign in and reach the intake form', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/login');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await page.locator('#suName').fill(USER.name);
    await page.locator('#suEmail').fill(USER.email);
    await page.locator('#suPass').fill(USER.password);
    await page.locator('#suConfirm').fill(USER.password);
    await page.locator('button.login-btn').click();
    // By design the account is created without signing in: the user signs in next.
    await expect(page.getByText('Account Created!')).toBeVisible();
    await page.getByRole('button', { name: /Go to Sign In/ }).click();
    await page.locator('#siEmail').fill(USER.email);
    await page.locator('#siPass').fill(USER.password);
    await page.locator('button.login-btn').click();
    await expect(page).toHaveURL(/\/intake$/);
    await expect(page.getByPlaceholder('DD / MM / YYYY')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('roles', () => {
  test('a normal user cannot open admin pages', async ({ page }) => {
    await signIn(page, USER.email, USER.password);
    await expect(page).toHaveURL(/\/intake$/);
    for (const path of ['/metrics', '/fde', '/admin/users']) {
      await page.goto(path);
      await expect(page, `${path} should redirect a USER`).not.toHaveURL(new RegExp(`${path}$`));
    }
  });

  test('a normal user can open their profile and sign out', async ({ page }) => {
    await signIn(page, USER.email, USER.password);
    await expect(page).toHaveURL(/\/intake$/);
    await page.goto('/profile');
    await expect(page.getByText(USER.email).first()).toBeVisible();
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.goto('/intake');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the superadmin can open metrics, FDE and user management', async ({ page }) => {
    const errors = trackErrors(page);
    await signIn(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/intake$/);
    for (const path of ['/metrics', '/fde', '/admin/users']) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
    await expect(page.getByText(USER.email).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the FDE page shows the agent permission matrix', async ({ page }) => {
    await signIn(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/intake$/);
    await page.goto('/fde');
    await page.getByRole('button', { name: /Agent permissions/ }).click();
    await expect(page.getByText('report_agent').first()).toBeVisible();
    await expect(page.getByText('human_reviewer').first()).toBeVisible();
  });
});
