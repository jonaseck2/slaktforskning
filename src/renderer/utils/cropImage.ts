export interface RegionFrac {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SquareCropPx {
  sx: number;
  sy: number;
  size: number;
}

// Compute a square sub-rect in PIXELS, centered on the region, sized to contain
// the whole region (side = max of region's pixel width and height). For a null
// region, returns a centered square fitting the image (side = min of W, H).
// All returned values are clamped to image bounds.
export function computeSquareCropRectPx(
  region: RegionFrac | null,
  imgW: number,
  imgH: number,
): SquareCropPx {
  if (!region) {
    const size = Math.min(imgW, imgH);
    return {
      sx: (imgW - size) / 2,
      sy: (imgH - size) / 2,
      size,
    };
  }
  const rxPx = region.x * imgW;
  const ryPx = region.y * imgH;
  const rwPx = region.width * imgW;
  const rhPx = region.height * imgH;
  const cxPx = rxPx + rwPx / 2;
  const cyPx = ryPx + rhPx / 2;
  const maxDim = Math.min(imgW, imgH);
  const size = Math.min(maxDim, Math.max(rwPx, rhPx));
  const sx = Math.max(0, Math.min(imgW - size, cxPx - size / 2));
  const sy = Math.max(0, Math.min(imgH - size, cyPx - size / 2));
  return { sx, sy, size };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Set crossOrigin only when CORS actually works. file:// doesn't support
    // CORS in Chromium — setting the attribute blocks the load entirely.
    // Detect via the page origin (window.location.protocol) since relative
    // srcs like "./media/full/x.jpg" don't start with "file:" but resolve to
    // file:// URLs when the SPA is opened directly (no web server).
    const onFileOrigin = typeof window !== 'undefined' && window.location.protocol === 'file:';
    if (!onFileOrigin && !src.startsWith('file:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

// Crops `imageDataUrl` to the pixel-square derived from `region` (may be null)
// and returns a JPEG data URL at `outputSize` x `outputSize` pixels.
//
// In contexts where the canvas can't export (file:// origin taints the canvas
// because there's no CORS), we fall back to the original src so avatars still
// render — just uncropped — instead of breaking entirely.
export async function cropImageToDataUrl(
  imageDataUrl: string,
  region: RegionFrac | null,
  outputSize = 128,
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const { sx, sy, size } = computeSquareCropRectPx(region, img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  ctx.drawImage(img, sx, sy, size, size, 0, 0, outputSize, outputSize);
  try {
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return imageDataUrl;
  }
}
