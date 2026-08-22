import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 5173);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  // The live-replacement scenario measures real rendering throughput. Running a
  // second animated WEBGL page beside it benchmarks GPU contention rather than one
  // instrument session.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 }, // reference performance viewport
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
    url: `http://localhost:${PORT}/live/index.html`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
