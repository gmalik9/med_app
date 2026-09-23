import { test, expect } from '@playwright/test';
import { runQa } from './vosk-browser-qa.mjs';

test('real deployed Vosk native fake-mic acceptance (synthetic only)', async ({}, testInfo) => {
  const qa = testInfo.config.metadata.voskQa;
  let receipt;
  try {
    receipt = await runQa({ capture: qa.capture, evidenceDir: qa.output, origin: qa.origin });
  } catch {
    throw new Error('V3 configuration/evidence failure; raw errors suppressed.');
  }
  // Default and failure runs retain no screenshots/receipt/snapshots.
  expect(receipt.passed, `V3 stopped at ${receipt.stage}; inspect count-only diagnostics`).toBe(true);
  expect(receipt.cases).toHaveLength(9);
  expect(receipt.cases.every(result => result.passed)).toBe(true);
  expect(receipt.screenshots).toHaveLength(qa.capture ? 3 : 0);
  expect(Boolean(receipt.receipt)).toBe(qa.capture);
  if (qa.capture) expect(receipt.evidenceDirectory === qa.output).toBe(true);
});
