// Screenshot bytes remain in memory until ALL real synthetic scenarios pass.
// Preview/default runs have zero screenshot or evidence filesystem write calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { evidencePath } from './vosk-browser-settings.mjs';

export async function assertFreshEvidenceDirectory(output) {
  const { base } = evidencePath(output);
  const baseStat = await fs.lstat(base);
  assert.ok(baseStat.isDirectory() || (base === '/tmp' && baseStat.isSymbolicLink()), 'Unsafe evidence base');
  // /tmp itself may be a platform alias. No symlink BELOW the allowed base is
  // accepted, even if it points back inside the workspace. Parent must exist.
  const parts = relative(base, dirname(output)).split('/').filter(Boolean);
  let parent = base;
  for (const part of parts) {
    parent = resolve(parent, part);
    const stat = await fs.lstat(parent);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Unsafe evidence parent');
  }
  const stat = await fs.lstat(output).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw new Error('Cannot inspect evidence directory');
  });
  assert.equal(stat, null, 'Evidence directory must be fresh; never replace prior proof');
}

export async function captureFrame({ capture, page, name, caption, assertion }) {
  await assertion();
  assert.equal(await page.locator('input[type="password"]').evaluateAll(inputs => inputs.some(input => input.value.length)), false);
  if (!capture) return null;
  assert.ok(/^vosk-0[123]-[a-z-]+$/.test(name), 'Invalid screenshot name');
  await page.evaluate(caption => {
    const banner = document.createElement('div'); banner.id = 'vosk-synthetic-caption';
    banner.textContent = `SYNTHETIC AUDIO / TEST DATA ONLY — ${caption}`;
    Object.assign(banner.style, { position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647',
      padding: '10px', background: '#142b40', color: '#fff', font: 'bold 14px system-ui', textAlign: 'center' });
    document.body.appendChild(banner);
  }, caption);
  try {
    await page.getByRole('region', { name: 'Local note dictation' }).scrollIntoViewIfNeeded();
    const bytes = await page.screenshot({ animations: 'disabled' }); // NO path / implicit file write
    return { bytes, path: `${name}.png`, caption,
      sha256: createHash('sha256').update(bytes).digest('hex'), at: new Date().toISOString() };
  } finally {
    await page.locator('#vosk-synthetic-caption').evaluate(element => element.remove());
  }
}

export async function writeEvidence({ capture, output, report, frames }, io = fs) {
  if (!capture) return null;
  assert.equal(report.passed, true, 'Failed runs cannot publish proof');
  assert.equal(report.cases.length, 9);
  assert.ok(report.cases.every(result => result.passed === true));
  assert.ok(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(report.started), 'Invalid receipt timestamp');
  assert.equal(frames.length, 3);
  assert.equal(new Set(frames.map(frame => frame.path)).size, 3);
  for (const frame of frames) {
    assert.ok(/^vosk-0[123]-[a-z-]+\.png$/.test(frame.path));
    assert.equal(createHash('sha256').update(frame.bytes).digest('hex'), frame.sha256);
  }
  await assertFreshEvidenceDirectory(output);
  // Exclusive leaf reservation + exclusive files. A concurrent/existing run is
  // an error, never a reason to overwrite or clean someone else's directory.
  await io.mkdir(output, { mode: 0o700 });
  for (const frame of frames) await io.writeFile(resolve(output, frame.path), frame.bytes, { flag: 'wx', mode: 0o600 });
  report.evidenceDirectory = output;
  report.screenshots = frames.map(({ path, caption, sha256, at }) => ({ path, caption, sha256, at }));
  report.receipt = `receipt-${report.started.replaceAll(':', '-')}.json`;
  await io.writeFile(resolve(output, report.receipt), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return report.receipt;
}
