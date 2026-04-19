// Text measurement utilities for chart box sizing.
// Uses Canvas measureText API to wrap names and compute dynamic box heights.

import { formatFullName } from '../../utils/nameUtils';
import type { PersonNode } from './types';
import { MIN_BOX_H, BOX_PAD_Y, TEXT_AREA_W } from './constants';

// Cache the canvas context to avoid recreating it on every call.
let _ctx: CanvasRenderingContext2D | null = null;
function getCtx(): CanvasRenderingContext2D | null {
  if (_ctx) return _ctx;
  try {
    const canvas = document.createElement('canvas');
    _ctx = canvas.getContext('2d');
    return _ctx;
  } catch {
    return null;
  }
}

/**
 * Wrap a name string into lines that fit within `maxWidth` pixels
 * using the given `fontSize` (px). Returns an array of line strings.
 *
 * Words are split on spaces; each word is added to the current line
 * until the line would exceed `maxWidth`, then a new line is started.
 */
export function wrapName(name: string, maxWidth: number, fontSize: number): string[] {
  if (!name) return [];
  const words = name.split(' ').filter(w => w.length > 0);
  if (words.length === 0) return [];

  const ctx = getCtx();

  const measureWidth = (text: string): number => {
    if (!ctx) return text.length * fontSize * 0.6; // fallback estimate
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    return ctx.measureText(text).width;
  };

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureWidth(candidate) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Truncate a single-line string to fit within `maxWidth` pixels at the given
 * `fontSize`, appending an ellipsis if truncated. Returns the original string
 * if it already fits.
 */
export function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
  if (!text) return '';
  const ctx = getCtx();
  const measureWidth = (s: string): number => {
    if (!ctx) return s.length * fontSize * 0.6;
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    return ctx.measureText(s).width;
  };
  if (measureWidth(text) <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measureWidth(text.slice(0, mid) + ellipsis) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + ellipsis;
}

/**
 * Compute the dynamic height for a person box based on name length and dates.
 *
 * Layout:
 * - BOX_PAD_Y at top
 * - Each name line: 16px (12px font + 4px gap)
 * - Each date/place line (birth, death): 14px (10px font + 4px gap)
 * - BOX_PAD_Y at bottom
 *
 * Returns at least MIN_BOX_H.
 */
export function measureBoxHeight(node: PersonNode): number {
  const fullName = formatFullName({
    given_name: node.givenName,
    surname: node.surname,
    preferred_name: node.preferredName,
    nickname: node.nickname,
  });

  const nameLines = fullName ? wrapName(fullName, TEXT_AREA_W, 12) : [];
  const numNameLines = Math.max(1, nameLines.length); // at least 1 line even for blank

  const hasBirth = !!(node.birthDate || node.birthPlace);
  const hasDeath = !!(node.deathDate || node.deathPlace);
  const numDateLines = (hasBirth ? 1 : 0) + (hasDeath ? 1 : 0);

  const textBlockH = numNameLines * 16 + numDateLines * 14 + 2 * BOX_PAD_Y;
  return Math.max(MIN_BOX_H, textBlockH);
}
