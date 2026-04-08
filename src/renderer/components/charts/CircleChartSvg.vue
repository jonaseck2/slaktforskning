<!-- src/renderer/components/charts/CircleChartSvg.vue -->
<!-- Pure SVG presentation component for the 360° circle/pedigree chart.
     Shared between CircleChart.vue (interactive) and AncestorBookReport.vue (print). -->
<template>
  <svg
    :viewBox="`0 0 ${CIRCLE_SVG_SIZE} ${CIRCLE_SVG_SIZE}`"
    :width="width"
    :height="height"
    data-testid="circle-svg"
  >
    <!-- Curved text paths in defs (only for gen 1-4 when curvedText is on) -->
    <defs v-if="curvedText">
      <path v-for="seg in nonFocalSegments" :key="`tpg-${seg.ahnNum}`" :id="`tpg-${seg.ahnNum}`" :d="seg.textPathGivenD" />
      <path v-for="seg in nonFocalSegments" :key="`tp-${seg.ahnNum}`"  :id="`tp-${seg.ahnNum}`"  :d="seg.textPathD" />
      <path v-for="seg in nonFocalSegments" :key="`tpb-${seg.ahnNum}`" :id="`tpb-${seg.ahnNum}`" :d="seg.textPathBirthD" />
      <path v-for="seg in nonFocalSegments" :key="`tpd-${seg.ahnNum}`" :id="`tpd-${seg.ahnNum}`" :d="seg.textPathDeathD" />
    </defs>

    <!-- Non-focal segments -->
    <g
      v-for="seg in nonFocalSegments"
      :key="seg.ahnNum"
      :class="['circle-seg', { clickable: !seg.isEmpty && !linkBase }]"
      @click="!seg.isEmpty && !linkBase && seg.person && emit('navigate', seg.person.id)"
      @mouseenter="(e: MouseEvent) => !linkBase && seg.person && emit('personenter', seg.person, e)"
      @mousemove="(e: MouseEvent) => !linkBase && seg.person && emit('personmove', e)"
      @mouseleave="!linkBase && seg.person && emit('personleave')"
    >
      <!-- Link wrapper for print mode -->
      <a v-if="linkBase && seg.person" :href="`${linkBase}${seg.person.id}`">
        <title>{{ tooltipLabel(seg) }}</title>
        <path
          :d="seg.pathD"
          :fill="seg.fill"
          stroke="white"
          :stroke-width="strokeWidth"
          stroke-linejoin="round"
        />
        <!-- Curved text mode (gen 1-4) -->
        <template v-if="curvedText && seg.generation <= 4">
          <text
            v-if="givenLabel(seg)"
            text-anchor="middle"
            :font-size="nameFontSize(seg.generation)"
            :font-family="fontFamily"
            font-weight="600"
            fill="white"
          >
            <textPath :href="`#tpg-${seg.ahnNum}`" startOffset="50%">{{ givenLabel(seg) }}</textPath>
          </text>
          <text
            text-anchor="middle"
            :font-size="nameFontSize(seg.generation)"
            :font-family="fontFamily"
            font-weight="600"
            fill="white"
          >
            <textPath :href="`#tp-${seg.ahnNum}`" startOffset="50%">{{ surnameLabel(seg) }}</textPath>
          </text>
          <text
            v-if="birthLabel(seg)"
            text-anchor="middle"
            :font-size="dateFontSize(seg.generation)"
            :font-family="fontFamily"
            fill="rgba(255,255,255,0.75)"
          >
            <textPath :href="`#tpb-${seg.ahnNum}`" startOffset="50%">{{ birthLabel(seg) }}</textPath>
          </text>
          <text
            v-if="deathLabel(seg)"
            text-anchor="middle"
            :font-size="dateFontSize(seg.generation)"
            :font-family="fontFamily"
            fill="rgba(255,255,255,0.75)"
          >
            <textPath :href="`#tpd-${seg.ahnNum}`" startOffset="50%">{{ deathLabel(seg) }}</textPath>
          </text>
        </template>

        <!-- Radial straight text (gen 5-6) -->
        <template v-else-if="seg.generation >= 5">
          <g :transform="`rotate(${seg.textAngleRadial}, ${seg.textX}, ${seg.textY})`">
            <text
              v-if="givenLabel(seg)"
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).given"
              text-anchor="middle" dominant-baseline="central"
              :font-size="nameFontSize(seg.generation)"
              :font-family="fontFamily"
              font-weight="600" fill="white"
              style="pointer-events: none; user-select: none;"
            >{{ givenLabel(seg) }}</text>
            <text
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).surname"
              text-anchor="middle" dominant-baseline="central"
              :font-size="nameFontSize(seg.generation)"
              :font-family="fontFamily"
              font-weight="600" fill="white"
              style="pointer-events: none; user-select: none;"
            >{{ surnameLabel(seg) }}</text>
            <text
              v-if="birthLabel(seg)"
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).birth"
              text-anchor="middle" dominant-baseline="central"
              :font-size="dateFontSize(seg.generation)"
              :font-family="fontFamily"
              fill="rgba(255,255,255,0.75)"
              style="pointer-events: none; user-select: none;"
            >{{ birthLabel(seg) }}</text>
            <text
              v-if="deathLabel(seg)"
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).death"
              text-anchor="middle" dominant-baseline="central"
              :font-size="dateFontSize(seg.generation)"
              :font-family="fontFamily"
              fill="rgba(255,255,255,0.75)"
              style="pointer-events: none; user-select: none;"
            >{{ deathLabel(seg) }}</text>
          </g>
        </template>
      </a>

      <!-- Interactive mode (no link wrapper) -->
      <template v-else>
        <path
          :d="seg.pathD"
          :fill="seg.fill"
          stroke="white"
          :stroke-width="strokeWidth"
          stroke-linejoin="round"
        />
        <!-- Hover tooltip via native SVG title (works in Electron WebView) -->
        <title v-if="seg.person && !linkBase">{{ tooltipLabel(seg) }}</title>

        <!-- Curved text mode (gen 1-4) -->
        <template v-if="curvedText && seg.person && seg.generation <= 4">
          <text
            v-if="givenLabel(seg)"
            text-anchor="middle"
            :font-size="nameFontSize(seg.generation)"
            :font-family="fontFamily"
            font-weight="600"
            fill="white"
            style="pointer-events: none; user-select: none;"
          >
            <textPath :href="`#tpg-${seg.ahnNum}`" startOffset="50%">{{ givenLabel(seg) }}</textPath>
          </text>
          <text
            text-anchor="middle"
            :font-size="nameFontSize(seg.generation)"
            :font-family="fontFamily"
            font-weight="600"
            fill="white"
            style="pointer-events: none; user-select: none;"
          >
            <textPath :href="`#tp-${seg.ahnNum}`" startOffset="50%">{{ surnameLabel(seg) }}</textPath>
          </text>
          <text
            v-if="birthLabel(seg)"
            text-anchor="middle"
            :font-size="dateFontSize(seg.generation)"
            :font-family="fontFamily"
            fill="rgba(255,255,255,0.75)"
            style="pointer-events: none; user-select: none;"
          >
            <textPath :href="`#tpb-${seg.ahnNum}`" startOffset="50%">{{ birthLabel(seg) }}</textPath>
          </text>
          <text
            v-if="deathLabel(seg)"
            text-anchor="middle"
            :font-size="dateFontSize(seg.generation)"
            :font-family="fontFamily"
            fill="rgba(255,255,255,0.75)"
            style="pointer-events: none; user-select: none;"
          >
            <textPath :href="`#tpd-${seg.ahnNum}`" startOffset="50%">{{ deathLabel(seg) }}</textPath>
          </text>
        </template>

        <!-- Straight tangential text (gen 1-4) -->
        <template v-else-if="seg.person && seg.generation >= 1 && seg.generation <= 4">
          <g :transform="`rotate(${seg.textAngle}, ${seg.textX}, ${seg.textY})`">
            <text
              v-if="givenLabel(seg)"
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).given"
              text-anchor="middle" dominant-baseline="central"
              :font-size="nameFontSize(seg.generation)"
              :font-family="fontFamily"
              font-weight="600" fill="white"
              style="pointer-events: none; user-select: none;"
            >{{ givenLabel(seg) }}</text>
            <text
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).surname"
              text-anchor="middle" dominant-baseline="central"
              :font-size="nameFontSize(seg.generation)"
              :font-family="fontFamily"
              font-weight="600" fill="white"
              style="pointer-events: none; user-select: none;"
            >{{ surnameLabel(seg) }}</text>
            <text
              v-if="birthLabel(seg)"
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).birth"
              text-anchor="middle" dominant-baseline="central"
              :font-size="dateFontSize(seg.generation)"
              :font-family="fontFamily"
              fill="rgba(255,255,255,0.75)"
              style="pointer-events: none; user-select: none;"
            >{{ birthLabel(seg) }}</text>
            <text
              v-if="deathLabel(seg)"
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).death"
              text-anchor="middle" dominant-baseline="central"
              :font-size="dateFontSize(seg.generation)"
              :font-family="fontFamily"
              fill="rgba(255,255,255,0.75)"
              style="pointer-events: none; user-select: none;"
            >{{ deathLabel(seg) }}</text>
          </g>
        </template>

        <!-- Radial text (gen 5-6) -->
        <template v-else-if="seg.person && seg.generation >= 5">
          <g :transform="`rotate(${seg.textAngleRadial}, ${seg.textX}, ${seg.textY})`">
            <text
              v-if="givenLabel(seg)"
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).given"
              text-anchor="middle" dominant-baseline="central"
              :font-size="nameFontSize(seg.generation)"
              :font-family="fontFamily"
              font-weight="600" fill="white"
              style="pointer-events: none; user-select: none;"
            >{{ givenLabel(seg) }}</text>
            <text
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).surname"
              text-anchor="middle" dominant-baseline="central"
              :font-size="nameFontSize(seg.generation)"
              :font-family="fontFamily"
              font-weight="600" fill="white"
              style="pointer-events: none; user-select: none;"
            >{{ surnameLabel(seg) }}</text>
            <text
              v-if="birthLabel(seg)"
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).birth"
              text-anchor="middle" dominant-baseline="central"
              :font-size="dateFontSize(seg.generation)"
              :font-family="fontFamily"
              fill="rgba(255,255,255,0.75)"
              style="pointer-events: none; user-select: none;"
            >{{ birthLabel(seg) }}</text>
            <text
              v-if="deathLabel(seg)"
              :x="seg.textX" :y="seg.textY" :dy="lineDy(seg).death"
              text-anchor="middle" dominant-baseline="central"
              :font-size="dateFontSize(seg.generation)"
              :font-family="fontFamily"
              fill="rgba(255,255,255,0.75)"
              style="pointer-events: none; user-select: none;"
            >{{ deathLabel(seg) }}</text>
          </g>
        </template>
      </template>
    </g>

    <!-- Focal person circle (rendered on top of segments) -->
    <g
      v-if="focalSegment"
      :class="['circle-seg', { clickable: focalSegment.person && !linkBase }]"
      @click="focalSegment.person && !linkBase && emit('navigate', focalSegment.person!.id)"
      @mouseenter="(e: MouseEvent) => !linkBase && focalSegment!.person && emit('personenter', focalSegment!.person, e)"
      @mousemove="(e: MouseEvent) => !linkBase && focalSegment!.person && emit('personmove', e)"
      @mouseleave="!linkBase && focalSegment!.person && emit('personleave')"
    >
      <!-- Link wrapper for print/export mode -->
      <a v-if="linkBase && focalSegment.person" :href="`${linkBase}${focalSegment.person.id}`">
        <title>{{ tooltipLabel(focalSegment) }}</title>
        <circle :cx="CIRCLE_CX" :cy="CIRCLE_CY" r="50" :fill="focalSegment.fill" />
        <text
          v-for="(line, i) in focalNameLines" :key="i"
          :x="CIRCLE_CX" :y="focalLineY(i, focalNameLines.length)"
          text-anchor="middle" dominant-baseline="central"
          :font-size="focalNameLines.length > 2 ? 9 : 10"
          font-weight="600" :font-family="fontFamily" fill="white"
        >{{ line }}</text>
        <text
          v-if="focalSegment.person.birthDate"
          :x="CIRCLE_CX" :y="focalLineY(focalNameLines.length, focalNameLines.length)"
          text-anchor="middle" dominant-baseline="central"
          font-size="8" :font-family="fontFamily" fill="rgba(255,255,255,0.65)"
        >* {{ focalSegment.person.birthDate }}</text>
        <text
          v-if="focalSegment.person.deathDate"
          :x="CIRCLE_CX" :y="focalLineY(focalNameLines.length + 1, focalNameLines.length)"
          text-anchor="middle" dominant-baseline="central"
          font-size="8" :font-family="fontFamily" fill="rgba(255,255,255,0.65)"
        >† {{ focalSegment.person.deathDate }}</text>
      </a>
      <!-- Interactive mode (no link wrapper) -->
      <template v-else>
        <circle :cx="CIRCLE_CX" :cy="CIRCLE_CY" r="50" :fill="focalSegment.fill" />
        <title v-if="focalSegment.person && !linkBase">{{ tooltipLabel(focalSegment) }}</title>
        <text
          v-for="(line, i) in focalNameLines" :key="i"
          :x="CIRCLE_CX" :y="focalLineY(i, focalNameLines.length)"
          text-anchor="middle" dominant-baseline="central"
          :font-size="focalNameLines.length > 2 ? 9 : 10"
          font-weight="600" :font-family="fontFamily" fill="white"
          style="pointer-events: none; user-select: none;"
        >{{ line }}</text>
        <text
          v-if="focalSegment?.person?.birthDate"
          :x="CIRCLE_CX" :y="focalLineY(focalNameLines.length, focalNameLines.length)"
          text-anchor="middle" dominant-baseline="central"
          font-size="8" :font-family="fontFamily" fill="rgba(255,255,255,0.65)"
          style="pointer-events: none; user-select: none;"
        >* {{ focalSegment.person.birthDate }}</text>
        <text
          v-if="focalSegment?.person?.deathDate"
          :x="CIRCLE_CX" :y="focalLineY(focalNameLines.length + 1, focalNameLines.length)"
          text-anchor="middle" dominant-baseline="central"
          font-size="8" :font-family="fontFamily" fill="rgba(255,255,255,0.65)"
          style="pointer-events: none; user-select: none;"
        >† {{ focalSegment.person.deathDate }}</text>
      </template>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CIRCLE_CX, CIRCLE_CY, CIRCLE_SVG_SIZE, type CircleSegment } from '../../utils/circleLayout';
