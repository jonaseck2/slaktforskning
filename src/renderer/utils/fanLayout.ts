// src/renderer/utils/fanLayout.ts
// Pure layout algorithm for the configurable-arc fan chart. No DOM, no IPC.

import type { PedigreeTree, PersonNode } from './chart-layout';

export type ArcSpan = 180 | 210 | 240 | 270 | 360;

export interface FanSegment {
  ahnNum: number;
  generation: number;
  person: PersonNode | null;
  pathD: string;           // SVG path for the arc segment (empty for focal)
  focalPathD: string;      // SVG path for focal half-circle (empty for non-focal)
  textPathD: string;       // arc path for surname textPath
  textPathGivenD: string;  // arc path for given name textPath
  textPathBirthD: string;  // arc path for birth date textPath
  textPathDeathD: string;  // arc path for death date textPath
  fill: string;
  textX: number;
  textY: number;
  textAngle: number;       // tangential rotation for straight text
  midAngle: number;        // segment midpoint angle in degrees
  sweepDeg: number;        // angular width of this segment
  isEmpty: boolean;
  isFocal: boolean;
}

export interface FanLayoutOptions {
  arcSpan?: ArcSpan;   // default 180
  maxGen?: number;      // default 6, range 1-8
}

// Ring depths — wider than circle chart because fan has more angular space
const RING_DEPTHS = [50, 55, 60, 55, 50, 48, 42, 36, 30];
// Gap between rings
const RING_GAP = 2;

function computeRings(maxGen: number): Array<{ rInner: number; rOuter: number }> {
  const rings: Array<{ rInner: number; rOuter: number }> = [];
  let r = 0;
  for (let g = 0; g <= maxGen; g++) {
    const depth = RING_DEPTHS[g] ?? 28;
    rings.push({ rInner: r, rOuter: r + depth });
    r += depth + RING_GAP;
  }
  return rings;
}

/** Returns the outer radius for a given number of generations. */
export function fanOuterRadius(maxGen: number): number {
  const rings = computeRings(maxGen);
  return rings[Math.min(maxGen, rings.length - 1)].rOuter;
}

/**
 * Compute the SVG viewBox dimensions for the fan chart.
 * For arcs < 360°, the chart is a half/partial circle anchored at bottom center.
 * Returns { width, height, cx, cy } where (cx, cy) is the focal center point.
 */
export function fanViewBox(arcSpan: ArcSpan, maxGen: number): { width: number; height: number; cx: number; cy: number } {
  const outerR = fanOuterRadius(maxGen);
  const pad = 16;

  if (arcSpan === 360) {
    const size = (outerR + pad) * 2;
    return { width: size, height: size, cx: outerR + pad, cy: outerR + pad };
  }

  // For partial arcs, the focal person sits at bottom center.
  // The arc extends from startAngle to endAngle (measured from 12 o'clock = -90°).
  // For 180°: arc from -180° to 0° (left to right), focal at bottom.
  const halfSpan = arcSpan / 2;
  const startAngle = -90 - halfSpan;
  const endAngle = -90 + halfSpan;

  // Compute bounding box of the arc
  const toRad = (d: number) => (d * Math.PI) / 180;
  const extremeAngles = [startAngle, endAngle];
  // Check if cardinal directions fall within the arc
  for (const cardinal of [-180, -90, 0, 90]) {
    if (cardinal >= startAngle && cardinal <= endAngle) extremeAngles.push(cardinal);
  }

  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const angle of extremeAngles) {
    const x = outerR * Math.cos(toRad(angle));
    const y = outerR * Math.sin(toRad(angle));
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  // Focal circle protrudes below center
  const focalR = RING_DEPTHS[0];
  maxY = Math.max(maxY, focalR);

  const width = (maxX - minX) + pad * 2;
  const height = (maxY - minY) + pad * 2;
  const cx = -minX + pad;
  const cy = -minY + pad;

  return { width, height, cx, cy };
}

const BRANCH_BASE: readonly string[] = [
  '#6a9cc0', // paternal grandfather (slate blue)
  '#6aaa78', // paternal grandmother (sage green)
  '#c07848', // maternal grandfather (terracotta)
  '#a078b0', // maternal grandmother (dusty mauve)
];

