<!-- src/renderer/components/charts/CircleChart.vue -->
<template>
  <div class="chart-outer" ref="outerRef">
    <div class="chart-scroll" ref="scrollRef" @wheel="onWheel">
      <div v-if="loading" class="chart-loading">{{ $t('common.loading') }}</div>
      <svg
        v-else
        :width="svgDisplaySize"
        :height="svgDisplaySize"
        :viewBox="`0 0 ${CIRCLE_SVG_SIZE} ${CIRCLE_SVG_SIZE}`"
        data-testid="circle-svg"
      >
        <!-- Curved text paths in defs (only when curvedText is on) -->
        <defs v-if="curvedText">
          <path v-for="seg in nonFocalSegments" :key="`tpg-${seg.ahnNum}`" :id="`tpg-${seg.ahnNum}`" :d="seg.textPathGivenD" />
          <path v-for="seg in nonFocalSegments" :key="`tp-${seg.ahnNum}`"  :id="`tp-${seg.ahnNum}`"  :d="seg.textPathD" />
          <path v-for="seg in nonFocalSegments" :key="`tpd-${seg.ahnNum}`" :id="`tpd-${seg.ahnNum}`" :d="seg.textPathDateD" />
        </defs>

        <!-- Non-focal segments -->
        <g
          v-for="seg in nonFocalSegments"
          :key="seg.ahnNum"
          :class="['circle-seg', { clickable: !seg.isEmpty }]"
          @click="!seg.isEmpty && $emit('navigate', seg.person!.id)"
        >
          <path
            :d="seg.pathD"
            :fill="seg.fill"
            stroke="white"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <!-- Hover tooltip via native SVG title (works in Electron WebView) -->
          <title v-if="seg.person">{{ tooltipLabel(seg) }}</title>

          <!-- Curved text mode: given name + surname + date each on their own arc -->
          <template v-if="curvedText && seg.person && seg.generation <= 5">
            <!-- Given name arc (gen 1-4 only) -->
            <text
              v-if="seg.generation <= 4 && givenLabel(seg)"
              text-anchor="middle"
              :font-size="nameFontSize(seg.generation)"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-weight="600"
              fill="white"
              style="pointer-events: none; user-select: none;"
            >
              <textPath :href="`#tpg-${seg.ahnNum}`" startOffset="50%">{{ givenLabel(seg) }}</textPath>
            </text>
            <!-- Surname arc -->
            <text
              text-anchor="middle"
              :font-size="nameFontSize(seg.generation)"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-weight="600"
              fill="white"
              style="pointer-events: none; user-select: none;"
            >
              <textPath :href="`#tp-${seg.ahnNum}`" startOffset="50%">{{ surnameLabel(seg) }}</textPath>
            </text>
            <!-- Date arc (gen 1-4 only) -->
            <text
              v-if="seg.generation <= 4 && lifespan(seg)"
              text-anchor="middle"
              :font-size="dateFontSize(seg.generation)"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              fill="rgba(255,255,255,0.75)"
              style="pointer-events: none; user-select: none;"
            >
              <textPath :href="`#tpd-${seg.ahnNum}`" startOffset="50%">{{ lifespan(seg) }}</textPath>
            </text>
          </template>

          <!-- Straight tangential text (gen 1-4): given + surname + dates, stacked radially -->
          <template v-else-if="!curvedText && seg.person && seg.generation <= 4">
            <g :transform="`rotate(${seg.textAngle}, ${seg.textX}, ${seg.textY})`">
              <text
                v-if="givenLabel(seg)"
                :x="seg.textX"
                :y="seg.textY"
                :dy="lifespan(seg) ? '-9' : '-5'"
                text-anchor="middle"
                dominant-baseline="central"
                :font-size="nameFontSize(seg.generation)"
                font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                font-weight="600"
                fill="white"
                style="pointer-events: none; user-select: none;"
              >{{ givenLabel(seg) }}</text>
              <text
                :x="seg.textX"
                :y="seg.textY"
                :dy="lifespan(seg) ? '2' : '5'"
                text-anchor="middle"
                dominant-baseline="central"
                :font-size="nameFontSize(seg.generation)"
                font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                font-weight="600"
                fill="white"
                style="pointer-events: none; user-select: none;"
              >{{ surnameLabel(seg) }}</text>
              <text
                v-if="lifespan(seg)"
                :x="seg.textX"
                :y="seg.textY"
                dy="13"
                text-anchor="middle"
                dominant-baseline="central"
                :font-size="dateFontSize(seg.generation)"
                font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                fill="rgba(255,255,255,0.75)"
                style="pointer-events: none; user-select: none;"
              >{{ lifespan(seg) }}</text>
            </g>
          </template>

          <!-- Straight radial text (gen 5-6): text rotated 90° so it reads outward from center.
               dy offsets now shift tangentially (stacking lines along the arc width).
               The deeper ring (68-58px) gives enough radial space for full name + dates. -->
          <template v-else-if="!curvedText && seg.person && seg.generation >= 5">
            <g :transform="`rotate(${seg.textAngleRadial}, ${seg.textX}, ${seg.textY})`">
              <text
                v-if="givenLabel(seg)"
                :x="seg.textX"
                :y="seg.textY"
                :dy="lifespan(seg) ? '-9' : '-5'"
                text-anchor="middle"
                dominant-baseline="central"
                :font-size="nameFontSize(seg.generation)"
                font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                font-weight="600"
                fill="white"
                style="pointer-events: none; user-select: none;"
              >{{ givenLabel(seg) }}</text>
              <text
                :x="seg.textX"
                :y="seg.textY"
                :dy="givenLabel(seg) ? (lifespan(seg) ? '2' : '5') : '0'"
                text-anchor="middle"
                dominant-baseline="central"
                :font-size="nameFontSize(seg.generation)"
                font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                font-weight="600"
                fill="white"
                style="pointer-events: none; user-select: none;"
              >{{ surnameLabel(seg) }}</text>
              <text
                v-if="lifespan(seg)"
                :x="seg.textX"
                :y="seg.textY"
                dy="13"
                text-anchor="middle"
                dominant-baseline="central"
                :font-size="dateFontSize(seg.generation)"
                font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                fill="rgba(255,255,255,0.75)"
                style="pointer-events: none; user-select: none;"
              >{{ lifespan(seg) }}</text>
            </g>
          </template>
        </g>

        <!-- Focal person circle (rendered on top of segments) -->
        <circle
          v-if="focalSegment"
          :cx="CIRCLE_CX" :cy="CIRCLE_CY" r="50"
          :fill="focalSegment.fill"
        />
        <!-- Focal name: up to 3 lines (wraps at most twice) -->
        <text
          v-for="(line, i) in focalNameLines"
          :key="i"
          :x="CIRCLE_CX"
          :y="focalLineY(i, focalNameLines.length)"
          text-anchor="middle"
          dominant-baseline="central"
          :font-size="focalNameLines.length > 2 ? 9 : 10"
          font-weight="600"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fill="white"
          style="pointer-events: none; user-select: none;"
        >{{ line }}</text>
        <!-- Focal dates -->
        <text
          v-if="focalSegment?.person && focalDates"
          :x="CIRCLE_CX"
          :y="focalLineY(focalNameLines.length, focalNameLines.length)"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="8"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fill="rgba(255,255,255,0.65)"
          style="pointer-events: none; user-select: none;"
        >{{ focalDates }}</text>
      </svg>
    </div>

    <div class="zoom-controls">
      <span class="zoom-label">Generationer:</span>
      <button class="zoom-btn" @click="decrGens" :disabled="selectedGens <= 1">−</button>
      <span class="zoom-level">{{ selectedGens }}</span>
      <button class="zoom-btn" @click="incrGens" :disabled="selectedGens >= 6">+</button>
      <span class="zoom-sep">|</span>
      <button
        class="zoom-btn"
        :class="{ active: curvedText }"
        @click="curvedText = !curvedText"
        title="Böj text längs cirkeln"
      >⌒</button>
      <span class="zoom-sep">|</span>
      <button class="zoom-btn" @click="zoomIn" title="Zoom in">+</button>
      <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
      <button class="zoom-btn" @click="zoomOut">−</button>
      <button class="zoom-btn" @click="resetZoom" title="Reset zoom">↺</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeCircleLayout, CIRCLE_CX, CIRCLE_CY, CIRCLE_SVG_SIZE, type CircleSegment } from '../../utils/circleLayout';
