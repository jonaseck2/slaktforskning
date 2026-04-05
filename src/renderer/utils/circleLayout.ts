// Pure layout algorithm for the 360° circle chart. No DOM, no IPC.

import type { PedigreeTree, PersonNode } from './chartLayout';

export const CIRCLE_CX = 400;
export const CIRCLE_CY = 400;
export const CIRCLE_SVG_SIZE = 800;

// Rings 5-6 are deeper than 1-4 because gen5+ text is rotated 90° (radial)
// and needs the extra radial depth to display full name + dates.
const RINGS: Array<{ rInner: number; rOuter: number }> = [
  { rInner: 0,   rOuter: 50  },
  { rInner: 50,  rOuter: 105 },
  { rInner: 105, rOuter: 165 },
  { rInner: 165, rOuter: 220 },
  { rInner: 220, rOuter: 268 },
  { rInner: 268, rOuter: 336 },  // Gen 5: 68px deep (was 42)
  { rInner: 336, rOuter: 394 },  // Gen 6: 58px deep (was 34)
];

const BRANCH_BASE: readonly string[] = [
  '#6a9cc0', // 0 — paternal grandfather (slate blue)
  '#6aaa78', // 1 — paternal grandmother (sage green)
  '#c07848', // 2 — maternal grandfather (terracotta)
  '#a078b0', // 3 — maternal grandmother (dusty mauve)
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
    const rootAhn = ahnNum >> (gen - 2);    // lands in range 4–7
    const branchIdx = rootAhn - 4;          // 0–3
    base = lightenHex(BRANCH_BASE[branchIdx] ?? '#cccccc', (gen - 2) * 0.12);
  }
  return isEmpty ? lightenHex(base, 0.55) : base;
}

function toRad(deg: number): number { return (deg * Math.PI) / 180; }

function arcXY(r: number, angleDeg: number): [number, number] {
  return [
    CIRCLE_CX + r * Math.cos(toRad(angleDeg)),
    CIRCLE_CY + r * Math.sin(toRad(angleDeg)),
  ];
}

function fmt(n: number): string { return n.toFixed(3); }

function buildPath(rInner: number, rOuter: number, startDeg: number, endDeg: number): string {
  const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
  const [ox1, oy1] = arcXY(rOuter, startDeg);
  const [ox2, oy2] = arcXY(rOuter, endDeg);
  if (rInner === 0) {
    return `M ${fmt(CIRCLE_CX)},${fmt(CIRCLE_CY)} L ${fmt(ox1)},${fmt(oy1)} A ${rOuter},${rOuter} 0 ${largeArc},1 ${fmt(ox2)},${fmt(oy2)} Z`;
  }
  const [ix1, iy1] = arcXY(rInner, startDeg);
  const [ix2, iy2] = arcXY(rInner, endDeg);
  return [
    `M ${fmt(ix1)},${fmt(iy1)}`,
    `L ${fmt(ox1)},${fmt(oy1)}`,
    `A ${rOuter},${rOuter} 0 ${largeArc},1 ${fmt(ox2)},${fmt(oy2)}`,
    `L ${fmt(ix2)},${fmt(iy2)}`,
    `A ${rInner},${rInner} 0 ${largeArc},0 ${fmt(ix1)},${fmt(iy1)}`,
    'Z',
  ].join(' ');
}

export interface CircleSegment {
  ahnNum: number;
  generation: number;
  person: PersonNode | null;
  pathD: string;          // empty string for focal (rendered as <circle>)
  textPathGivenD: string; // arc for given-name line (line 1, offset outward/inward)
  textPathD: string;      // arc at mid-radius for surname / single-line name
  textPathDateD: string;  // arc further in/out for date line
  fill: string;
  textX: number;
  textY: number;
  textAngle: number;        // tangential rotation — gen 1-4
  textAngleRadial: number;  // radial rotation (90° from tangential) — gen 5-6
  midAngle: number;         // segment midpoint angle, from –90° (top), clockwise
  sweepDeg: number;
  isEmpty: boolean;
  isFocal: boolean;
}

