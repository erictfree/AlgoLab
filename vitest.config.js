import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest owns tests/unit; Playwright owns tests/e2e. Without this, vitest tries to
    // collect the Playwright spec and fails on its imports.
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
