// Pure layout algorithm for the 360° fan chart. No DOM, no IPC.

import type { PedigreeTree, PersonNode } from './chartLayout';

export const FAN_CX = 350;
export const FAN_CY = 350;
export const FAN_SVG_SIZE = 700;

const RINGS: Array<{ rInner: number; rOuter: number }> = [
  { rInner: 0,   rOuter: 32  },
  { rInner: 32,  rOuter: 85  },
  { rInner: 85,  rOuter: 145 },
  { rInner: 145, rOuter: 205 },
  { rInner: 205, rOuter: 255 },
  { rInner: 255, rOuter: 300 },
  { rInner: 300, rOuter: 338 },
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
    FAN_CX + r * Math.cos(toRad(angleDeg)),
    FAN_CY + r * Math.sin(toRad(angleDeg)),
  ];
}

function fmt(n: number): string { return n.toFixed(3); }

function buildPath(rInner: number, rOuter: number, startDeg: number, endDeg: number): string {
  const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
  const [ox1, oy1] = arcXY(rOuter, startDeg);
  const [ox2, oy2] = arcXY(rOuter, endDeg);
  if (rInner === 0) {
    return `M ${fmt(FAN_CX)},${fmt(FAN_CY)} L ${fmt(ox1)},${fmt(oy1)} A ${rOuter},${rOuter} 0 ${largeArc},1 ${fmt(ox2)},${fmt(oy2)} Z`;
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

export interface FanSegment {
  ahnNum: number;
  generation: number;
  person: PersonNode | null;
  pathD: string;        // empty string for focal (rendered as <circle>)
  fill: string;
  textX: number;
  textY: number;
  textAngle: number;    // degrees — apply as rotate(textAngle, textX, textY)
  midAngle: number;     // segment midpoint angle, from –90° (top), clockwise
  sweepDeg: number;
  isEmpty: boolean;
  isFocal: boolean;
}

export function computeFanLayout(tree: PedigreeTree): FanSegment[] {
  const segments: FanSegment[] = [];

  for (let gen = 0; gen <= 6; gen++) {
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
      const [textX, textY] = arcXY(rMid, midDeg);

      const normMid = ((midDeg % 360) + 360) % 360;
      const flip = normMid > 90 && normMid <= 270;
      const textAngle = midDeg + (flip ? 180 : 0);

      segments.push({
        ahnNum, generation: gen, person, pathD, fill,
        textX, textY, textAngle, midAngle: midDeg, sweepDeg,
        isEmpty, isFocal,
      });
    }
  }

  return segments;
}