export function computeCircleLayout(tree: PedigreeTree, maxGen = 6): CircleSegment[] {
  const segments: CircleSegment[] = [];
  const limit = Math.min(Math.max(maxGen, 1), 6);

  for (let gen = 0; gen <= limit; gen++) {
    const count = Math.pow(2, gen);
    const firstAhn = Math.pow(2, gen);
    const sweepDeg = 360 / count;
    const { rInner, rOuter } = RINGS[gen];

    for (let pos = 0; pos < count; pos++) {
      const ahnNum = firstAhn + pos;
      const startDeg = -90 + pos * sweepDeg;
      const endDeg   = startDeg + sweepDeg;
      const midDeg   = startDeg + sweepDeg / 2;

      const person  = tree.nodes.get(ahnNum) ?? null;
      const isEmpty = person === null;
      const isFocal = gen === 0;

      const pathD = isFocal ? '' : buildPath(rInner, rOuter, startDeg, endDeg);
      const fill  = computeFill(ahnNum, gen, isEmpty);

      const rMid = (rInner + rOuter) / 2;

      // For gen 1 (father/mother), shift text 45° toward the top so its orientation
      // matches the adjacent gen-2 grandparent segments.
      // Father (pos=0): midDeg=0° → textMidDeg=−45° (top-right, upper half)
      // Mother (pos=1): midDeg=180° → textMidDeg=225°/−135° (top-left, upper half)
      // All other generations: textMidDeg = midDeg (no shift).
      const textMidDeg = gen === 1 ? midDeg + (pos === 0 ? -45 : +45) : midDeg;

      const [textX, textY] = arcXY(rMid, textMidDeg);

      // Tangential text angle (for straight-text mode gen 1-4), based on shifted text position
      const tangentialBase = textMidDeg + 90;
      const normT = ((tangentialBase % 360) + 360) % 360;
      const flip = normT > 90 && normT <= 270;
      const textAngle = tangentialBase + (flip ? 180 : 0);

      // Radial text angle (for gen 5-6): text reads outward along the radius.
      // dy offsets shift tangentially (perpendicular to reading direction),
      // allowing multiple lines to stack within the arc width.
      const normR = ((textMidDeg % 360) + 360) % 360;
      const flipR = normR > 90 && normR <= 270;
      const textAngleRadial = textMidDeg + (flipR ? 180 : 0);

      // Arc paths for curved textPath rendering, centered around textMidDeg.
      const textStartDeg = textMidDeg - sweepDeg / 2;
      const textEndDeg   = textMidDeg + sweepDeg / 2;
      const largeArcMid = sweepDeg > 180 ? 1 : 0;
      const inUpperHalf = Math.sin(toRad(textMidDeg)) < 0;

      function arcPath(r: number): string {
        const [p1x, p1y] = arcXY(r, textStartDeg);
        const [p2x, p2y] = arcXY(r, textEndDeg);
        return inUpperHalf
          ? `M ${fmt(p1x)},${fmt(p1y)} A ${r},${r} 0 ${largeArcMid},1 ${fmt(p2x)},${fmt(p2y)}`
          : `M ${fmt(p2x)},${fmt(p2y)} A ${r},${r} 0 ${largeArcMid},0 ${fmt(p1x)},${fmt(p1y)}`;
      }

      // Match straight-mode dy offsets: given=−9 outward, surname=+2 inward, dates=+13 inward.
      // This keeps the text block centred at the same radial position in both modes.
      const rGiven   = inUpperHalf ? rMid + 6  : rMid - 6;
      const rSurname = inUpperHalf ? rMid - 5  : rMid + 5;
      const rDate    = inUpperHalf ? rMid - 16 : rMid + 16;

      const textPathGivenD = isFocal ? '' : arcPath(rGiven);
      const textPathD      = isFocal ? '' : arcPath(rSurname);
      const textPathDateD  = isFocal ? '' : arcPath(rDate);

      segments.push({
        ahnNum, generation: gen, person, pathD, textPathGivenD, textPathD, textPathDateD, fill,
        textX, textY, textAngle, textAngleRadial, midAngle: midDeg, sweepDeg,
        isEmpty, isFocal,
      });
    }
  }

  return segments;
}
