import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: a throwaway backend copy (e2e/start-backend.sh) plus `ng serve`
// with the usual /api proxy. Run with: npx playwright test · report: npx playwright show-report
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
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
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
