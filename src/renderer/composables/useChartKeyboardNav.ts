/**
 * Shared keyboard navigation for the three family-tree charts (Pedigree,
 * Hourglass, Descendant). All three render their boxes through ChartCanvas,
 * which emits `box-keydown` from each focusable box <g>. Each chart wires that
 * event to `onBoxKeydown` below with its own `orientation`, so a keyboard /
 * screen-reader user moves box focus along the tree the SAME way everywhere —
 * arrow keys always follow the chart's natural spatial orientation.
 *
 * Orientation → axis mapping (user-approved, LOCKED):
 *
 *   Pedigree   (focal left, ancestors right):
 *     ArrowRight = toward ancestors (next generation away from focal)
 *     ArrowLeft  = toward focal
 *     ArrowUp/Down = previous / next sibling in the same generation
 *
 *   Hourglass  (focal center, ancestors up, descendants down):
 *     ArrowUp    = toward ancestors
 *     ArrowDown  = toward descendants
 *     ArrowLeft/Right = previous / next box on the same row (spouse / sibling)
 *
 *   Descendant (focal top, descendants down):
 *     ArrowDown  = toward descendants
 *     ArrowUp    = toward focal
 *     ArrowLeft/Right = previous / next sibling on the same row
 *
 * Pure except for the focus() side-effect: it resolves the target box by box
 * geometry (x / y) and focuses that box's element. No DB, no layout recompute.
 */

import { BOX_W, H_GAP, PAD } from '../utils/chart-layout';
import type { BoxLayout } from '../utils/chart-layout';

export type ChartOrientation = 'pedigree' | 'hourglass' | 'descendant';

export interface ChartKeyboardNavOptions {
  boxes: BoxLayout[];
  orientation: ChartOrientation;
  scrollEl: HTMLElement | null;
  onActivate: (id: string) => void;
}

/**
 * Which spatial direction along the generation/cross axes each arrow maps to,
 * per orientation. `gen` moves along the primary (generation) axis; `cross`
 * moves along the sibling/spouse axis. The sign is +1 / -1 along that axis.
 *
 *   - Pedigree primary axis = x (horizontal); cross axis = y (vertical).
 *   - Hourglass / Descendant primary axis = y (vertical); cross axis = x.
 */
type Move =
  | { kind: 'gen'; dir: 1 | -1 }
  | { kind: 'cross'; dir: 1 | -1 };

function resolveMove(orientation: ChartOrientation, key: string): Move | null {
  switch (orientation) {
    case 'pedigree':
      // Generation axis = x. Right = away from focal (+1 gen). Left = toward focal.
      // Cross axis = y. Down = next sibling, Up = previous sibling.
      if (key === 'ArrowRight') return { kind: 'gen', dir: 1 };
      if (key === 'ArrowLeft') return { kind: 'gen', dir: -1 };
      if (key === 'ArrowDown') return { kind: 'cross', dir: 1 };
      if (key === 'ArrowUp') return { kind: 'cross', dir: -1 };
      return null;
    case 'hourglass':
      // Generation axis = y. Up = toward ancestors (-1 gen, smaller y).
      // Down = toward descendants (+1 gen, larger y). Cross axis = x.
      if (key === 'ArrowUp') return { kind: 'gen', dir: -1 };
      if (key === 'ArrowDown') return { kind: 'gen', dir: 1 };
      if (key === 'ArrowRight') return { kind: 'cross', dir: 1 };
      if (key === 'ArrowLeft') return { kind: 'cross', dir: -1 };
      return null;
    case 'descendant':
      // Generation axis = y. Down = toward descendants (+1 gen). Up = toward focal.
      // Cross axis = x.
      if (key === 'ArrowDown') return { kind: 'gen', dir: 1 };
      if (key === 'ArrowUp') return { kind: 'gen', dir: -1 };
      if (key === 'ArrowRight') return { kind: 'cross', dir: 1 };
      if (key === 'ArrowLeft') return { kind: 'cross', dir: -1 };
      return null;
  }
}

/**
 * Generation banding. Pedigree generations sit at fixed x columns
 * (`PAD + g*(BOX_W + H_GAP)`), so a box's generation is read straight off its
 * x — this matches PedigreeChart's original `generationOf` exactly, keeping the
 * reference behavior intact.
 *
 * Vertical charts (Hourglass, Descendant) lay rows out at *variable* heights —
 * each generation row is as tall as its tallest box plus a gap, and Hourglass
 * even places ancestors at negative y. A fixed pitch can't band those rows. So
 * for vertical orientations we cluster the boxes' own y-coordinates into rows:
 * boxes whose top y are within `ROW_TOLERANCE` share a generation. The band
 * index increases downward (toward descendants), so +1 = a row below, which is
 * what the orientation→axis mapping expects.
 */
