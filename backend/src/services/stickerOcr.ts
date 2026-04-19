import sharp from 'sharp';
import Tesseract from 'tesseract.js';

export interface StickerOcrResult {
  text: string;
}

export async function processStickerImage(buffer: Buffer): Promise<StickerOcrResult> {
  const metadata = await sharp(buffer).metadata();
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

  let pipeline = sharp(buffer).rotate();
  if (extractRegion) {
    pipeline = pipeline.extract(extractRegion);
  }

  const processedImage = await pipeline
    .grayscale()
    .normalize()
    .linear(1.25, -(255 * 0.12))
    .threshold(170)
    .sharpen()
    .png()
    .toBuffer();

  const result = await Tesseract.recognize(processedImage, 'eng', {
    logger: () => undefined,
  });

  return {
    text: result.data.text || '',
  };
}