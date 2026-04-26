// Text measurement utilities for chart box sizing.
// Uses Canvas measureText API to wrap names and compute dynamic box heights.

import { formatFullName, fullNameParts, type NamePart } from '../../utils/nameUtils';
import type { PersonNode } from './types';
import { MIN_BOX_H, BOX_PAD_Y, TEXT_AREA_W } from './constants';

// Cache the canvas context to avoid recreating it on every call.
let _ctx: CanvasRenderingContext2D | null = null;

// Module-level cache so switching selectedPersonId doesn't remeasure unchanged nodes.
// Key: formatted full name (the only input that drives box height).
const _heightCache = new Map<string, number>();
// Cache wrapName results by "name|maxWidth|fontSize" — same names always produce the same wraps.
const _wrapCache = new Map<string, string[]>();

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
  const cacheKey = `${name}|${maxWidth}|${fontSize}`;
  const cached = _wrapCache.get(cacheKey);
  if (cached) return cached;

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
  _wrapCache.set(cacheKey, lines);
  return lines;
}

/**
 * Wrap a name into lines of segments, preserving the preferred-name underline marker.
 * Each line is an array of {text, underline} segments with explicit space segments
 * between tokens — render with `xml:space="preserve"` on the parent SVG text element.
 *
 * Width-wise this matches `wrapName(formatFullName(…), …)` line-count.
 */
export function wrapFullNameSegments(
  givenName: string | null,
  surname: string | null,
  preferredName: string | null,
  nickname: string | null,
  maxWidth: number,
  fontSize: number,
): NamePart[][] {
  const tokens = fullNameParts(givenName, surname, preferredName, nickname).filter(p => p.text !== ' ');
  if (tokens.length === 0) return [];

  const ctx = getCtx();
  const measureWidth = (text: string): number => {
    if (!ctx) return text.length * fontSize * 0.6;
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    return ctx.measureText(text).width;
  };

  const lines: NamePart[][] = [];
  let currentTokens: NamePart[] = [];
  let currentText = '';
  for (const token of tokens) {
    const candidate = currentText ? `${currentText} ${token.text}` : token.text;
    if (measureWidth(candidate) <= maxWidth) {
      currentTokens.push(token);
      currentText = candidate;
    } else {
      if (currentTokens.length > 0) lines.push(joinWithSpaces(currentTokens));
      currentTokens = [token];
      currentText = token.text;
    }
  }
  if (currentTokens.length > 0) lines.push(joinWithSpaces(currentTokens));
  return lines;
}

function joinWithSpaces(tokens: NamePart[]): NamePart[] {
  const result: NamePart[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) result.push({ text: ' ', underline: false });
    result.push(tokens[i]);
  }
  return result;
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
 * Compute the dynamic height for a person box based on name length.
 *
 * Height is driven entirely by name wrapping. Date lines are always reserved
 * (birth + death) so that a person missing one date doesn't produce a shorter
 * box than a peer — row connectors would otherwise land below the short box.
 *
 * Layout:
 * - BOX_PAD_Y at top
 * - Each name line: 16px (12px font + 4px gap)
 * - 2 reserved date lines: 14px each
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

  if (_heightCache.has(fullName ?? '')) return _heightCache.get(fullName ?? '')!;

  const nameLines = fullName ? wrapName(fullName, TEXT_AREA_W, 12) : [];
  const numNameLines = Math.max(1, nameLines.length);

  const textBlockH = numNameLines * 16 + 2 * 14 + 2 * BOX_PAD_Y;
  const h = Math.max(MIN_BOX_H, textBlockH);
  _heightCache.set(fullName ?? '', h);
  return h;
}
