<!-- src/renderer/components/charts/FanChartSvg.vue -->
<!-- Pure SVG presentation for the fan chart.
     Shared between FanChart.vue (interactive) and FanChartReport.vue (print).
     Unified chart: handles arc spans 180°-360° — the 360° case subsumes the
     legacy circle chart. Gen 1-4 uses tangential text (optionally curved along
     the arc); gen 5+ uses radial text so names read outward along the radius. -->
<template>
  <svg
    :viewBox="`0 0 ${vbWidth} ${vbHeight}`"
    :width="width"
    :height="height"
    data-testid="fan-svg"
  >
    <defs>
      <!-- Curved text paths (only for gen 1-4 when curvedText is on) -->
      <template v-if="curvedText">
        <path v-for="seg in nonFocalSegments" :key="`ftpg-${seg.ahnNum}`" :id="`ftpg-${seg.ahnNum}`" :d="seg.textPathGivenD" />
        <path v-for="seg in nonFocalSegments" :key="`ftp-${seg.ahnNum}`"  :id="`ftp-${seg.ahnNum}`"  :d="seg.textPathD" />
        <path v-for="seg in nonFocalSegments" :key="`ftpb-${seg.ahnNum}`" :id="`ftpb-${seg.ahnNum}`" :d="seg.textPathBirthD" />
        <path v-for="seg in nonFocalSegments" :key="`ftpd-${seg.ahnNum}`" :id="`ftpd-${seg.ahnNum}`" :d="seg.textPathDeathD" />
      </template>

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
      :class="['fan-seg', { clickable: !seg.isEmpty && !linkBase }]"
      @click="!seg.isEmpty && !linkBase && seg.person && emit('navigate', seg.person.id)"
      @mouseenter="(e: MouseEvent) => !linkBase && seg.person && emit('personenter', seg.person!, e)"
      @mousemove="(e: MouseEvent) => !linkBase && seg.person && emit('personmove', e)"
      @mouseleave="!linkBase && seg.person && emit('personleave')"
    >
      <a v-if="linkBase && seg.person" :href="`${linkBase}${seg.person.id}`">
        <title>{{ tooltipLabel(seg) }}</title>
        <path :d="seg.pathD" :fill="segFill(seg)" :stroke="strokeColor" :stroke-width="strokeWidth" stroke-linejoin="round" class="seg-path" />
        <path v-if="seg.isEmpty" :d="seg.pathD" fill="url(#fan-empty-pattern)" style="pointer-events: none; opacity: 0.3;" />
      </a>
      <template v-else>
        <path :d="seg.pathD" :fill="segFill(seg)" :stroke="strokeColor" :stroke-width="strokeWidth" stroke-linejoin="round" class="seg-path" />
        <path v-if="seg.isEmpty" :d="seg.pathD" fill="url(#fan-empty-pattern)" style="pointer-events: none; opacity: 0.3;" />
        <title v-if="seg.person && !linkBase">{{ tooltipLabel(seg) }}</title>
      </template>

      <!-- Curved text (gen 1-4, curvedText on) -->
      <template v-if="curvedText && seg.person && seg.generation >= 1 && seg.generation <= 4">
        <text v-if="givenLabel(seg)" text-anchor="middle" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">
          <textPath :href="`#ftpg-${seg.ahnNum}`" startOffset="50%">{{ givenLabel(seg) }}</textPath>
        </text>
        <text text-anchor="middle" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">
          <textPath :href="`#ftp-${seg.ahnNum}`" startOffset="50%">{{ surnameLabel(seg) }}</textPath>
        </text>
        <text v-if="birthLabel(seg)" text-anchor="middle" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">
          <textPath :href="`#ftpb-${seg.ahnNum}`" startOffset="50%">{{ birthLabel(seg) }}</textPath>
        </text>
        <text v-if="deathLabel(seg)" text-anchor="middle" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">
          <textPath :href="`#ftpd-${seg.ahnNum}`" startOffset="50%">{{ deathLabel(seg) }}</textPath>
        </text>
      </template>

      <!-- Straight tangential text (gen 1-4, curvedText off) -->
      <template v-else-if="seg.person && seg.generation >= 1 && seg.generation <= 4">
        <g :transform="`rotate(${seg.textAngle}, ${seg.textX}, ${seg.textY})`">
          <text v-if="givenLabel(seg)" :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).given" text-anchor="middle" dominant-baseline="central" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">{{ givenLabel(seg) }}</text>
          <text :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).surname" text-anchor="middle" dominant-baseline="central" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">{{ surnameLabel(seg) }}</text>
          <text v-if="birthLabel(seg)" :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).birth" text-anchor="middle" dominant-baseline="central" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">{{ birthLabel(seg) }}</text>
          <text v-if="deathLabel(seg)" :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).death" text-anchor="middle" dominant-baseline="central" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">{{ deathLabel(seg) }}</text>
        </g>
      </template>

      <!-- Radial text (gen 5+): rotated so text reads outward along the radius -->
      <template v-else-if="seg.person && seg.generation >= 5">
        <g :transform="`rotate(${seg.textAngleRadial}, ${seg.textX}, ${seg.textY})`">
          <text v-if="givenLabel(seg)" :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).given" text-anchor="middle" dominant-baseline="central" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">{{ givenLabel(seg) }}</text>
          <text :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).surname" text-anchor="middle" dominant-baseline="central" :font-size="nameFontSize(seg.generation)" :font-family="fontFamily" font-weight="600" :fill="textColor" style="pointer-events: none; user-select: none;">{{ surnameLabel(seg) }}</text>
          <text v-if="birthLabel(seg)" :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).birth" text-anchor="middle" dominant-baseline="central" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">{{ birthLabel(seg) }}</text>
          <text v-if="deathLabel(seg)" :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).death" text-anchor="middle" dominant-baseline="central" :font-size="dateFontSize(seg.generation)" :font-family="fontFamily" :fill="dateColor" style="pointer-events: none; user-select: none;">{{ deathLabel(seg) }}</text>
        </g>
      </template>
    </g>

    <!-- Focal person -->
    <g
      v-if="focalSegment"
      :class="['fan-seg', { clickable: focalSegment.person && !linkBase }]"
      @click="focalSegment.person && !linkBase && emit('navigate', focalSegment.person!.id)"
      @mouseenter="(e: MouseEvent) => !linkBase && focalSegment!.person && emit('personenter', focalSegment!.person!, e)"
      @mousemove="(e: MouseEvent) => !linkBase && focalSegment!.person && emit('personmove', e)"
      @mouseleave="!linkBase && focalSegment!.person && emit('personleave')"
    >
      <a v-if="linkBase && focalSegment.person" :href="`${linkBase}${focalSegment.person.id}`">
        <title>{{ tooltipLabel(focalSegment) }}</title>
        <template v-if="focalSegment.focalPathD">
          <path :d="focalSegment.focalPathD" :fill="focalSegment.fill" :stroke="strokeColor" :stroke-width="strokeWidth" filter="url(#fan-focal-shadow)" />
        </template>
        <template v-else>
          <circle :cx="focalCx" :cy="focalCy" r="50" :fill="focalSegment.fill" filter="url(#fan-focal-shadow)" />
        </template>
      </a>
      <template v-else>
        <template v-if="focalSegment.focalPathD">
          <path :d="focalSegment.focalPathD" :fill="focalSegment.fill" :stroke="strokeColor" :stroke-width="strokeWidth" filter="url(#fan-focal-shadow)" />
        </template>
        <template v-else>
          <circle :cx="focalCx" :cy="focalCy" r="50" :fill="focalSegment.fill" filter="url(#fan-focal-shadow)" />
        </template>
        <title v-if="focalSegment.person && !linkBase">{{ tooltipLabel(focalSegment) }}</title>
      </template>

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
import { computed } from 'vue';
import type { FanSegment } from '../../utils/fanLayout';
import { fullNameParts } from '../../utils/nameUtils';
import { segmentGradientStops } from '../../utils/fanColors';

