/* Chromium only: this environment has no WebKit build, so these tests check the
   logic and the layout, never real iOS Safari behaviour. The share sheet,
   printing, Add to Home Screen and the feel of a real drag all need a phone —
   see the checklist at the end of README.md. */
const { defineConfig, devices } = require('playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off'
  },
  projects: [
    {
      name: 'iphone',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true
      }
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }
    }
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --directory app',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
    timeout: 20000
  }
});
