// The soak test is slow by nature, so it lives outside the normal E2E run.
//   npm run test:soak                 # 3 minutes
//   SOAK_MINUTES=30 npm run test:soak # the PRD §15 figure

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/soak',
  timeout: 45 * 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--autoplay-policy=no-user-gesture-required',
            // performance.memory is only populated with precise values behind this
            // flag; without it the heap check is skipped rather than wrong.
            '--enable-precise-memory-info',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/index.html',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