function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.min(255, Math.round(r + (255 - r) * amount));
  const lg = Math.min(255, Math.round(g + (255 - g) * amount));
  const lb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

function computeFill(ahnNum: number, gen: number, isEmpty: boolean): string {
  let base: string;
  if (gen === 0) {
    base = '#2c3e50';
  } else if (gen === 1) {
    base = ahnNum === 2 ? '#5888b0' : '#b07860';
  } else {
    const rootAhn = ahnNum >> (gen - 2);
    const branchIdx = rootAhn - 4;
    base = lightenHex(BRANCH_BASE[branchIdx] ?? '#cccccc', (gen - 2) * 0.07);
  }
  return isEmpty ? lightenHex(base, 0.55) : base;
}

function toRad(deg: number): number { return (deg * Math.PI) / 180; }
function fmt(n: number): string { return n.toFixed(3); }

function arcXY(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  return [
    cx + r * Math.cos(toRad(angleDeg)),
    cy + r * Math.sin(toRad(angleDeg)),
  ];
}

function buildArcPath(cx: number, cy: number, rInner: number, rOuter: number, startDeg: number, endDeg: number): string {
  const sweep = endDeg - startDeg;
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
  const [ox1, oy1] = arcXY(cx, cy, rOuter, startDeg);
  const [ox2, oy2] = arcXY(cx, cy, rOuter, endDeg);

  if (rInner === 0) {
    return `M ${fmt(cx)},${fmt(cy)} L ${fmt(ox1)},${fmt(oy1)} A ${fmt(rOuter)},${fmt(rOuter)} 0 ${largeArc},1 ${fmt(ox2)},${fmt(oy2)} Z`;
  }

  const [ix1, iy1] = arcXY(cx, cy, rInner, startDeg);
  const [ix2, iy2] = arcXY(cx, cy, rInner, endDeg);
  return [
    `M ${fmt(ix1)},${fmt(iy1)}`,
    `L ${fmt(ox1)},${fmt(oy1)}`,
    `A ${fmt(rOuter)},${fmt(rOuter)} 0 ${largeArc},1 ${fmt(ox2)},${fmt(oy2)}`,
    `L ${fmt(ix2)},${fmt(iy2)}`,
    `A ${fmt(rInner)},${fmt(rInner)} 0 ${largeArc},0 ${fmt(ix1)},${fmt(iy1)}`,
    'Z',
  ].join(' ');
}

function buildFocalPath(cx: number, cy: number, r: number, arcSpan: ArcSpan): string {
  if (arcSpan === 360) {
    // Full circle — rendered as <circle> in SVG, but provide path fallback
    return '';
  }
  // Half-circle (or partial) at bottom: flat edge at top, arc below
  const halfSpan = arcSpan / 2;
  const startDeg = -90 - halfSpan;
  const endDeg = -90 + halfSpan;
  // Actually for the focal, we want it to bulge downward (toward the viewer).
  // The arc from startDeg to endDeg goes upward (toward ancestors).
  // The focal "cap" should be a semicircle on the bottom side.
  // We draw: line from inner arc start to inner arc end (straight across),
  // then arc below back to start.
  const [x1, y1] = arcXY(cx, cy, r, startDeg);
  const [x2, y2] = arcXY(cx, cy, r, endDeg);
  // Draw the lower semicircle: from endDeg, arc through bottom back to startDeg
  const lowerStartDeg = endDeg;
  const lowerEndDeg = startDeg + 360;
  const lowerSweep = lowerEndDeg - lowerStartDeg;
  const lowerLarge = lowerSweep > 180 ? 1 : 0;
  return [
    `M ${fmt(x1)},${fmt(y1)}`,
    `A ${fmt(r)},${fmt(r)} 0 ${lowerLarge},1 ${fmt(x2)},${fmt(y2)}`,
    `A ${fmt(r)},${fmt(r)} 0 0,1 ${fmt(x1)},${fmt(y1)}`,
    'Z',
  ].join(' ');
}

