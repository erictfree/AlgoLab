import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  // The Degree 3 scenario measures real rendering throughput. Running a second
  // animated WEBGL page beside it benchmarks GPU contention, not the one-project
  // classroom workload the acceptance test specifies.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 720 }, // the classroom baseline of §13.5
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // The acceptance test drives real audio analysis, so the page needs a
            // usable audio pipeline without a human click.
            '--autoplay-policy=no-user-gesture-required',
            '--use-fake-ui-for-media-stream',
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
