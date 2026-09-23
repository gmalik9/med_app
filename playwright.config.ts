import { defineConfig } from '@playwright/test';

// Never keep automatic DOM snapshots, credentials, traces, videos or HTTP logs.
// Evidence is explicitly asserted and opt-in inside the synthetic-only specs.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
export default defineConfig({
  testDir: './tests/e2e', workers: 1, fullyParallel: false, timeout: 60000,
  retries: 0, forbidOnly: true, preserveOutput: 'never',
  reporter: [['./tests/evidence-reporter.mjs']],
  use: {
    baseURL: 'http://127.0.0.1:5179', channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true, trace: 'off', screenshot: 'off', video: 'off',
    viewport: { width: 1440, height: 1100 }, locale: 'en-US', timezoneId: 'UTC',
    serviceWorkers: 'block',
  },
  webServer: [
    { command: 'node tests/start-test-server.mjs', url: 'http://127.0.0.1:5059/ready', reuseExistingServer: false, stdout: 'ignore', stderr: 'ignore', gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 } },
    // Vite preview inherits server.proxy. No dev-source/HMR screenshots.
    { command: 'npm exec --workspace=frontend -- vite preview --host 127.0.0.1 --port 5179 --strictPort', url: 'http://127.0.0.1:5179', env: { VITE_DEV_API_PROXY: 'http://127.0.0.1:5059', VITE_API_URL: '' }, reuseExistingServer: false, stdout: 'ignore', stderr: 'ignore', gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 } },
  ],
});
