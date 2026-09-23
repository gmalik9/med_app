// Offline synthetic voice only. Generated audio stays outside the repository.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function generateSyntheticAudio() {
  assert.equal(process.platform, 'darwin', 'This fixture requires offline macOS say and afconvert');
  const directory = await mkdtemp(join(tmpdir(), 'medapp-vosk-synthetic-'));
  const phrase = 'one two three four five';
  execFileSync('/usr/bin/say', ['-v', 'Rishi', '-r', '125', '-o', join(directory, 'speech.aiff'), phrase], { stdio: 'ignore' });
  execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', join(directory, 'speech.aiff'), join(directory, 'speech.wav')], { stdio: 'ignore' });
  const source = await readFile(join(directory, 'speech.wav'));
  assert.equal(source.toString('ascii', 0, 4), 'RIFF');
  let pcm;
  for (let offset = 12; offset + 8 <= source.length;) {
    const kind = source.toString('ascii', offset, offset + 4);
    const length = source.readUInt32LE(offset + 4);
    if (kind === 'fmt ') {
      assert.equal(source.readUInt16LE(offset + 8), 1);
      assert.equal(source.readUInt16LE(offset + 10), 1);
      assert.equal(source.readUInt32LE(offset + 12), 48000);
      assert.equal(source.readUInt16LE(offset + 22), 16);
    }
    if (kind === 'data') pcm = source.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + (length % 2);
  }
  assert.ok(pcm?.length > 48000);
  // Loading may consume the first virtual microphone frames; silence gives the
  // cold real model time to initialize. Chrome loops this synthetic WAV.
  const data = Buffer.concat([Buffer.alloc(48000 * 2 * 8), pcm, Buffer.alloc(48000 * 2 * 4)]);
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(data.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48000, 24); header.writeUInt32LE(96000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  const wav = Buffer.concat([header, data]);
  const path = join(directory, 'virtual-microphone.wav');
  await writeFile(path, wav, { mode: 0o600 });
  return { path, directory, phrase, voice: 'Rishi (en_IN)', sampleRate: 48000,
    durationSeconds: data.length / 96000, sha256: createHash('sha256').update(wav).digest('hex') };
}