import { fullNameParts } from '../../utils/nameUtils';

interface Props {
  segments: CircleSegment[];
  focalSegment: CircleSegment | null;
  curvedText?: boolean;
  fontFamily?: string;
  linkBase?: string | null;
  strokeWidth?: number;
  width?: number | string;
  height?: number | string;
}

const props = withDefaults(defineProps<Props>(), {
  curvedText: false,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  linkBase: null,
  strokeWidth: 1.5,
});

const emit = defineEmits<{
  navigate: [id: string];
  personenter: [person: NonNullable<CircleSegment['person']>, event: MouseEvent];
  personmove: [event: MouseEvent];
  personleave: [];
}>();

const nonFocalSegments = computed(() => props.segments.filter(s => !s.isFocal));

// Split a string into lines of at most maxChars, up to maxLines lines.
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
      // On the last allowed line, absorb all remaining words without wrapping
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

// Focal name lines: given name (1 line) + surname (up to 2 lines) = up to 3 total.
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

// Y position for focal text lines, centered around CIRCLE_CY.
function focalLineY(lineIndex: number, totalNameLines: number): number {
  const p = props.focalSegment?.person;
  const dateLines = p ? (p.birthDate ? 1 : 0) + (p.deathDate ? 1 : 0) : 0;
  const totalLines = totalNameLines + dateLines;
  const lineHeight = totalLines > 3 ? 10 : 12;
  const startY = CIRCLE_CY - ((totalLines - 1) / 2) * lineHeight;
  return startY + lineIndex * lineHeight;
}

