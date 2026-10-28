import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: a throwaway backend copy (e2e/start-backend.sh) plus `ng serve`
// with the usual /api proxy. Run with: npx playwright test · report: npx playwright show-report
// `npm run e2e:live` sets E2E_LIVE=1: only the @live tests run, against the real
// DeepSeek API (paid, slow). The normal run skips them.
const LIVE = process.env['E2E_LIVE'] === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4300',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: LIVE
    ? [{ name: 'live', use: { ...devices['Desktop Chrome'] }, grep: /@live/, timeout: 600_000 }]
    : [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@live/ },
        { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
      ],
  webServer: [
    {
      command: './e2e/start-backend.sh',
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx ng serve --host 127.0.0.1 --port 4300 --proxy-config proxy.conf.json',
      url: 'http://127.0.0.1:4300',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