export function computeFanLayout(tree: PedigreeTree, options: FanLayoutOptions = {}): FanSegment[] {
  const arcSpan: ArcSpan = options.arcSpan ?? 180;
  const maxGen = Math.max(1, Math.min(options.maxGen ?? 6, 8));
  const rings = computeRings(maxGen);
  const { cx, cy } = fanViewBox(arcSpan, maxGen);

  const segments: FanSegment[] = [];

  // Arc starts at -90 - halfSpan (pointing up-left) and ends at -90 + halfSpan (up-right)
  // This places the focal person at the bottom and ancestors fan upward.
  const halfSpan = arcSpan / 2;
  const arcStart = -90 - halfSpan; // e.g. -180 for 180° span
  const arcEnd = -90 + halfSpan;   // e.g. 0 for 180° span

  for (let gen = 0; gen <= maxGen; gen++) {
    const count = Math.pow(2, gen);
    const firstAhn = Math.pow(2, gen);
    const sweepDeg = arcSpan / count;
    const { rInner, rOuter } = rings[gen];

    for (let pos = 0; pos < count; pos++) {
      const ahnNum = firstAhn + pos;
      const startDeg = arcStart + pos * sweepDeg;
      const endDeg = startDeg + sweepDeg;
      const midDeg = startDeg + sweepDeg / 2;

      const person = tree.nodes.get(ahnNum) ?? null;
      const isEmpty = person === null;
      const isFocal = gen === 0;

      const fill = computeFill(ahnNum, gen, isEmpty);

      let pathD = '';
      let focalPathD = '';

      if (isFocal) {
        focalPathD = buildFocalPath(cx, cy, rOuter, arcSpan);
      } else {
        pathD = buildArcPath(cx, cy, rInner, rOuter, startDeg, endDeg);
      }

      const rMid = (rInner + rOuter) / 2;
      const [textX, textY] = arcXY(cx, cy, rMid, midDeg);

      // Text angle: tangential to the arc, flipped so text is always readable
      const tangentialBase = midDeg + 90;
      const normT = ((tangentialBase % 360) + 360) % 360;
      const flip = normT > 90 && normT <= 270;
      const textAngle = tangentialBase + (flip ? 180 : 0);

      // Text paths for curved text along arcs
      const textStartDeg = startDeg;
      const textEndDeg = endDeg;
      const largeArcMid = sweepDeg > 180 ? 1 : 0;
      // Determine if text should read left-to-right along the arc
      const inUpperHalf = Math.sin(toRad(midDeg)) < 0;

      function arcPath(r: number): string {
        const [p1x, p1y] = arcXY(cx, cy, r, textStartDeg);
        const [p2x, p2y] = arcXY(cx, cy, r, textEndDeg);
        return inUpperHalf
          ? `M ${fmt(p1x)},${fmt(p1y)} A ${fmt(r)},${fmt(r)} 0 ${largeArcMid},1 ${fmt(p2x)},${fmt(p2y)}`
          : `M ${fmt(p2x)},${fmt(p2y)} A ${fmt(r)},${fmt(r)} 0 ${largeArcMid},0 ${fmt(p1x)},${fmt(p1y)}`;
      }

      // 4 text lines stacked radially: given (outer), surname, birth, death (inner)
      const rGiven   = inUpperHalf ? rMid + 8  : rMid - 8;
      const rSurname = inUpperHalf ? rMid - 2  : rMid + 2;
      const rBirth   = inUpperHalf ? rMid - 12 : rMid + 12;
      const rDeath   = inUpperHalf ? rMid - 21 : rMid + 21;

      const textPathGivenD = isFocal ? '' : arcPath(rGiven);
      const textPathD      = isFocal ? '' : arcPath(rSurname);
      const textPathBirthD = isFocal ? '' : arcPath(rBirth);
      const textPathDeathD = isFocal ? '' : arcPath(rDeath);

      segments.push({
        ahnNum, generation: gen, person, pathD, focalPathD,
        textPathGivenD, textPathD, textPathBirthD, textPathDeathD,
        fill, textX, textY, textAngle, midAngle: midDeg, sweepDeg,
        isEmpty, isFocal,
      });
    }
  }

  // suppress unused variable warning for arcEnd
  void arcEnd;

  return segments;
}
