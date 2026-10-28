import { expect, Page, test } from '@playwright/test';
import { CV_PDF } from './cv-pdf';

// Live AI flow: run only with `npm run e2e:live` (real DeepSeek calls, paid, a few minutes).
const USER = { id: `live.${Date.now()}`, password: 'E2e-User-Pass-1' };

test.beforeEach(async ({ page }) => {
  await page.route('http://localhost:8011/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}

test('a CV is parsed, mapped to a role and turned into a study plan @live', async ({ page, request }) => {
  const errors = trackErrors(page);
  await page.goto('/login');
  await page.getByPlaceholder('e.g. john.doe  or  admin').fill(USER.id);
  await page.getByPlaceholder('••••••••').fill(USER.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/upload$/);

  // 1. The AI reads the CV.
  await page.locator('input[type=file]').setInputFiles({ name: 'jane-doe.pdf', mimeType: 'application/pdf', buffer: CV_PDF });
  await page.getByRole('button', { name: 'Parse CV' }).click();
  await expect(page.getByRole('heading', { name: /Extracted Profile/ })).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('.profile-item').first()).toContainText('Jane Doe');
  await expect(page.locator('.tag', { hasText: /^Python$/i }).first()).toBeVisible();
  await expect(page.locator('.tag', { hasText: /FastAPI/i }).first()).toBeVisible();

  // 2. The AI compares the skills with a target role.
  await page.getByRole('button', { name: /Continue to Role Mapping/ }).click();
  await expect(page).toHaveURL(/\/mapping$/);
  const select = page.locator('select').first();
  await expect(select.locator('option')).not.toHaveCount(1);
  const options = await select.locator('option').allTextContents();
  const role = options.find(o => /backend/i.test(o)) ?? options[1];
  await select.selectOption({ label: role });
  await page.getByRole('button', { name: 'Analyse Fit' }).click();
  await expect(page.locator('h2', { hasText: role.trim() })).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('.score-ring')).toHaveText(/\d+%/);
  await expect(page.getByRole('heading', { name: /Skills You Have/ })).toBeVisible();

  // 3. The AI streams a day-by-day plan; the dashboard opens with its tasks.
  await page.getByRole('button', { name: /Generate \d+-Day Plan/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 420_000 });
  await expect(page.getByRole('heading', { name: 'Preparation Dashboard' })).toBeVisible();
  const summary = await page.getByText(/Day Roadmap/).innerText();
  console.log('Plan:', summary.replace(/\s+/g, ' ').trim());
  expect(Number(summary.match(/(\d+) total tasks/)?.[1])).toBeGreaterThan(0);
  // The planner's no-AI fallback writes "Study <skill> fundamentals" / "Build <skill> mini-project".
  const dashboard = await page.locator('main.main-content').innerText();
  expect(dashboard).not.toMatch(/Study \S+ fundamentals|Build \S+ mini-project/);

  // Every step above went through DeepSeek: the backend recorded real token usage.
  const tokens = (await (await request.get('http://127.0.0.1:8000/metrics')).json()).token_economics;
  console.log('DeepSeek usage:', JSON.stringify({ avg_tokens: tokens.avg_total_tokens, cost_usd: tokens.total_cost_usd }));
  expect(tokens.has_real_data).toBe(true);
  expect(errors).toEqual([]);
});
