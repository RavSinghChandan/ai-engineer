import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The admin sees, for every SENTENCE of a finding, where it comes from: the page and lines of a
// numerology book, the calculation of a number it states, or a note that the wording is the AI's
// own. That trail is for the review only: the PDF that goes to the client is exactly what it was.
// The AI is offline in the normal run, so the readings use the app's own templates and tables;
// the @live tests (npm run e2e:live, paid) use the real DeepSeek AI.
const ADMIN = { email: 'admin@e2e.test', password: 'E2e-Admin-Pass-1' };

test.beforeEach(async ({ page }) => {
  await page.route('http://localhost:8010/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
});

async function signInAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('#siEmail').fill(ADMIN.email);
  await page.locator('#siPass').fill(ADMIN.password);
  await page.locator('button.login-btn').click();
  await expect(page).toHaveURL(/\/intake$/);
}

async function fillBirthProfile(page: Page, dob = '14081994') {
  await page.locator('input[autocomplete=name]').fill('Rohan Mehta');
  await page.locator('input.dob-text-inp').pressSequentially(dob);
  await page.locator('input.inp-icon').fill('Patna, Bihar, India');
}

async function approveAndOpenReport(page: Page) {
  await page.getByRole('button', { name: 'Approve All' }).click();
  await page.getByRole('button', { name: /Generate Report/ }).click();
  await page.getByRole('button', { name: /View Report/ }).click({ timeout: 120_000 });
  await expect(page).toHaveURL(/\/report$/);
}

