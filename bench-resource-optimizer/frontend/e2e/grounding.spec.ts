import { expect, test } from '@playwright/test';
import { CV_PDF } from './cv-pdf';

// UI for RAG citations + evidence checking. The AI is offline in this suite, so the
// two AI responses are stubbed with what the backend returns for a grounded answer
// (shape from agents/role_mapping_agent.py); `npm run e2e:live` checks the real one.
const USER = { id: 'e2e.tester', password: 'E2e-User-Pass-1' };

const PROFILE = {
  user_id: 'e2e.tester',
  profile: { name: 'Jane Doe', email: '', phone: '', skills: ['Java', 'SQL'], experience_years: 4,
             roles: ['Developer'], projects: [], education: '' },
};

const MAPPING = {
  role: 'Java Developer', match_percentage: 30, matched_skills: ['Java'],
  missing_skills: ['Spring Boot', 'Docker'], experience_gap: -1,
  recommendation: 'Learn Spring Boot and Docker.', readiness_level: 'needs_training',
  sources: ['S1'], prompt_version: 'role_mapper@v3', retrieval_method: 'hybrid+rerank',
  citations: [
    { id: 'S1', title: 'Java Developer', used: true, role_id: 'java_dev',
      snippet: 'Role: Java Developer\nRequired Skills: Java, Spring Boot, Docker' },
  ],
  evidence: {
    checked: 4, supported: 3, score: 0.75, blocked: [],
    unsupported: [{ claim: 'Kubernetes', field: 'missing_skills', reason: 'not in the retrieved role document' }],
    quarantined: [{ id: 'S2', title: 'Java Developer (runbook)', reasons: ['role_hijack', 'tool_call'] }],
    method: 'each claim must cite a retrieved passage containing at least 50% of its content words',
  },
};

test('role fit shows its sources, removed claims and quarantined documents', async ({ page }) => {
  await page.route('http://localhost:8011/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/upload-cv', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROFILE) }));
  await page.route('**/api/map-role', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MAPPING) }));

  await page.goto('/login');
  await page.getByPlaceholder('e.g. john.doe  or  admin').fill(USER.id);
  await page.getByPlaceholder('••••••••').fill(USER.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/upload$/);

  await page.locator('input[type=file]').setInputFiles({ name: 'jane-doe.pdf', mimeType: 'application/pdf', buffer: CV_PDF });
  await page.getByRole('button', { name: 'Parse CV' }).click();
  await page.getByRole('button', { name: /Continue to Role Mapping/ }).click();
  await expect(page).toHaveURL(/\/mapping$/);
  const select = page.locator('select').first();
  await expect(select.locator('option')).not.toHaveCount(1);
  await select.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Analyse Fit' }).click();

  await expect(page.getByTestId('evidence-badge')).toHaveText(/Evidence: 3\/4 skills supported/);
  const panel = page.getByTestId('evidence-panel');
  await expect(panel).toContainText('S1');
  await expect(panel).toContainText('Required Skills: Java, Spring Boot, Docker');
  await expect(page.getByTestId('evidence-removed')).toHaveText(/Removed “Kubernetes” from missing skills: not in the retrieved role document/);
  await expect(page.getByTestId('evidence-quarantined')).toContainText('Java Developer (runbook)');
  await expect(page.locator('.badge-red', { hasText: 'Kubernetes' })).toHaveCount(0);
});