import { fetchPedigreeTree } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import { fullNameParts } from '../../utils/nameUtils';
import type { PedigreeTree } from '../../utils/chartLayout';

useI18n();

const props = defineProps<{ personId: string | undefined }>();
const emit = defineEmits<{ navigate: [id: string] }>();

const loading = ref(true);
const tree = ref<PedigreeTree | null>(null);
const selectedGens = ref(6);
const curvedText = ref(false);
const outerRef = ref<HTMLElement | null>(null);
const containerSize = ref(700);

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom } = useChartZoom(1, 'viz-zoom-circle');

// Scale SVG to fill container, then apply zoom on top
const svgDisplaySize = computed(() => containerSize.value * zoom.value);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      containerSize.value = Math.min(width, height);
    }
  });
  if (outerRef.value) resizeObserver.observe(outerRef.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

function incrGens() { if (selectedGens.value < 6) selectedGens.value++; }
function decrGens() { if (selectedGens.value > 1) selectedGens.value--; }

const layout = computed<CircleSegment[]>(() =>
  tree.value ? computeCircleLayout(tree.value, selectedGens.value) : [],
);

const focalSegment = computed(() => layout.value.find(s => s.isFocal) ?? null);
const nonFocalSegments = computed(() => layout.value.filter(s => !s.isFocal));

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
  const p = focalSegment.value?.person;
  if (!p) return [];
  const given = p.preferredName ?? p.givenName ?? '';
  const surname = p.surname ?? '';
  const lines: string[] = [];
  if (given) lines.push(given);
  if (surname) lines.push(...wrapText(surname, 11, 2));
  return lines;
});

