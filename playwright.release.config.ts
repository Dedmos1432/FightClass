import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:/release\.spec\.ts/,workers:1,timeout:90_000,expect:{timeout:20_000},
  reporter:'list',outputDir:'test-results/release',
  use:{...devices['Desktop Chrome'],channel:'chrome',baseURL:'http://127.0.0.1:4175/',viewport:{width:1440,height:900},
    launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']},trace:'retain-on-failure'},
  webServer:{command:'npm run preview -- --outDir dist-yandex --port 4175',url:'http://127.0.0.1:4175/',reuseExistingServer:!process.env.CI,timeout:30_000},
});
