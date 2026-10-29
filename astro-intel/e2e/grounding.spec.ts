import { expect, test } from '@playwright/test';

// UI for RAG citations + evidence checking on the admin review page. The AI is
// offline in this suite, so the remedies answer is stubbed with what the backend
// returns (agents/remedies_agent.py); `npm run e2e:live` checks the real one.
const ADMIN = { email: 'admin@e2e.test', password: 'E2e-Admin-Pass-1' };

const REMEDIES = {
  remedies: [
    { icon: '🕉', category: 'Mantra', text: 'Chant Om Namah Shivaya 108 times at sunrise', sources: ['S1'], support: 1 },
    { icon: '🎨', category: 'Color', text: 'Wear grey, blue and earthy brown colours', sources: ['S2'], support: 0.83 },
  ],
  citations: [
    { id: 'S1', title: 'Cheiro Book of Numbers', snippet: 'For those born under the number 4, chant Om Namah Shivaya 108 times at sunrise.', used: true },
    { id: 'S2', title: 'Numerology and the Divine Triangle', snippet: 'Life Path 4 people benefit from wearing grey, blue and earthy brown colours.', used: true },
  ],
  evidence: {
    checked: 3, supported: 2, score: 0.667, blocked: [],
    unsupported: [{ claim: 'Wear a yellow sapphire in gold on Thursday', sources: ['S1'], reason: 'only 17% of the claim appears in the cited passage' }],
    quarantined: [{ id: 'S3', title: 'Numerology Secrets', reasons: ['role_hijack', 'tool_call'] }],
    method: 'each claim must cite a retrieved passage containing at least 50% of its content words',
  },
};

test('review page shows remedy sources, removed claims and quarantined passages', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('http://localhost:8010/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/v1/analysis/remedies', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REMEDIES) }));

  await page.goto('/login');
  await page.locator('#siEmail').fill(ADMIN.email);
  await page.locator('#siPass').fill(ADMIN.password);
  await page.locator('button.login-btn').click();
  await expect(page).toHaveURL(/\/intake$/);
  await page.locator('input[autocomplete=name]').fill('Rohan Mehta');
  await page.locator('input.dob-text-inp').pressSequentially('14081994');
  await page.locator('input.inp-icon').fill('Patna, Bihar, India');
  await page.locator('textarea.q-ta').fill('What does the coming year hold for my career?');
  await page.locator('button.cta').click();
  await expect(page).toHaveURL(/\/review/, { timeout: 180_000 });

  await expect(page.getByTestId('rag-evidence-badge')).toHaveText(/Evidence check: 2\/3 supported/, { timeout: 60_000 });
  const chips = page.getByTestId('rag-remedy-sources');
  await expect(chips.first()).toContainText('S1 · Cheiro Book of Numbers');
  await expect(chips.nth(1)).toContainText('S2 · Numerology and the Divine Triangle');
  const panel = page.getByTestId('rag-evidence-panel');
  await panel.locator('summary').click();
  await expect(panel).toContainText('Sources and evidence (2 passages)');
  await expect(page.getByTestId('rag-dropped')).toContainText('Removed: “Wear a yellow sapphire in gold on Thursday”');
  await expect(page.getByTestId('rag-quarantined')).toContainText('Quarantined passage: Numerology Secrets');
});