// Y position for focal text lines, centered around CIRCLE_CY.
// We offset by how many date lines follow (1 if dates exist).
function focalLineY(lineIndex: number, totalNameLines: number): number {
  const hasDates = !!focalDates.value;
  const totalLines = totalNameLines + (hasDates ? 1 : 0);
  const lineHeight = totalLines > 3 ? 10 : 12;
  const startY = CIRCLE_CY - ((totalLines - 1) / 2) * lineHeight;
  return startY + lineIndex * lineHeight;
}

const focalDates = computed(() => {
  const p = focalSegment.value?.person;
  if (!p) return '';
  if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`;
  if (p.birthYear) return p.living ? `f. ${p.birthYear}` : `${p.birthYear}–`;
  return '';
});

function givenLabel(seg: CircleSegment): string {
  if (!seg.person) return '';
  return seg.person.preferredName ?? seg.person.givenName ?? '';
}

function surnameLabel(seg: CircleSegment): string {
  if (!seg.person) return '';
  return seg.person.surname ?? seg.person.givenName ?? '';
}

// Full name on one line for curved text (gen 1-4), surname only for gen 5.
function curvedLabel(seg: CircleSegment): string {
  if (!seg.person) return '';
  const p = seg.person;
  if (seg.generation <= 4) {
    const given = p.preferredName ?? p.givenName ?? '';
    const surname = p.surname ?? '';
    return given && surname ? `${given} ${surname}` : given || surname;
  }
  return p.surname ?? p.givenName ?? '';
}

// Lifespan: "BIRTH–DEATH", "BIRTH–", or "BIRTH".
function lifespan(seg: CircleSegment): string {
  const p = seg.person;
  if (!p) return '';
  if (p.birthYear && p.deathYear) return `${p.birthYear}–${p.deathYear}`;
  if (p.birthYear) return p.living ? `f. ${p.birthYear}` : `${p.birthYear}–`;
  return '';
}

function tooltipLabel(seg: CircleSegment): string {
  if (!seg.person) return '';
  const p = seg.person;
  const name = fullNameParts(p.givenName, p.surname, p.preferredName, p.nickname)
    .map(pt => pt.text).join('');
  const dates = p.birthYear && p.deathYear
    ? ` (${p.birthYear}–${p.deathYear})`
    : p.birthYear ? ` (${p.birthYear}–)` : '';
  return name + dates;
}

function nameFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 10, 2: 9, 3: 8.5, 4: 8, 5: 7, 6: 6.5 };
  return sizes[gen] ?? 6.5;
}

function dateFontSize(gen: number): number {
  const sizes: Record<number, number> = { 1: 8, 2: 7.5, 3: 7, 4: 6.5, 5: 6, 6: 6 };
  return sizes[gen] ?? 6;
}

async function load() {
  if (!props.personId) return;
  loading.value = true;
  try {
    // selectedGens + 1: focal (gen 0) + N ancestor rings
    tree.value = await fetchPedigreeTree(props.personId, selectedGens.value + 1);
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, load);
watch(selectedGens, load);
onMounted(load);
</script>

<style scoped>
.chart-outer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.chart-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chart-scroll > svg {
  flex-shrink: 0;
}
.chart-loading { color: #999; padding: 40px; text-align: center; }

.circle-seg.clickable { cursor: pointer; }
.circle-seg.clickable:hover path { opacity: 0.85; }

.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(255, 255, 255, 0.93);
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 3px 5px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
.zoom-btn {
  background: none;
  border: none;
  padding: 2px 7px;
  cursor: pointer;
  font-size: 14px;
  border-radius: 3px;
  color: #555;
  line-height: 1.4;
}
.zoom-btn:hover { background: #f0f0f0; }
.zoom-btn.active { background: #e0eaf5; color: #2060a0; }
.zoom-level {
  padding: 0 4px;
  font-size: 12px;
  color: #666;
  min-width: 24px;
  text-align: center;
}
.zoom-sep {
  color: #ccc;
  padding: 0 3px;
}
.zoom-label {
  font-size: 11px;
  color: #888;
  padding: 0 4px 0 2px;
}
</style>
