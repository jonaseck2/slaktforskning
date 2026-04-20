export interface RegionFrac {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SquareCrop {
  x: number;
  y: number;
  size: number;
}

export function computeSquareCropRect(region: RegionFrac | null): SquareCrop {
  if (!region) {
    return { x: 0, y: 0, size: 1 };
  }
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;
  const size = Math.min(1, Math.max(region.width, region.height));
  const maxX = Math.max(0, 1 - size);
  const maxY = Math.max(0, 1 - size);
  const x = Math.max(0, Math.min(maxX, cx - size / 2));
  const y = Math.max(0, Math.min(maxY, cy - size / 2));
  return { x, y, size };
}

// Loads a data URL into an HTMLImageElement. Resolves once decoded.
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

// Crops `imageDataUrl` to the square crop derived from `region` (may be null) and
// returns a JPEG data URL at `outputSize` x `outputSize` pixels.
export async function cropImageToDataUrl(
  imageDataUrl: string,
  region: RegionFrac | null,
  outputSize = 128,
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const crop = computeSquareCropRect(region);
  const sx = crop.x * img.naturalWidth;
  const sy = crop.y * img.naturalHeight;
  const srcSize = Math.min(crop.size * img.naturalWidth, crop.size * img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  ctx.drawImage(
    img,
    sx, sy, srcSize, srcSize,
    0, 0, outputSize, outputSize,
  );
  return canvas.toDataURL('image/jpeg', 0.85);
}
