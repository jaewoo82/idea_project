import sharp from "sharp";

export interface PixelBitmap {
  width: number;
  height: number;
  /** 1 = ink (dark), 0 = background, one byte per pixel, row-major. */
  ink: Uint8Array;
}

const MAX_DIMENSION = 1600;

/** Decodes an arbitrary raster image (PNG/JPEG/...) to a binarized ink bitmap. */
export async function decodeToBitmap(imageBytes: Uint8Array): Promise<PixelBitmap> {
  let pipeline = sharp(imageBytes).greyscale();
  const meta = await sharp(imageBytes).metadata();
  if (
    (meta.width && meta.width > MAX_DIMENSION) ||
    (meta.height && meta.height > MAX_DIMENSION)
  ) {
    pipeline = pipeline.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
    });
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const ink = new Uint8Array(info.width * info.height);
  for (let i = 0; i < ink.length; i++) {
    ink[i] = data[i] < 128 ? 1 : 0;
  }
  return { width: info.width, height: info.height, ink };
}

export interface InkBlob {
  pixelCount: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 8-connected flood-fill labeling of every ink region in the bitmap. */
export function findInkBlobs(bitmap: PixelBitmap): InkBlob[] {
  const { width, height, ink } = bitmap;
  const visited = new Uint8Array(width * height);
  const blobs: InkBlob[] = [];
  const stack: number[] = [];

  for (let start = 0; start < ink.length; start++) {
    if (ink[start] !== 1 || visited[start]) continue;

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let pixelCount = 0;

    stack.push(start);
    visited[start] = 1;

    while (stack.length > 0) {
      const idx = stack.pop() as number;
      const x = idx % width;
      const y = Math.floor(idx / width);
      pixelCount++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (ink[nIdx] === 1 && !visited[nIdx]) {
            visited[nIdx] = 1;
            stack.push(nIdx);
          }
        }
      }
    }

    blobs.push({ pixelCount, x0, y0, x1, y1 });
  }

  return blobs;
}
