// src/api/chart-export.ts
// Paper size/orientation utilities and SVG tiling helpers for chart export.

export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'custom';
export type Orientation = 'portrait' | 'landscape';
export type ColorMode = 'themed' | 'bw' | 'sex-colored';

export interface PaperConfig {
  paperSize: PaperSize;
  orientation: Orientation;
  customWidth?: number;  // mm, required when paperSize === 'custom'
  customHeight?: number; // mm, required when paperSize === 'custom'
}

/** Paper sizes in mm */
export const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
};

export const MM_TO_PX = 3.7795275591; // 1mm = 3.78px at 96dpi

/** Get effective paper dimensions in mm, accounting for orientation. */
export function getPaperDimensions(cfg: PaperConfig): { width: number; height: number } {
  const base = cfg.paperSize === 'custom'
    ? { width: cfg.customWidth ?? 420, height: cfg.customHeight ?? 594 }
    : PAPER_SIZES[cfg.paperSize] ?? PAPER_SIZES.A2;
  return cfg.orientation === 'landscape'
    ? { width: base.height, height: base.width }
    : base;
}

