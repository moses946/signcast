import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: 'http://localhost:3000/healthz',
    reuseExistingServer: false,
    env: {
      PORT: '3000',
      PUBLIC_BASE_URL: 'http://localhost:3000',
      MOCK_PROVIDERS: 'true',
      NODE_ENV: 'test',
    },
  },
  reporter: 'list',
});
