// Chart layout constants — shared across pedigree, hourglass, and timeline algorithms.

export const BOX_W = 200;
export const MIN_BOX_H = 58;
/** @deprecated Use MIN_BOX_H — box height is now dynamic per node. */
export const BOX_H = MIN_BOX_H;
export const V_GAP = 24;
export const H_GAP = 70;
export const GEN_GAP = 70;
export const PAD = 10;
export const ROW_H = MIN_BOX_H + V_GAP;

// Box internal layout
export const PORTRAIT_W = 34;
export const PORTRAIT_H = 44;
export const BOX_PAD_Y = 7;
export const BOX_PAD_X_LEFT = 6;
export const PORTRAIT_GAP = 6;
export const BOX_PAD_X_RIGHT = 8;
export const CURVE_R = 12;

/** Available width for text content inside a box. */
export const TEXT_AREA_W = BOX_W - BOX_PAD_X_LEFT - PORTRAIT_W - PORTRAIT_GAP - BOX_PAD_X_RIGHT;
