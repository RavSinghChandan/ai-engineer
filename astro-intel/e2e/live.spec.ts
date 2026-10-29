import { expect, Page, test } from '@playwright/test';

// Live AI flows: run only with `npm run e2e:live` (real DeepSeek calls, paid, a few minutes).
const ADMIN = { email: 'admin@e2e.test', password: 'E2e-Admin-Pass-1' };
const USER = { name: 'Asha Verma', email: `live-${Date.now()}@e2e.test`, password: 'E2e-User-Pass-1' };

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('response', r => { if (r.url().includes(':8080/') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.route('http://localhost:8010/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#siEmail').fill(email);
  await page.locator('#siPass').fill(password);
  await page.locator('button.login-btn').click();
  await expect(page).toHaveURL(/\/intake$/);
}

async function fillBirthProfile(page: Page, name: string) {
  await page.locator('input[autocomplete=name]').fill(name);
  await page.locator('input.dob-text-inp').pressSequentially('14081994');
  await page.locator('input.inp-icon').fill('Patna, Bihar, India');
  await page.locator('textarea.q-ta').fill('What does the coming year hold for my career?');
}

test('a new user gets a full AI reading and report @live', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.locator('#suName').fill(USER.name);
  await page.locator('#suEmail').fill(USER.email);
  await page.locator('#suPass').fill(USER.password);
  await page.locator('#suConfirm').fill(USER.password);
  await page.locator('button.login-btn').click();
  await expect(page.getByText('Account Created!')).toBeVisible();
  await signIn(page, USER.email, USER.password);

  await fillBirthProfile(page, USER.name);
  const run = page.waitForResponse(r => r.url().endsWith('/api/v1/analysis/run'), { timeout: 300_000 });
  await page.locator('button.cta').click();
  expect((await run).status()).toBe(200);
  await expect(page.locator('.launch-err')).toHaveCount(0);

  // The agents run, the insights are auto-approved and the report opens.
  await expect(page).toHaveURL(/\/report$/, { timeout: 480_000 });
  await expect(page.locator('h1.cover-name')).toHaveText(USER.name);
  await expect(page.locator('.cq-text').first()).toContainText(/career/i);
  const body = (await page.locator('#report-doc').innerText()).trim();
  expect(body.length).toBeGreaterThan(1500);
  expect(body).not.toMatch(/undefined|\[object Object\]|NaN/);
  expect(errors).toEqual([]);
});

test('the admin runs a reading, reviews the insights and publishes the report @live', async ({ page }) => {
  const errors = trackErrors(page);
  await signIn(page, ADMIN.email, ADMIN.password);
  await fillBirthProfile(page, 'Rohan Mehta');
  await page.locator('button.cta').click();
  await expect(page.locator('.launch-err')).toHaveCount(0);
  await expect(page).toHaveURL(/\/review/, { timeout: 480_000 });

  // Remedies come from the numerology books with sources, every bullet checked against them.
  const badge = page.getByTestId('rag-evidence-badge');
  await expect(badge).toHaveText(/Evidence check: \d+\/\d+ supported/, { timeout: 120_000 });
  await expect(page.getByTestId('rag-remedy-sources').first()).toContainText(/S\d+ · /);
  console.log('Remedies evidence:', (await badge.innerText()).trim());

  const progress = page.locator('.progress-label');
  await expect(progress).toHaveText(/^0\/[1-9]\d*$/);
  const total = (await progress.innerText()).split('/')[1];
  await page.getByRole('button', { name: 'Approve All' }).click();
  await expect(progress).toHaveText(`${total}/${total}`);

  await page.getByRole('button', { name: /Generate Report/ }).click();
  await expect(page.locator('.generate-err')).toHaveCount(0);
  await page.getByRole('button', { name: /View Report/ }).click({ timeout: 300_000 });
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.locator('h1.cover-name')).toHaveText('Rohan Mehta');
  expect((await page.locator('#report-doc').innerText()).length).toBeGreaterThan(1500);
  expect(errors).toEqual([]);
});

// Runs last: proves the two readings above really went through DeepSeek and did not
// fall back to the browser's local computation.
test('the readings above used real DeepSeek calls @live', async ({ request }) => {
  const login = await request.post('http://localhost:8080/auth/login', { data: ADMIN });
  expect(login.ok()).toBeTruthy();
  const { access_token } = await login.json();
  const res = await request.get('http://localhost:8080/api/v1/metrics', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  expect(res.ok()).toBeTruthy();
  const tokens = (await res.json()).token_economics;
  console.log('DeepSeek usage:', JSON.stringify({
    calls: tokens.total_llm_calls, tokens: tokens.total_tokens_all_runs, cost_usd: tokens.total_cost_usd,
  }));
  expect(tokens.has_real_data).toBe(true);
  expect(tokens.total_llm_calls).toBeGreaterThan(0);
});
