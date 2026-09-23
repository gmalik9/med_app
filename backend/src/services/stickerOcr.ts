import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

export interface StickerOcrResult {
  text: string;
}

let busy = false;
const imageOptions = { limitInputPixels: 12000000, failOn: 'warning' as const };

export async function prepareStickerImage(buffer: Buffer) {
  let metadata;
  try { metadata = await sharp(buffer, imageOptions).metadata(); }
  catch { throw Object.assign(new Error('Invalid image'), { status: 415 }); }
  if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) {
    throw Object.assign(new Error('Unsupported image'), { status: 415 });
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const extractRegion =
    width > 0 && height > 0
      ? {
          left: Math.max(Math.floor(width * 0.08), 0),
          top: Math.max(Math.floor(height * 0.12), 0),
          width: Math.max(Math.floor(width * 0.84), 1),
          height: Math.max(Math.floor(height * 0.76), 1),
        }
      : null;

  let pipeline = sharp(buffer, imageOptions);
  if (extractRegion) {
    pipeline = pipeline.extract(extractRegion);
  }

  return pipeline.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .normalize()
    .linear(1.25, -(255 * 0.12))
    .threshold(170)
    .sharpen()
    .png()
    .toBuffer();

}

export async function processStickerImage(buffer: Buffer): Promise<StickerOcrResult> {
  if (busy) throw Object.assign(new Error('OCR busy'), { status: 503 });
  busy = true;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  let work: Promise<StickerOcrResult> | undefined;
  try {
    work = (async () => {
      const image = await prepareStickerImage(buffer);
      worker = await createWorker('eng', 1, { logger: () => undefined, cacheMethod: 'none' });
      if (expired) { await worker.terminate(); throw new Error('OCR timed out'); }
      const result = await worker.recognize(image);
      return { text: result.data.text || '' };
    })();
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { expired = true; reject(Object.assign(new Error('OCR timed out'), { status: 503 })); }, 25000);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
    if (worker) {
      await worker.terminate();
      busy = false;
    } else if (expired && work) {
      // Keep the slot occupied until a late-initializing worker terminates.
      void work.then(() => { busy = false; }, () => { busy = false; });
    } else {
      busy = false;
    }
  }
}