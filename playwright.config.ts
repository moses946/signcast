import { defineConfig } from '@playwright/test';
const port = process.env.SIGNCAST_TEST_PORT || '3000';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    trace: 'retain-on-failure',
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: false,
    env: {
      PORT: port,
      PUBLIC_BASE_URL: `http://localhost:${port}`,
      MOCK_PROVIDERS: 'true',
      NODE_ENV: 'test',
    },
  },
  reporter: 'list',
});
