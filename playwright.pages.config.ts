import { defineConfig, devices } from '@playwright/test';

/** The production build is served beneath the same repository path as GitHub Pages. */
export default defineConfig({
  testDir: './tests',
  testMatch: /pages\.spec\.ts/,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  outputDir: 'test-results/pages',
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:4174/FightClass/',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4174 --base=/FightClass/',
    url: 'http://127.0.0.1:4174/FightClass/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