// The text of the PDF that the report page prints. The page injects its own print rules and
// calls window.print(); here print() only keeps those rules, which are then applied to a real
// Chromium PDF of the same page.
async function pdfText(page: Page): Promise<string> {
  await page.evaluate(() => {
    (window as any).__printCss = '';
    window.print = () => { (window as any).__printCss = document.getElementById('__aura-print-css')?.textContent ?? ''; };
  });
  await page.locator('button.tb-btn-primary').click();
  await page.waitForFunction(() => !!(window as any).__printCss, null, { timeout: 60_000 });
  const css = await page.evaluate(() => (window as any).__printCss as string);
  await page.addStyleTag({ content: css });
  await page.emulateMedia({ media: 'print' });
  const dir = mkdtempSync(join(tmpdir(), 'astro-pdf-'));
  const file = join(dir, 'report.pdf');
  writeFileSync(file, await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  await page.emulateMedia({ media: 'screen' });
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
}

// None of the review-only trail may reach the PDF.
function expectNoTrailInPdf(text: string) {
  expect(text).not.toMatch(/\bSOURCES\b|CALCULATED|BOOK ·|BUILT-IN|AI'S OWN WORDING|CHECK THE NUMBER|Sources and evidence/i);
  expect(text).not.toMatch(/page \d+, lines? \d+|Life Path: digits of/);
  expect(text).not.toMatch(/undefined|\[object Object\]|NaN/);
}

test('every sentence of a finding says where it comes from, and the PDF is unchanged', async ({ page }) => {
  test.setTimeout(240_000);
  await signInAsAdmin(page);
  await fillBirthProfile(page, '14031991');   // Life Path 1: the app's text for it has book sentences that say the same
  await page.locator('textarea.q-ta').fill('When will I get married?');
  await page.locator('button.cta').click();
  await expect(page).toHaveURL(/\/review/, { timeout: 180_000 });

  // ── the review page: a finding is shown sentence by sentence ─────────────
  const trails = page.getByTestId('sentence-trail');
  await expect(trails.first()).toBeVisible({ timeout: 60_000 });
  const cards = page.locator('.branch-card');
  expect(await cards.count()).toBe(3);                                  // Indian, Chaldean and Pythagorean numerology
  await expect(trails).toHaveCount(3);
  const rows = page.getByTestId('sentence-row');
  expect(await rows.count()).toBeGreaterThanOrEqual(8);
  for (const row of await rows.all()) {
    expect(await row.locator('.sent-ref').count(), await row.innerText()).toBeGreaterThanOrEqual(1);   // no sentence without a reference
  }
  // The number the first sentence states is checked and shown with its steps.
  const first = trails.first().getByTestId('sentence-row').first();
  await expect(first).toContainText('From the Indian Numerology perspective, your Life Path 1');
  const calc = first.locator('.sent-ref[data-kind=calculation]').first();
  await expect(calc).toContainText('CALCULATED');
  await expect(calc).toContainText('Life Path: digits of 1991-03-14 added, 1+9+9+1+0+3+1+4 = 28 → 10 → 1');
  // A book sentence is named with its title, page and lines, and its words are shown.
  const book = page.locator('.sent-ref[data-kind=book]').first();
  await expect(book).toContainText(/.+ · page \d+, lines? \d+/);
  await expect(book.locator('.sent-quote')).toContainText(/.{30,}/);
  // The text is the app's own template (no AI here), and the sentences that no book says say so.
  await expect(page.locator('.sent-ref[data-kind=rule]').first()).toContainText('Built into AstroIntel, not from a published book');
  await expect(page.locator('.sent-ref-warn')).toHaveCount(0);          // every number it states is right

  // ── the admin edits a finding: the text is theirs, the trail is for the original ─────
  const card = cards.first();
  await card.locator('.branch-select-btn').click();
  await card.getByRole('button', { name: 'Edit' }).click();
  await card.locator('textarea.ins-editor').fill('An edited finding, written by the admin.');
  await card.getByRole('button', { name: /Save/ }).click();
  await expect(card.locator('p.branch-text')).toHaveText('An edited finding, written by the admin.');
  await expect(card.getByTestId('edited-sentence-trail')).toContainText('You edited this finding');

  // ── approve and publish: the PDF has none of the trail ───────────────────
  await approveAndOpenReport(page);
  const text = await pdfText(page);
  expect(text).toContain('Rohan Mehta');
  expect(text).toContain('An edited finding, written by the admin');
  expectNoTrailInPdf(text);
});

test('a number that a sentence states wrongly is flagged', async ({ page }) => {
  test.setTimeout(240_000);
  await signInAsAdmin(page);
  await fillBirthProfile(page);
  await page.route('**/api/v1/analysis/run', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const insight = body.admin_review.questions[0].insights[0];
    insight.sentences = [{
      text: 'Your Soul Urge 9 is the key.',
      refs: [{ kind: 'calculation', title: 'Soul Urge 9', ok: false,
               detail: ['Soul Urge: vowels of ROHAN MEHTA, 7 + 1 + 5 + 1 = 14 → 5', 'The sentence says 9, but the calculation gives 5'] }],
    }];
    await route.fulfill({ response, json: body });
  });
  await page.locator('textarea.q-ta').fill('What is my path?');
  await page.locator('button.cta').click();
  await expect(page).toHaveURL(/\/review/, { timeout: 180_000 });
  const warn = page.locator('.sent-ref-warn');
  await expect(warn).toHaveCount(1);
  await expect(warn).toContainText('CHECK THE NUMBER');
  await expect(warn).toContainText('The sentence says 9, but the calculation gives 5');
});

test('every sentence of every chapter of the 360 report says where it comes from, and the PDF is unchanged', async ({ page }) => {
  test.setTimeout(240_000);
  await signInAsAdmin(page);
  await fillBirthProfile(page);
  await page.locator('button.rm-opt').nth(1).click();           // Full 360° Life Report
  await page.locator('button.cta').click();
  await expect(page).toHaveURL(/\/review/, { timeout: 180_000 });

  const trails = page.getByTestId('sentence-trail');
  await expect(trails.first()).toBeVisible({ timeout: 60_000 });
  await expect(trails).toHaveCount(14);                         // one per chapter
  const rows = page.getByTestId('sentence-row');
  expect(await rows.count()).toBeGreaterThanOrEqual(14 * 4);    // each chapter has its sentences
  for (const row of await rows.all()) {
    expect(await row.locator('.sent-ref').count(), await row.innerText()).toBeGreaterThanOrEqual(1);
  }
  await expect(page.locator('.sent-ref[data-kind=calculation]').first()).toContainText('Life Path: digits of 1994-08-14');
  // The AI is offline, so the chapters are the built-in text, and each sentence says so.
  await expect(page.locator('.sent-ref[data-kind=rule]').first()).toContainText('Built into AstroIntel, not from a published book');

  await approveAndOpenReport(page);
  const text = await pdfText(page);
  expect(text).toContain('Your Life Path');
  expectNoTrailInPdf(text);
});

// ── with the real AI (npm run e2e:live: paid, a few minutes) ────────────────
async function describeTrail(page: Page, label: string) {
  const rows = await page.getByTestId('sentence-row').count();
  const count = async (selector: string) => page.locator(`.sent-ref${selector}`).count();
  const sentences = await page.getByTestId('sentence-row').filter({ has: page.locator('.sent-ref[data-kind=book]') }).count();
  console.log(`${label}: ${rows} sentences; ${sentences} with a book reference `
    + `(${await count('[data-relation=says_same]')} say the same, ${await count('[data-relation=part_says_same]')} in part, `
    + `${await count('[data-relation=closest_given]')} closest in the passages given to the AI); `
    + `${await count('[data-kind=calculation]')} calculations, ${await count('.sent-ref-warn')} wrong numbers, `
    + `${await count('[data-kind=ai]')} sentences in the AI's own wording`);
}

test('the AI-written findings of a question report are traced sentence by sentence @live', async ({ page }) => {
  test.setTimeout(600_000);
  await signInAsAdmin(page);
  await fillBirthProfile(page, '14031991');
  await page.locator('textarea.q-ta').fill('Will my financial situation improve in the coming months, and how?');
  await page.locator('button.cta').click();
  await expect(page).toHaveURL(/\/review/, { timeout: 480_000 });

  const trails = page.getByTestId('sentence-trail');
  await expect(trails.first()).toBeVisible({ timeout: 120_000 });
  await expect(trails).toHaveCount(await page.locator('.branch-card').count());
  for (const row of await page.getByTestId('sentence-row').all()) {
    expect(await row.locator('.sent-ref').count(), await row.innerText()).toBeGreaterThanOrEqual(1);
  }
  await describeTrail(page, 'Question flow');
  await page.locator('.branch-card').first().screenshot({ path: 'test-results/live-question-card.png' });

  await approveAndOpenReport(page);
  expectNoTrailInPdf(await pdfText(page));
});

test('the AI-written chapters of the 360 report are traced sentence by sentence @live', async ({ page }) => {
  test.setTimeout(600_000);
  await signInAsAdmin(page);
  await fillBirthProfile(page, '14031991');
  await page.locator('button.rm-opt').nth(1).click();
  await page.locator('button.cta').click();
  await expect(page).toHaveURL(/\/review/, { timeout: 480_000 });

  const trails = page.getByTestId('sentence-trail');
  await expect(trails.first()).toBeVisible({ timeout: 120_000 });
  await expect(trails).toHaveCount(14);
  for (const row of await page.getByTestId('sentence-row').all()) {
    expect(await row.locator('.sent-ref').count(), await row.innerText()).toBeGreaterThanOrEqual(1);
  }
  await describeTrail(page, '360 flow');
  await page.locator('.branch-card').first().screenshot({ path: 'test-results/live-chapter-card.png' });

  await approveAndOpenReport(page);
  expectNoTrailInPdf(await pdfText(page));
});