function givenLabel(seg: CircleSegment): string {
  if (!seg.person) return '';
  return seg.person.preferredName ?? seg.person.givenName ?? '';
}

function surnameLabel(seg: CircleSegment): string {
  if (!seg.person) return '';
  return seg.person.surname ?? '';
}

function birthLabel(seg: CircleSegment): string {
  return seg.person?.birthDate ? `* ${seg.person.birthDate}` : '';
}

function deathLabel(seg: CircleSegment): string {
  return seg.person?.deathDate ? `\u2020 ${seg.person.deathDate}` : '';
}

function tooltipLabel(seg: CircleSegment): string {
  if (!seg.person) return '';
  const p = seg.person;
  const name = fullNameParts(p.givenName, p.surname, p.preferredName, p.nickname)
    .map(pt => pt.text).join('');
  const birth = p.birthDate ? ` * ${p.birthDate}` : '';
  const death = p.deathDate ? ` \u2020 ${p.deathDate}` : '';
  return name + birth + death;
}

function nameFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 10, 2: 9, 3: 8.5, 4: 8, 5: 7, 6: 5.5 };
  return sizes[gen] ?? 5.5;
}

function dateFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 8, 2: 7.5, 3: 7, 4: 6.5, 5: 6, 6: 5 };
  return sizes[gen] ?? 5;
}

// Per-generation dy offsets for radial/straight text stacking.
// Gen 6 arc width ~35.8px so we use 7px gaps; all others use 10px.
function lineDy(seg: CircleSegment): { given: string; surname: string; birth: string; death: string } {
  const hasDates = !!(birthLabel(seg) || deathLabel(seg));
  const hasGiven = !!givenLabel(seg);
  const gap = seg.generation >= 6 ? 7 : 10;
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
