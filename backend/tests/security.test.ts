import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken, hashToken } from '../src/utils/auth';
import { calendarDate } from '../src/middleware/validation';
import { prepareStickerImage } from '../src/services/stickerOcr';
import { parseStickerText } from '../src/services/stickerParser';

describe('security units', () => {
  it('separates access and refresh tokens and rejects tampering', () => {
    const payload = { userId: 42, email: 'synthetic@example.invalid', role: 'doctor', sessionId: randomUUID() };
    const access = generateAccessToken(payload);
    const refresh = generateRefreshToken(payload);
    expect(verifyAccessToken(access)).toEqual(payload);
    expect(verifyRefreshToken(refresh)).toEqual(payload);
    expect(verifyAccessToken(refresh)).toBeNull();
    expect(verifyRefreshToken(access)).toBeNull();
    expect(verifyRefreshToken('not-a-token')).toBeNull();
    expect(verifyAccessToken(access + 'tampered')).toBeNull();
    expect(hashToken(refresh)).not.toEqual(hashToken(generateRefreshToken(payload)));
  });
  it.each(['2026-02-29', '2026-99-99', '2026-04-31', '', 'not-a-date', '2026-01-01T00:00:00Z'])('rejects invalid date %s', value => {
    expect(calendarDate.safeParse(value).success).toBe(false);
  });
  it('accepts real leap dates without timezone conversion', () => expect(calendarDate.parse('2024-02-29')).toBe('2024-02-29'));
  it('rejects disguised and malformed image content', async () => {
    await expect(prepareStickerImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).rejects.toMatchObject({ status: 415 });
    await expect(prepareStickerImage(Buffer.from('not an image'))).rejects.toMatchObject({ status: 415 });
  });
  it('decodes and bounds supported images with the updated native library', async () => {
    const image = await sharp({ create: { width: 100, height: 80, channels: 3, background: 'white' } }).png().toBuffer();
    const output = await prepareStickerImage(image);
    expect((await sharp(output).metadata()).format).toBe('png');
  });
  it('returns warnings for empty OCR rather than inventing an identifier', () => {
    const parsed = parseStickerText('');
    expect(parsed.patientId).toBeNull();
    expect(parsed.confidenceWarnings.length).toBeGreaterThan(0);
  });
  it('recognizes both MRN and M# labels and rejects impossible sticker dates', () => {
    expect(parseStickerText('MRN: 987654321').patientId).toBe('987654321');
    expect(parseStickerText('M# 987654321').patientId).toBe('987654321');
    expect(parseStickerText('DOB: 02/31/2026').dob).toBeNull();
  });
});