import { expect, Page, test } from '@playwright/test';

// Matches e2e/start-backend.sh
const ADMIN = { id: 'admin', password: 'E2e-Admin-Pass-1' };
const USER = { id: 'e2e.tester', password: 'E2e-User-Pass-1' };

// A valid one-page PDF (with a cross-reference table) holding a line of CV text.
function makePdf(lines: string[]): Buffer {
  const stream = 'BT /F1 11 Tf 72 740 Td 14 TL ' + lines.map(l => `(${l}) '`).join(' ') + ' ET';
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
const CV_PDF = makePdf([
  'Jane Doe - Software Engineer - jane.doe@example.com',
  'Summary: 3 years building backend services in Python and FastAPI.',
  'Skills: Python, FastAPI, SQL, PostgreSQL, Docker, REST APIs, Git, pytest.',
  'Experience: Backend Engineer, Example Corp (2023 - 2026).',
  'Built REST APIs serving 2 million requests a day; added caching and tests.',
  'Education: B.Tech in Computer Science, 2022.',
]);

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// The optional voice-agent service (port 8011) is not part of this app; stand in for it.
test.beforeEach(async ({ page }) => {
  await page.route('http://localhost:8011/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
});

async function signIn(page: Page, id: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('e.g. john.doe  or  admin').fill(id);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test.describe('public', () => {
  test('backend health check is ok', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:8000/health');
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).status).toBe('ok');
  });

  test('login page loads @mobile', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('.logo-text')).toHaveText('Bench Resource Optimizer');
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  for (const path of ['/upload', '/mapping', '/dashboard', '/memory', '/metrics', '/fde', '/graph', '/profile', '/admin']) {
    test(`signed-out visitor is sent to /login from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test('wrong password is rejected', async ({ page }) => {
    await signIn(page, ADMIN.id, 'not-the-password');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('.alert-error')).toBeVisible();
  });
});

test.describe('user', () => {
  test('a user signs in, lands on Upload CV and cannot open Admin', async ({ page }) => {
    await signIn(page, USER.id, USER.password);
    await expect(page).toHaveURL(/\/upload$/);
    await expect(page.getByRole('heading', { name: 'Upload Your CV' })).toBeVisible();
    await expect(page.locator('.role-badge')).toHaveText(/User/);
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test('every user page opens without errors', async ({ page }) => {
    const errors = trackErrors(page);
    await signIn(page, USER.id, USER.password);
    await expect(page).toHaveURL(/\/upload$/);
    for (const path of ['/mapping', '/dashboard', '/memory', '/metrics', '/fde', '/graph', '/profile']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator('main.main-content')).not.toBeEmpty();
    }
    expect(errors).toEqual([]);
  });

  test('uploading a CV while the AI is unavailable shows a clear error, not a hang', async ({ page }) => {
    await signIn(page, USER.id, USER.password);
    await expect(page).toHaveURL(/\/upload$/);
    await page.locator('input[type=file]').setInputFiles({ name: 'jane-doe.pdf', mimeType: 'application/pdf', buffer: CV_PDF });
    await page.getByRole('button', { name: 'Parse CV' }).click();
    const outcome = page.locator('.alert-error').or(page.getByRole('heading', { name: /Extracted Profile/ }));
    await expect(outcome.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Parse CV' })).toBeEnabled();
  });

  test('sign out returns to the login page', async ({ page }) => {
    await signIn(page, USER.id, USER.password);
    await expect(page).toHaveURL(/\/upload$/);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/upload');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('admin', () => {
  test('the HR admin lands on the knowledge base page', async ({ page }) => {
    const errors = trackErrors(page);
    await signIn(page, ADMIN.id, ADMIN.password);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: /HR Admin/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Internal Resource Registry' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the FDE page shows the agent permission matrix', async ({ page }) => {
    await signIn(page, ADMIN.id, ADMIN.password);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/fde');
    await page.getByRole('button', { name: /Agent permissions/ }).click();
    await expect(page.getByText('role_mapping_agent').first()).toBeVisible();
    await expect(page.getByText('hr_admin').first()).toBeVisible();
  });
});