interface Props {
  segments: FanSegment[];
  focalSegment: FanSegment | null;
  focalCx: number;
  focalCy: number;
  vbWidth: number;
  vbHeight: number;
  curvedText?: boolean;
  fontFamily?: string;
  linkBase?: string | null;
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
  curvedText: false,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  linkBase: null,
  strokeWidth: 1.5,
  strokeColor: 'white',
  emptyPatternStroke: 'rgba(0,0,0,0.15)',
  focalShadowColor: 'rgba(0,0,0,0.3)',
  noGradients: false,
  textColor: 'white',
  dateColor: 'rgba(255,255,255,0.75)',
});

const emit = defineEmits<{
  navigate: [id: string];
  personenter: [person: NonNullable<FanSegment['person']>, event: MouseEvent];
  personmove: [event: MouseEvent];
  personleave: [];
}>();

const nonFocalSegments = computed(() => props.segments.filter(s => !s.isFocal));

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

function tooltipLabel(seg: FanSegment): string {
  if (!seg.person) return '';
  const p = seg.person;
  const name = fullNameParts(p.givenName, p.surname, p.preferredName, p.nickname)
    .map(pt => pt.text).join('');
  const birth = p.birthDate ? ` * ${p.birthDate}` : '';
  const death = p.deathDate ? ` \u2020 ${p.deathDate}` : '';
  return name + birth + death;
}

function nameFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 11, 2: 10, 3: 9, 4: 8.5, 5: 7.5, 6: 6, 7: 5, 8: 4.5 };
  return sizes[gen] ?? 4.5;
}

function dateFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 9, 2: 8, 3: 7.5, 4: 7, 5: 6.5, 6: 5.5, 7: 4.5, 8: 4 };
  return sizes[gen] ?? 4;
}

// Per-generation dy offsets for radial/straight text stacking.
// Deeper rings (gen 5+) use 10px gaps; gen 7-8 are narrower so use 7px.
function lineDy(seg: FanSegment): { given: string; surname: string; birth: string; death: string } {
  const hasDates = !!(birthLabel(seg) || deathLabel(seg));
  const hasGiven = !!givenLabel(seg);
  const gap = seg.generation >= 7 ? 7 : 10;
  const h = gap * 1.5;  // half-span for 4 lines
  const q = gap * 0.5;  // quarter-span
  return {
    given:   hasDates ? String(-Math.round(h)) : String(-Math.round(q)),
    surname: hasGiven ? (hasDates ? String(-Math.round(q)) : String(Math.round(q))) : '0',
    birth:   String(Math.round(q)),
    death:   String(Math.round(h)),
  };
}
</script>

<style>
.fan-seg .seg-path {
  transition: filter 0.15s ease;
}
.fan-seg.clickable:hover .seg-path {
  filter: brightness(1.12);
}
.fan-seg.clickable { cursor: pointer; }
</style>
