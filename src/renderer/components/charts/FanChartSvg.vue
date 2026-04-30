<!-- src/renderer/components/charts/FanChartSvg.vue -->
<!-- Pure SVG presentation for the fan chart.
     Shared between FanChart.vue (interactive) and FanChartReport.vue (print).
     Unified chart: handles arc spans 180°-360° — the 360° case subsumes the
     legacy circle chart. Gen 1-4 uses curved text along the arc; gen 5+ uses
     radial text so names read outward along the radius. -->
<template>
  <svg
    ref="rootRef"
    :viewBox="`0 0 ${vbWidth} ${vbHeight}`"
    :width="width"
    :height="height"
    data-testid="fan-svg"
  >
    <defs>
      <!-- Curved text paths (gen 1-4) -->
      <path v-for="seg in nonFocalSegments" :key="`ftpg-${seg.ahnNum}`" :id="`ftpg-${seg.ahnNum}`" :d="seg.textPathGivenD" />
      <path v-for="seg in nonFocalSegments" :key="`ftp-${seg.ahnNum}`"  :id="`ftp-${seg.ahnNum}`"  :d="seg.textPathD" />
      <path v-for="seg in nonFocalSegments" :key="`ftpb-${seg.ahnNum}`" :id="`ftpb-${seg.ahnNum}`" :d="seg.textPathBirthD" />
      <path v-for="seg in nonFocalSegments" :key="`ftpd-${seg.ahnNum}`" :id="`ftpd-${seg.ahnNum}`" :d="seg.textPathDeathD" />

      <!-- Radial gradient per non-focal segment (subtle depth) -->
      <template v-if="!noGradients">
        <radialGradient
          v-for="seg in nonFocalSegments"
          :key="`fgrad-${seg.ahnNum}`"
          :id="`fgrad-${seg.ahnNum}`"
          cx="50%" cy="50%" r="70%"
        >
          <stop offset="0%" :stop-color="gradientStops(seg)[0]" />
          <stop offset="100%" :stop-color="gradientStops(seg)[1]" />
        </radialGradient>
      </template>

      <!-- Diagonal stripe pattern for empty segments -->
      <pattern id="fan-empty-pattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" :stroke="emptyPatternStroke" stroke-width="0.5" />
      </pattern>

      <!-- Focal shadow filter -->
      <filter id="fan-focal-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="3" :flood-color="focalShadowColor" flood-opacity="0.3" />
      </filter>
    </defs>

    <!-- Non-focal segments -->
    <g
      v-for="seg in nonFocalSegments"
      :key="seg.ahnNum"
      :class="['fan-seg', { clickable: !seg.isEmpty && !linkBase, linked: !seg.isEmpty && !!linkBase && !!seg.person }]"
      @click="!seg.isEmpty && !linkBase && seg.person && emit('navigate', seg.person.id)"
    >
      <a v-if="linkBase && seg.person" :href="segHref(seg)" @click.prevent="scrollToId(segHref(seg).replace(/^#/, ''))">
        <title>{{ tooltipLabel(seg) }}</title>
        <path :d="seg.pathD" :fill="segFill(seg)" :stroke="strokeColor" :stroke-width="strokeWidth" stroke-linejoin="round" class="seg-path" />
        <path v-if="seg.isEmpty" :d="seg.pathD" fill="url(#fan-empty-pattern)" style="pointer-events: none; opacity: 0.3;" />
      </a>
      <template v-else>
        <title v-if="seg.person">{{ tooltipLabel(seg) }}</title>
        <path :d="seg.pathD" :fill="segFill(seg)" :stroke="strokeColor" :stroke-width="strokeWidth" stroke-linejoin="round" class="seg-path" />
        <path v-if="seg.isEmpty" :d="seg.pathD" fill="url(#fan-empty-pattern)" style="pointer-events: none; opacity: 0.3;" />
      </template>

      <!-- Curved text (gen 1-4) -->
      <template v-if="seg.person && seg.generation >= 1 && seg.generation <= 4">
        <text v-if="givenLabel(seg)" text-anchor="middle" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">
          <textPath :href="`#ftpg-${seg.ahnNum}`" startOffset="50%">{{ fitCurved(givenLabel(seg), seg, nameFontSize(seg.generation)) }}</textPath>
        </text>
        <text text-anchor="middle" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">
          <textPath :href="`#ftp-${seg.ahnNum}`" startOffset="50%">{{ fitCurved(surnameLabel(seg), seg, nameFontSize(seg.generation)) }}</textPath>
        </text>
        <text v-if="birthLabel(seg)" text-anchor="middle" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">
          <textPath :href="`#ftpb-${seg.ahnNum}`" startOffset="50%">{{ fitCurved(birthLabel(seg), seg, dateFontSize(seg.generation)) }}</textPath>
        </text>
        <text v-if="deathLabel(seg)" text-anchor="middle" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">
          <textPath :href="`#ftpd-${seg.ahnNum}`" startOffset="50%">{{ fitCurved(deathLabel(seg), seg, dateFontSize(seg.generation)) }}</textPath>
        </text>
      </template>

      <!-- Radial text gen 5-6 (wide arc): up to 4 lines (name line 1, name line 2, birth, death) read outward. -->
      <template v-else-if="seg.person && (seg.generation === 5 || seg.generation === 6) && !isCompactGen(seg.generation)">
        <g :transform="`rotate(${seg.textAngleRadial}, ${seg.textX}, ${seg.textY})`">
          <text v-if="nameLine1(seg)" :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).given" text-anchor="middle" dominant-baseline="central" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">{{ nameLine1(seg) }}</text>
          <text v-if="nameLine2(seg)" :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).surname" text-anchor="middle" dominant-baseline="central" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">{{ nameLine2(seg) }}</text>
          <text v-if="birthLabel(seg)" :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).birth" text-anchor="middle" dominant-baseline="central" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">{{ birthLabel(seg) }}</text>
          <text v-if="deathLabel(seg)" :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).death" text-anchor="middle" dominant-baseline="central" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">{{ deathLabel(seg) }}</text>
        </g>
      </template>

      <!-- Radial text gen 8: single line (full name + year range) — segments are too
           narrow tangentially for any stack, so everything sits on one radial baseline. -->
      <template v-else-if="seg.person && seg.generation >= 8">
        <g :transform="`rotate(${seg.textAngleRadial}, ${seg.textX}, ${seg.textY})`">
          <text :x="seg.textX" :y="seg.textY" dy="0" text-anchor="middle" dominant-baseline="central" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">{{ fullNameLabel(seg) }}<tspan v-if="yearRangeLabel(seg)" :font-size="dateFontSize(seg.generation)" font-weight="400" :fill="dateColor"> {{ yearRangeLabel(seg) }}</tspan></text>
        </g>
      </template>

      <!-- Radial text gen 5+ (narrow arc) and gen 7 (all arcs): 2 compact lines (full name + date range). -->
      <template v-else-if="seg.person && (seg.generation === 7 || (seg.generation >= 5 && isCompactGen(seg.generation)))">
        <g :transform="`rotate(${seg.textAngleRadial}, ${seg.textX}, ${seg.textY})`">
          <text :x="seg.textX" :y="seg.textY" :dy="twoLineDy(seg.generation).name" text-anchor="middle" dominant-baseline="central" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">{{ fullNameLabel(seg) }}</text>
          <text v-if="dateRangeLabel(seg)" :x="seg.textX" :y="seg.textY" :dy="twoLineDy(seg.generation).date" text-anchor="middle" dominant-baseline="central" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">{{ dateRangeLabel(seg) }}</text>
        </g>
      </template>
    </g>

    <!-- Focal person — never wrapped in <a>: the proband (ahnentafel #1) has no
         dedicated ancestor page in the report (those start at #2), so a link
         from the centre segment would scroll nowhere or to the wrong target. -->
    <g
      v-if="focalSegment"
      :class="['fan-seg', { clickable: focalSegment.person && !linkBase }]"
      @click="focalSegment.person && !linkBase && emit('navigate', focalSegment.person!.id)"
    >
      <title v-if="focalSegment.person">{{ tooltipLabel(focalSegment) }}</title>
      <circle :cx="focalCx" :cy="focalCy" :r="focalSegment.rOuter" :fill="focalSegment.fill" filter="url(#fan-focal-shadow)" />

      <!-- Focal text labels (shared by link and non-link modes) -->
      <text
        v-for="(line, i) in focalNameLines" :key="i"
        :x="focalCx" :y="focalLineY(i, focalNameLines.length)"
        text-anchor="middle" dominant-baseline="central"
        :font-size="focalNameLines.length > 2 ? 10 : 11"
        font-weight="600" :font-family="fontFamily" :fill="textColor"
        style="pointer-events: none; user-select: none;"
      >{{ line }}</text>
      <text
        v-if="focalSegment?.person?.birthDate"
        :x="focalCx" :y="focalLineY(focalNameLines.length, focalNameLines.length)"
        text-anchor="middle" dominant-baseline="central"
        font-size="9" :font-family="fontFamily" :fill="dateColor"
        style="pointer-events: none; user-select: none;"
      >* {{ focalSegment.person.birthDate }}</text>
      <text
        v-if="focalSegment?.person?.deathDate"
        :x="focalCx" :y="focalLineY(focalNameLines.length + 1, focalNameLines.length)"
        text-anchor="middle" dominant-baseline="central"
        font-size="9" :font-family="fontFamily" :fill="dateColor"
        style="pointer-events: none; user-select: none;"
      >† {{ focalSegment.person.deathDate }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { FanSegment } from '../../utils/fanLayout';
import { fullNameParts } from '../../utils/nameUtils';
import { segmentGradientStops } from '../../utils/fanColors';
import { wrapName, truncateToWidth } from '../../utils/chart-layout/measure';

interface Props {
  segments: FanSegment[];
  focalSegment: FanSegment | null;
  focalCx: number;
  focalCy: number;
  vbWidth: number;
  vbHeight: number;
  arcSpan?: number;          // 180–360, used to scale text + switch layout density
  fontFamily?: string;
  linkBase?: string | null;
  linkByAhnentafel?: boolean;
  strokeWidth?: number;
  width?: number | string;
  height?: number | string;
  strokeColor?: string;
  emptyPatternStroke?: string;
  focalShadowColor?: string;
  noGradients?: boolean;
  textColor?: string;
  dateColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  arcSpan: 360,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  linkBase: null,
  linkByAhnentafel: false,
  strokeWidth: 1.5,
  strokeColor: 'white',
  emptyPatternStroke: 'rgba(0,0,0,0.15)',
  focalShadowColor: 'rgba(0,0,0,0.3)',
  noGradients: false,
  textColor: 'white',
  dateColor: 'rgba(255,255,255,0.75)',
});

const rootRef = ref<SVGElement | null>(null);
defineExpose({ rootRef });

const emit = defineEmits<{
  navigate: [id: string];
}>();

const nonFocalSegments = computed(() => props.segments.filter(s => !s.isFocal));

function segHref(seg: FanSegment): string {
  const id = props.linkByAhnentafel ? String(seg.ahnNum) : (seg.person?.id ?? '');
  return `${props.linkBase}${id}`;
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function segFill(seg: FanSegment): string {
  if (props.noGradients || seg.isEmpty) return seg.fill;
  return `url(#fgrad-${seg.ahnNum})`;
}

function gradientStops(seg: FanSegment): [string, string] {
  return segmentGradientStops(seg.fill, props.strokeColor === 'rgba(255,255,255,0.15)');
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      if (lines.length >= maxLines - 1) {
        current = words.slice(i).join(' ');
        break;
      }
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const focalNameLines = computed((): string[] => {
  const p = props.focalSegment?.person;
  if (!p) return [];
  const given = p.preferredName ?? p.givenName ?? '';
  const surname = p.surname ?? '';
  const lines: string[] = [];
  if (given) lines.push(given);
  if (surname) lines.push(...wrapText(surname, 11, 2));
  return lines;
});

function focalLineY(lineIndex: number, totalNameLines: number): number {
  const p = props.focalSegment?.person;
  const dateLines = p ? (p.birthDate ? 1 : 0) + (p.deathDate ? 1 : 0) : 0;
  const totalLines = totalNameLines + dateLines;
  const lineHeight = totalLines > 3 ? 10 : 12;
  const startY = props.focalCy - ((totalLines - 1) / 2) * lineHeight;
  return startY + lineIndex * lineHeight;
}

function givenLabel(seg: FanSegment): string {
  return seg.person?.preferredName ?? seg.person?.givenName ?? '';
}

function surnameLabel(seg: FanSegment): string {
  return seg.person?.surname ?? '';
}

function birthLabel(seg: FanSegment): string {
  return seg.person?.birthDate ? `* ${seg.person.birthDate}` : '';
}

function deathLabel(seg: FanSegment): string {
  return seg.person?.deathDate ? `\u2020 ${seg.person.deathDate}` : '';
}

function fullNameLabel(seg: FanSegment): string {
  const given = seg.person?.preferredName ?? seg.person?.givenName ?? '';
  const surname = seg.person?.surname ?? '';
  return [given, surname].filter(Boolean).join(' ');
}

// For gen 5-6 (radial 2-name-line layout): try the natural given/surname split
// first; if either overflows the radial line width, reflow as a single wrapped
// string so words can spill across the row boundary.
const wrappedNameCache = new WeakMap<FanSegment, [string, string]>();
function wrappedNameLines(seg: FanSegment): [string, string] {
  const cached = wrappedNameCache.get(seg);
  if (cached) return cached;
  const given = seg.person?.preferredName ?? seg.person?.givenName ?? '';
  const surname = seg.person?.surname ?? '';
  if (!given && !surname) {
    const empty: [string, string] = ['', ''];
    wrappedNameCache.set(seg, empty);
    return empty;
  }
  const fontSize = nameFontSize(seg.generation);
  const maxWidth = Math.max(0, (seg.rOuter - seg.rInner) - 6);
  const fits = (s: string): boolean => !s || measureTextWidth(s, fontSize) <= maxWidth;
  let result: [string, string];
  if (fits(given) && fits(surname)) {
    result = [given, surname];
  } else {
    const combined = [given, surname].filter(Boolean).join(' ');
    const wrapped = wrapName(combined, maxWidth, fontSize);
    if (wrapped.length === 0)      result = ['', ''];
    else if (wrapped.length === 1) result = [wrapped[0], ''];
    else if (wrapped.length === 2) result = [wrapped[0], wrapped[1]];
    else result = [wrapped[0], truncateToWidth(wrapped.slice(1).join(' '), maxWidth, fontSize)];
  }
  wrappedNameCache.set(seg, result);
  return result;
}

let _measureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(text: string, fontSize: number): number {
  if (!_measureCtx) {
    try { _measureCtx = document.createElement('canvas').getContext('2d'); } catch { /* ssr */ }
  }
  if (!_measureCtx) return text.length * fontSize * 0.6;
  _measureCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  return _measureCtx.measureText(text).width;
}

function nameLine1(seg: FanSegment): string { return wrappedNameLines(seg)[0]; }
function nameLine2(seg: FanSegment): string { return wrappedNameLines(seg)[1]; }

// Truncate a curved-text label to the arc length it has available. Uses the
// segment's mid-radius arc as a proxy — it's within a few px of the actual
// per-line radii, which is close enough for fit-checks.
function fitCurved(text: string, seg: FanSegment, fontSize: number): string {
  if (!text) return '';
  const rMid = (seg.rInner + seg.rOuter) / 2;
  const arcLen = rMid * (seg.sweepDeg * Math.PI / 180) - 4; // small margin
  if (arcLen <= 0) return '';
  return truncateToWidth(text, arcLen, fontSize);
}

function dateRangeLabel(seg: FanSegment): string {
  const b = seg.person?.birthDate ?? '';
  const d = seg.person?.deathDate ?? '';
  if (!b && !d) return '';
  const parts: string[] = [];
  if (b) parts.push(`* ${b}`);
  if (d) parts.push(`\u2020 ${d}`);
  return parts.join(' ');
}

// Gen 8 date range: "* YYYY † YYYY" (year-only to fit on one radial baseline).
// Rendered as a <tspan> next to the name so the dates can use the smaller
// date font/colour, matching how gens 5-7 separate name and date styling.
function yearRangeLabel(seg: FanSegment): string {
  const by = (seg.person?.birthDate ?? '').slice(0, 4);
  const dy = (seg.person?.deathDate ?? '').slice(0, 4);
  if (!by && !dy) return '';
  const range: string[] = [];
  if (by) range.push(`* ${by}`);
  if (dy) range.push(`\u2020 ${dy}`);
  return range.join(' ');
}

// Tangential dy offsets for the 2-line radial layout. Gen 5-6 (compact narrow-arc
// mode) and gen 7 each get their own gap based on how much tangential room the
// segment has — gen 7 segments are half as wide as gen 6 so the gap is tighter.
function twoLineDy(gen: number): { name: string; date: string } {
  if (gen === 7) return { name: '-2', date: '2.2' };
  // gen 5-6 compact mode (narrow arc): moderate gap
  return { name: '-3', date: '3' };
}

function tooltipLabel(seg: FanSegment): string {
  if (!seg.person) return '';
  const p = seg.person;
  const name = fullNameParts(p.givenName, p.surname, p.preferredName, p.nickname)
    .map(pt => pt.text).join('');
  const birth = p.birthDate ? ` * ${p.birthDate}` : '';
  const death = p.deathDate ? ` \u2020 ${p.deathDate}` : '';
  return name + birth + death;
}

// Font sizes are linearly interpolated between the narrow-arc target (180°) and
// the wide-arc baseline (360°). 360° matches the previously-tuned sizes; 180°
// shrinks gen 3+ to fit inside much narrower tangential slots.
const NAME_WIDE: Record<number, number>   = { 1: 11, 2: 10,  3: 9,   4: 8.5, 5: 7.5, 6: 6,   7: 5,   8: 4.5 };
const NAME_NARROW: Record<number, number> = { 1: 11, 2: 10,  3: 7.5, 4: 6.5, 5: 6,   6: 5,   7: 4.5, 8: 4   };
const DATE_WIDE: Record<number, number>   = { 1: 9,  2: 8,   3: 7.5, 4: 7,   5: 6.5, 6: 5.5, 7: 4.5, 8: 4   };
const DATE_NARROW: Record<number, number> = { 1: 9,  2: 7.5, 3: 6.5, 4: 5.5, 5: 5,   6: 4.5, 7: 4,   8: 3.6 };

// t=0 at 180°, t=1 at 360°.
const arcT = computed(() => Math.max(0, Math.min(1, (props.arcSpan - 180) / 180)));

function nameFontSize(gen: number): number {
  const wide = NAME_WIDE[gen] ?? 4.5;
  const narrow = NAME_NARROW[gen] ?? 4;
  return narrow + (wide - narrow) * arcT.value;
}

function dateFontSize(gen: number): number {
  const wide = DATE_WIDE[gen] ?? 4;
  const narrow = DATE_NARROW[gen] ?? 3.6;
  return narrow + (wide - narrow) * arcT.value;
}

// When the arc is narrow, gen 5-6 switch to a compact 2-line radial layout
// (full name + date range) — same shape as gen 7+ — so there's more tangential
// room per line and short names don't share a cramped 4-row stack.
// Thresholds are per-gen: gen 5 has double the sweep of gen 6 at the same arc,
// so it can stay in the 4-line layout down to 240° before arcs get too narrow.
function isCompactGen(gen: number): boolean {
  if (gen === 5) return props.arcSpan < 240;
  if (gen === 6) return props.arcSpan < 300;
  return false;
}

// Per-generation dy offsets for radial/straight text stacking.
// Gap is roughly 1.3× the name font size: gen 5 (7.5px) gets 10; gen 6+ (≤6px) gets 7.
// Lines are centered on the segment midline — positions depend on which lines are actually present.
function lineDy(seg: FanSegment): { given: string; surname: string; birth: string; death: string } {
  const gap = seg.generation >= 6 ? 7 : 10;
  const present: Record<'given' | 'surname' | 'birth' | 'death', boolean> = {
    given: !!nameLine1(seg),
    surname: !!nameLine2(seg),
    birth: !!birthLabel(seg),
    death: !!deathLabel(seg),
  };
  const order = ['given', 'surname', 'birth', 'death'] as const;
  const visible = order.filter(k => present[k]);
  const n = visible.length;
  const result = { given: '0', surname: '0', birth: '0', death: '0' };
  for (let i = 0; i < n; i++) {
    result[visible[i]] = String(Math.round((i - (n - 1) / 2) * gap));
  }
  return result;
}
</script>

<style>
.fan-seg .seg-path {
  transition: filter 0.15s ease;
}
.fan-seg.clickable:hover .seg-path,
.fan-seg.linked a:hover .seg-path {
  filter: brightness(1.12);
}
.fan-seg.clickable { cursor: pointer; }
.fan-seg.linked a { cursor: pointer; }
</style>
