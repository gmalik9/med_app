import { defineConfig } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { settings } from './vosk-browser-settings.mjs';

// Playwright deletes a CLI --output directory before workers start. Reject the
// override here, before that cleanup can destroy even a no-capture receipt.
assert.ok(!process.argv.some(arg => arg === '--output' || arg.startsWith('--output=')),
  'Playwright output override disabled; use VOSK_EVIDENCE_DIR for fresh capture');
const qa = settings();
export default defineConfig({
  testDir: '.', testMatch: 'vosk-browser.spec.mjs', fullyParallel: false, workers: 1,
  retries: 0, timeout: 360000, forbidOnly: true,
  // Serialized by Playwright into its worker; never rely on loader-hook state.
  metadata: { voskQa: qa },
  // Playwright cleans outputDir. NEVER point it at committed proof/receipts.
  reporter: [['line']], outputDir: resolve(tmpdir(), `medapp-vosk-playwright-${randomUUID()}`),
  use: { baseURL: qa.origin, channel: 'chrome', headless: true,
    screenshot: 'off', trace: 'off', video: 'off' },
  preserveOutput: 'never',
  // Intentionally no webServer, global DB setup, source build or service teardown.
});
