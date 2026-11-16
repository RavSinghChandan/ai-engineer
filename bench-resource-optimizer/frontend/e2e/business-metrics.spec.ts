import { expect, Page, test } from '@playwright/test';

// AgentBusinessMetrics. The AI is offline in this run, so the role-mapping answer is
// stubbed in the browser; the dashboard, manual allocations and outcomes go to the
// real (throwaway) backend.
const USER = { id: 'e2e.manager', password: 'E2e-User-Pass-1' };

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.route('http://localhost:8011/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
});

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('e.g. john.doe  or  admin').fill(USER.id);
  await page.getByPlaceholder('••••••••').fill(USER.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/upload$/);
}

const kpi = (page: Page, key: string) => page.locator(`[data-metric="${key}"]`);

test('dashboard shows the five metrics; a manual allocation replaces the assumed baseline @mobile', async ({ page }) => {
  const errors = trackErrors(page);
  await signIn(page);
  await expect(page.locator('a[href="/business-metrics"]')).toHaveCount(1);   // in the nav
  await page.goto('/business-metrics');
  await expect(page.getByRole('heading', { name: 'Agent Business Metrics' })).toBeVisible();

  for (const key of ['acceptance_rate', 'time_to_allocate', 'intervention_rate',
                     'cost_per_recommendation_usd', 'allocation_success_rate']) {
    await expect(kpi(page, key)).toBeVisible();
  }
  // Desktop and mobile share one backend: only the first run starts with no manual allocation.
  if (await page.getByText(/and 0 manual allocations/).isVisible()) {
    await expect(kpi(page, 'time_to_allocate')).toContainText('Manual: 90.0 min');   // assumed baseline
    await expect(kpi(page, 'time_to_allocate').locator('.tag-assume')).toBeVisible();
  }

  // Log an allocation made by hand: 3 hours.
  const candidate = `cand-${Date.now()}`;
  await page.getByPlaceholder('Candidate ID').fill(candidate);
  await page.getByPlaceholder('Role').fill('QA Engineer');
  await page.getByPlaceholder('Minutes').fill('180');
  await page.getByRole('button', { name: 'Log allocation' }).click();

  const row = page.locator('tr', { hasText: candidate });
  await expect(row).toContainText('manual');
  await expect(row).toContainText('3.0 h');
  await expect(kpi(page, 'time_to_allocate').locator('.tag-assume')).toHaveCount(0);   // now measured

  // Record that it worked.
  await row.getByRole('button', { name: 'Worked' }).click();
  await expect(row).toContainText('worked');
  await expect(kpi(page, 'allocation_success_rate')).toContainText('manual 100.0%');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('a manager accepts a recommendation on the Role Mapping page', async ({ page }) => {
  const errors = trackErrors(page);
  let decision: any = null;
  await page.route('**/api/roles', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: 'py', title: 'Python Engineer', description: 'Python services' }]) }));
  await page.route('**/api/map-role', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    role: 'Python Engineer', match_percentage: 72, matched_skills: ['Python'], missing_skills: ['Kubernetes'],
    experience_gap: 0, recommendation: 'Good fit after a short Kubernetes ramp-up.',
    recommendation_id: 'rec-e2e-1', needs_help: ['1 claim(s) not supported by the role documents'],
  }) }));
  await page.route('**/api/allocations/rec-e2e-1/decision', async r => {
    decision = r.request().postDataJSON();
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await signIn(page);
  // The candidate normally comes from a CV upload; reloading picks it up from sessionStorage.
  await page.evaluate(() => sessionStorage.setItem('userId', 'cand-e2e'));
  await page.goto('/mapping');
  const select = page.locator('select').first();
  await select.selectOption({ label: 'Python Engineer' });
  await page.getByRole('button', { name: 'Analyse Fit' }).click();

  const card = page.getByTestId('allocation-decision');
  await expect(card).toContainText('The agent asked for a closer look: 1 claim(s) not supported');
  await card.getByRole('button', { name: '✓ Accept' }).click();
  await expect(card).toContainText('Recorded: accepted');
  expect(decision).toEqual({ decision: 'accepted', note: '' });
  await expect(card.getByRole('button', { name: '✓ Accept' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
