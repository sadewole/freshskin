/**
 * Client-side photo pipeline for the label scanner (PRD §12.4, §13.2).
 *
 * The API has no upload endpoint and no OCR worker yet, so this module deliberately stops at
 * the phone: it takes a video frame or an uploaded file, downsizes it to the PRD's 1280–1600px
 * long edge as JPEG (which also strips EXIF — nothing identifying ever leaves the device), and
 * runs the on-device half of the capture quality gate. The server re-verifies when it lands.
 *
 * Only the failures a phone camera can actually fix are checked here — size, exposure, glare,
 * blur — each with the specific retake copy §13.2 demands. Never "something went wrong".
 */

export type QualityCode =
  | 'IMAGE_TOO_SMALL'
  | 'IMAGE_TOO_BLURRY'
  | 'IMAGE_TOO_DARK'
  | 'IMAGE_TOO_BRIGHT'
  | 'IMAGE_GLARE';

const RETAKE_COPY: Record<QualityCode, string> = {
  IMAGE_TOO_SMALL: 'The label is too small to read. Move closer so it fills the frame.',
  IMAGE_TOO_BLURRY: 'The photo is blurry. Hold the phone steady and tap to focus.',
  IMAGE_TOO_DARK: 'This photo is too dark to read. Try again in brighter light.',
  IMAGE_TOO_BRIGHT: 'This photo is washed out. Move out of direct light and try again.',
  IMAGE_GLARE: 'There is glare on the label. Tilt the phone slightly and try again.',
};

export class QualityError extends Error {
  readonly code: QualityCode;

  constructor(code: QualityCode) {
    super(RETAKE_COPY[code]);
    this.name = 'QualityError';
    this.code = code;
  }
}

export interface ProcessedPhoto {
  /** JPEG data URL — allowed by the `img-src 'self' data:` CSP, and EXIF-free by construction. */
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  /** Approximate transfer bytes, for the future upload path. */
  readonly bytes: number;
}

/** PRD §12.4: downscaled JPEG, long edge 1280–1600px. */
const LONG_EDGE = 1600;
/** PRD §13.2: short edge below 720px is unusable. */
const SHORT_EDGE_MIN = 720;
/** Analysis runs on a small copy; the full frame is only encoded, never scanned. */
const ANALYSIS_WIDTH = 160;
/** PRD §13.2 thresholds. */
const LUMINANCE_MIN = 70;
const LUMINANCE_MAX = 200;
const LAPLACIAN_VARIANCE_MIN = 100;
const GLARE_FRACTION_MAX = 0.03;

function assess(data: ImageData): QualityCode | null {
  const { data: px, width, height } = data;
  const count = width * height;
  const gray = new Float32Array(count);
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const luminance = 0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!;
    gray[i] = luminance;
    sum += luminance;
  }
  const mean = sum / count;
  if (mean < LUMINANCE_MIN) return 'IMAGE_TOO_DARK';
  if (mean > LUMINANCE_MAX) return 'IMAGE_TOO_BRIGHT';

  // Glare: saturated pixels in the centre 60%, where the label should be.
  const x0 = Math.floor(width * 0.2);
  const x1 = Math.ceil(width * 0.8);
  const y0 = Math.floor(height * 0.2);
  const y1 = Math.ceil(height * 0.8);
  let saturated = 0;
  let centre = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      centre++;
      if (px[i]! > 250 && px[i + 1]! > 250 && px[i + 2]! > 250) saturated++;
    }
  }
  if (centre > 0 && saturated / centre > GLARE_FRACTION_MAX) return 'IMAGE_GLARE';

  // Blur: variance of the Laplacian. A sharp label has strong edges; a soft one does not.
  let lapSum = 0;
  let lapSumSq = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = y * width + x;
      const laplacian = 4 * gray[c]! - gray[c - 1]! - gray[c + 1]! - gray[c - width]! - gray[c + width]!;
      lapSum += laplacian;
      lapSumSq += laplacian * laplacian;
      lapCount++;
    }
  }
  const variance = lapSumSq / lapCount - (lapSum / lapCount) ** 2;
  if (variance < LAPLACIAN_VARIANCE_MIN) return 'IMAGE_TOO_BLURRY';

  return null;
}

/**
 * Draw the source at the PRD's capped size, run the quality gate, and return the JPEG.
 * Throws QualityError naming the specific defect; anything else is an unexpected failure.
 */
export function processFrame(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): ProcessedPhoto {
  const scale = Math.min(1, LONG_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  if (Math.min(width, height) < SHORT_EDGE_MIN) throw new QualityError('IMAGE_TOO_SMALL');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('2d canvas context is unavailable');
  ctx.drawImage(source, 0, 0, width, height);

  const probe = document.createElement('canvas');
  probe.width = ANALYSIS_WIDTH;
  probe.height = Math.max(1, Math.round((ANALYSIS_WIDTH * height) / width));
  const probeCtx = probe.getContext('2d', { willReadFrequently: true });
  if (probeCtx === null) throw new Error('2d canvas context is unavailable');
  probeCtx.drawImage(canvas, 0, 0, probe.width, probe.height);
  const failure = assess(probeCtx.getImageData(0, 0, probe.width, probe.height));
  if (failure !== null) throw new QualityError(failure);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const bytes = Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);
  return { dataUrl, width, height, bytes };
}

/** EXIF-aware decode for gallery uploads; falls back to a plain `<img>` where unsupported. */
export async function decodeFile(file: Blob): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not read that image file.'));
        el.src = url;
      });
      return {
        bitmap: await createImageBitmap(img),
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