const ROW_TOLERANCE = 24; // px — boxes within this y-span are the same row

interface GenIndex {
  of: (box: BoxLayout) => number;
}

function buildGenIndex(boxes: BoxLayout[], orientation: ChartOrientation): GenIndex {
  if (orientation === 'pedigree') {
    return { of: (box) => Math.round((box.x - PAD) / (BOX_W + H_GAP)) };
  }
  // Cluster unique row y-values into bands, ascending (top → bottom).
  const ys = boxes.map((b) => b.y).sort((a, b) => a - b);
  const bandStarts: number[] = [];
  for (const y of ys) {
    const last = bandStarts[bandStarts.length - 1];
    if (last === undefined || y - last > ROW_TOLERANCE) bandStarts.push(y);
  }
  return {
    of: (box) => {
      // Nearest band start (handles the small per-box height jitter).
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < bandStarts.length; i++) {
        const d = Math.abs(box.y - bandStarts[i]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    },
  };
}

/** Coordinate of a box on the cross (sibling/spouse) axis. */
function crossCoord(box: BoxLayout, orientation: ChartOrientation): number {
  return orientation === 'pedigree' ? box.y : box.x;
}

/**
 * Resolve the target box for a generation step: among boxes whose generation
 * differs by exactly `dir`, pick the one nearest to the current box on the
 * cross axis.
 */
function findGenerationTarget(
  box: BoxLayout,
  boxes: BoxLayout[],
  orientation: ChartOrientation,
  gen: GenIndex,
  dir: 1 | -1,
): BoxLayout | null {
  const targetGen = gen.of(box) + dir;
  const cross = crossCoord(box, orientation);
  let best: BoxLayout | null = null;
  let bestDist = Infinity;
  for (const b of boxes) {
    if (b.person.id === box.person.id) continue;
    if (gen.of(b) !== targetGen) continue;
    const dist = Math.abs(crossCoord(b, orientation) - cross);
    if (dist < bestDist) {
      bestDist = dist;
      best = b;
    }
  }
  return best;
}

/**
 * Resolve the target box for a sibling step: among boxes at the SAME
 * generation, ordered by cross-axis coordinate, pick the immediate neighbor in
 * direction `dir`.
 */
function findSiblingTarget(
  box: BoxLayout,
  boxes: BoxLayout[],
  orientation: ChartOrientation,
  gen: GenIndex,
  dir: 1 | -1,
): BoxLayout | null {
  const myGen = gen.of(box);
  const cross = crossCoord(box, orientation);
  let best: BoxLayout | null = null;
  let bestDist = Infinity;
  for (const b of boxes) {
    if (b.person.id === box.person.id) continue;
    if (gen.of(b) !== myGen) continue;
    const bCross = crossCoord(b, orientation);
    // Must be strictly in the requested direction along the cross axis.
    if (dir === 1 ? bCross <= cross : bCross >= cross) continue;
    const dist = Math.abs(bCross - cross);
    if (dist < bestDist) {
      bestDist = dist;
      best = b;
    }
  }
  return best;
}

/**
 * Handle a keydown bubbled up from a chart box. Enter/Space activate (navigate);
 * arrow keys move box focus along the tree per orientation. Only calls
 * `preventDefault()` when it actually handles the key.
 */
export function onBoxKeydown(
  event: KeyboardEvent,
  box: BoxLayout,
  opts: ChartKeyboardNavOptions,
): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    opts.onActivate(box.person.id);
    return;
  }

  const move = resolveMove(opts.orientation, event.key);
  if (!move) return;

  const gen = buildGenIndex(opts.boxes, opts.orientation);
  const target =
    move.kind === 'gen'
      ? findGenerationTarget(box, opts.boxes, opts.orientation, gen, move.dir)
      : findSiblingTarget(box, opts.boxes, opts.orientation, gen, move.dir);

  if (!target) return;

  event.preventDefault();
  const el = opts.scrollEl?.querySelector(
    `[data-testid="person-box-${target.person.id}"]`,
  ) as HTMLElement | null;
  el?.focus();
}
