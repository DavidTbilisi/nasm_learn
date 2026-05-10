// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 15_000,
  expect: { timeout: 5_000 },
  webServer: {
    command: 'npx serve tutorial -p 8788 --no-clipboard',
    url: 'http://localhost:8788/',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  use: {
    baseURL: 'http://localhost:8788/',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
    bypassCSP: true,
    extraHTTPHeaders: { 'Cache-Control': 'no-cache' },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
