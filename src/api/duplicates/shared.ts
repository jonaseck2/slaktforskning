/**
 * Shared dedup helpers used by more than one entity (places, sources, media).
 *
 * Per-entity normalisation lives in the per-entity files — only string-distance
 * machinery and similar pure helpers belong here.
 */

/**
 * Levenshtein edit distance. Pure function; used to fuzz-match names/titles
 * (e.g. "Stockholm " vs "Stockholm" — one whitespace = distance 1; "Stocholm"
 * vs "Stockholm" — one missing letter = distance 1).
 *
 * O(m·n) time, O(min(m,n)) memory. Adequate for place names, source titles,
 * and media titles.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Make sure `a` is the shorter string so the row buffer stays small.
  if (a.length > b.length) { const tmp = a; a = b; b = tmp; }
  let prev = new Array<number>(a.length + 1);
  let curr = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;
  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}
