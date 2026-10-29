import { defineConfig, devices } from '@playwright/test';

const preview = process.env.PLAYWRIGHT_PREVIEW === '1';
const port = Number(process.env.PLAYWRIGHT_PORT ?? (preview ? 4173 : 5173));
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'storage', testMatch: /(storage|training|combat-core|career-core|career-ai|career-assets)\.spec\.ts/ },
    {
      name: 'chrome',
      testMatch: /(menu|lobby|gym|combat|career)\.spec\.ts/,
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    command: `${preview ? 'npm run preview' : 'npm run dev'} -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
