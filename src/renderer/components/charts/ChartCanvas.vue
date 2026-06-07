<template>
  <div class="chart-outer" ref="outerRef">
    <div v-if="loading && tree" class="chart-reload-indicator" aria-live="polite">{{ $t('common.loading') }}</div>
    <div :class="['chart-scroll', { panning: isPanning }]" ref="scrollEl" @wheel="$emit('wheel', $event)"
         @mousedown="$emit('mousedown', $event)" @mousemove="$emit('mousemove', $event)" @mouseup="$emit('mouseup', $event)" @mouseleave="$emit('mouseup', $event)">
      <div v-if="loading && !tree" class="chart-loading">{{ $t('common.loading') }}</div>
      <svg
        v-if="tree"
        :width="layout.svgWidth * zoom"
        :height="layout.svgHeight * zoom"
        :viewBox="`0 ${layout.viewBoxMinY} ${layout.svgWidth} ${layout.svgHeight}`"
        :data-testid="testId ?? 'chart-svg'"
        role="tree"
        :aria-label="$t(props.ariaLabel)"
      >
        <defs>
          <filter id="chart-shadow" x="-3%" y="-6%" width="106%" height="116%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.06" />
          </filter>
        </defs>
        <path
          v-for="(d, i) in solidPaths"
          :key="'p' + i"
          :d="d"
          fill="none"
          :stroke="chartTokens.line"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
        <g
          v-for="box in layout.boxes"
          :key="box.person.id"
          v-memo="[box, props.colorMode, props.readonly, focusedBoxId === box.person.id, props.addBtnStyle]"
          :data-testid="'person-box-' + box.person.id"
          filter="url(#chart-shadow)"
          :class="['person-box', 'clickable', { focused: focusedBoxId === box.person.id }]"
          :style="{ cursor: 'pointer' }"
          role="treeitem"
          :aria-label="boxAriaLabel(box)"
          tabindex="0"
          @click="$emit('navigate', box.person.id)"
          @dblclick="$emit('focus-person', box.person.id)"
          @keydown="$emit('box-keydown', { event: $event, box })"
          @focus="focusedBoxId = box.person.id"
          @blur="focusedBoxId = null"
        >
          <!-- Box background -->
          <rect
            :x="box.x" :y="box.y" :width="box.w" :height="box.h"
            rx="6"
            :fill="boxFill(box)"
            :stroke="boxStroke(box)"
            stroke-width="1"
          />
          <!-- Sex indicator bar (3px wide) -->
          <rect
            :x="box.x" :y="box.y"
            width="3" :height="box.h"
            rx="1.5"
            :fill="sexBg(box.person.sex)"
          />
          <!-- Portrait area -->
          <rect
            :x="box.x + BOX_PAD_X_LEFT" :y="portraitY(box)"
            :width="PORTRAIT_W" :height="PORTRAIT_H"
            rx="3"
            :fill="portraitBg(box)"
          />
          <image
            v-if="box.person.photoUrl"
            :href="box.person.photoUrl"
            :x="box.x + BOX_PAD_X_LEFT" :y="portraitY(box)"
            :width="PORTRAIT_W" :height="PORTRAIT_H"
            preserveAspectRatio="xMidYMid slice"
          />
          <text
            v-else
            :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W / 2"
            :y="portraitY(box) + PORTRAIT_H / 2"
            text-anchor="middle"
            dominant-baseline="central"
            font-size="11"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="portraitTextColor()"
          >{{ initials(box) }}</text>
          <!-- Name lines -->
          <text
            font-size="12"
            font-weight="600"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="nameColor(box)"
            xml:space="preserve"
          >
            <tspan
              v-for="(line, li) in wrappedName(box)"
              :key="li"
              :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W + PORTRAIT_GAP"
              :y="nameStartY(box) + li * 16"
            ><tspan
                v-for="(seg, si) in line"
                :key="si"
                :text-decoration="seg.underline ? 'underline' : ''"
              >{{ seg.text }}</tspan></tspan>
          </text>
          <!-- Birth line -->
          <text
            v-if="box.person.birthDate || box.person.birthPlace"
            :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W + PORTRAIT_GAP"
            :y="birthY(box)"
            font-size="10"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="dateColor(box)"
          >{{ birthText(box) }}</text>
          <!-- Death line -->
          <text
            v-if="box.person.deathDate || box.person.deathPlace"
            :x="box.x + BOX_PAD_X_LEFT + PORTRAIT_W + PORTRAIT_GAP"
            :y="deathY(box)"
            font-size="10"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="dateColor(box)"
          >{{ deathText(box) }}</text>
          <!-- Add-family-member badge — shape from Utseende → Knapp -->
          <g
            v-if="!readonly"
            :class="['add-relative-btn', `add-relative-btn--${props.addBtnStyle}`]"
            :transform="`translate(${box.x + box.w}, ${box.y})`"
            role="button"
            :aria-label="$t('personDetail.addRelativeLabel')"
            @click.stop="(ev: MouseEvent) => $emit('person-context-menu', { personId: box.person.id, x: ev.clientX, y: ev.clientY })"
          >
            <template v-if="props.addBtnStyle === 'plus'">
              <circle r="10" />
              <line x1="-5" y1="0" x2="5" y2="0" />
              <line x1="0" y1="-5" x2="0" y2="5" />
            </template>
            <template v-else>
              <rect x="-12" y="-12" width="24" height="24" fill="transparent" />
              <text class="add-relative-leaf-glyph" text-anchor="middle" dominant-baseline="central" font-size="20">🍃</text>
            </template>
          </g>
        </g>
        <g
          v-if="!readonly"
          v-for="btn in layout.collapseButtons"
          :key="`${btn.personId}:${btn.direction}`"
          class="collapse-btn"
          @click.stop="$emit('collapse-toggle', btn)"
        >
          <circle
            :cx="btn.cx" :cy="btn.cy" r="8"
            :fill="btn.isExpanded ? 'white' : '#888'"
            :stroke="btn.isExpanded ? '#aaa' : '#555'"
            stroke-width="1.5"
          />
          <text
            :x="btn.cx" :y="btn.cy"
            text-anchor="middle" dominant-baseline="central"
            font-size="9"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            :fill="btn.isExpanded ? '#666' : 'white'"
            style="pointer-events: none; user-select: none;"
          >{{ { up: '▲', down: '▼', left: '◀', right: '▶' }[btn.direction] }}</text>
        </g>
        <template v-if="!readonly">
        <path
          v-for="(d, i) in dashedPaths"
          :key="'dp' + i"
          :d="d"
          fill="none"
          :stroke="chartTokens.placeholderStroke"
          stroke-width="1"
          stroke-dasharray="4 3"
          vector-effect="non-scaling-stroke"
        />
        <g
          v-for="ph in layout.placeholders"
          :key="'ph-' + ph.role + '-' + ph.childPersonId"
          class="ghost-box"
          tabindex="0"
          role="button"
          :aria-label="placeholderLabel(ph.role)"
          @click="$emit('add-from-placeholder', ph)"
          @keydown.enter="$emit('add-from-placeholder', ph)"
          @keydown.space.prevent="$emit('add-from-placeholder', ph)"
        >
          <rect
            :x="ph.x + BOX_W / 4" :y="ph.y + MIN_BOX_H / 4" :width="BOX_W / 2" :height="MIN_BOX_H / 2"
            rx="6" ry="6"
            fill="transparent" :stroke="chartTokens.placeholderStroke" stroke-dasharray="4 3" stroke-width="1.5"
          />
          <text
            :x="ph.x + BOX_W / 2" :y="ph.y + MIN_BOX_H / 2 - 2"
            text-anchor="middle" :fill="chartTokens.placeholderText" font-size="14"
          >+</text>
          <text
            :x="ph.x + BOX_W / 2" :y="ph.y + MIN_BOX_H / 2 + 9"
            text-anchor="middle" :fill="chartTokens.placeholderText" font-size="9"
          >{{ placeholderLabel(ph.role) }}</text>
        </g>
        </template>
      </svg>
    </div>
    <slot name="zoom-controls" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { BOX_W, MIN_BOX_H, PORTRAIT_W, PORTRAIT_H, BOX_PAD_X_LEFT, PORTRAIT_GAP } from '../../utils/chart-layout';
import type { ChartLayout, BoxLayout, CollapseButton, PlaceholderBox } from '../../utils/chart-layout';
import { useChartBox } from '../../composables/useChartBox';
import { useChartColors, applyColorMode } from '../../composables/useChartColors';
import type { ColorMode } from '../../../api/chart-export';

// useI18n must be called within setup so $t resolves inside this component's
// template; the template references it directly via $t.
useI18n();

const props = defineProps<{
  layout: ChartLayout;
  tree: unknown | null;          // truthy gate for rendering the svg
  loading: boolean;
  zoom: number;
  isPanning: boolean;
  readonly?: boolean;
  colorMode?: ColorMode;
  selectedId: string | null;
  ariaLabel: string;             // i18n KEY for the svg role="tree" aria-label
  testId?: string;               // data-testid for the svg root (chart-specific)
  addBtnStyle: 'plus' | 'leaf';
}>();

const emit = defineEmits<{
  navigate: [id: string];
  'focus-person': [id: string];                                   // double-click → re-root
  'person-context-menu': [payload: { personId: string; x: number; y: number }];
  'collapse-toggle': [btn: CollapseButton];
  'add-from-placeholder': [ph: PlaceholderBox];
  'box-keydown': [payload: { event: KeyboardEvent; box: BoxLayout }];
  wheel: [e: WheelEvent];
  mousedown: [e: MouseEvent]; mousemove: [e: MouseEvent]; mouseup: [e: MouseEvent];
}>();

// Inner scroll element — the parent binds its useChartZoom scrollRef to this
// in onMounted. ChartCanvas only EXPOSES it; pan/zoom stays in the parent.
const scrollEl = ref<HTMLElement | null>(null);

// Focus state for the keyboard-navigation focus ring. Pure local UI state.
const focusedBoxId = ref<string | null>(null);

const solidPaths = computed(() =>
  props.layout.paths.filter(d => !d.startsWith('D:')),
);
const dashedPaths = computed(() =>
  props.layout.paths.filter(d => d.startsWith('D:')).map(d => d.slice(2)),
);

const outerRef = ref<HTMLElement | null>(null);
const baseColors = useChartColors(true, outerRef);
const colors = computed(() => applyColorMode(baseColors.value, props.colorMode ?? 'themed'));

// Backward-compat alias so template references to chartTokens still work.
const chartTokens = computed(() => ({
  line: colors.value.line,
  placeholderStroke: colors.value.placeholderStroke,
  placeholderText: colors.value.placeholderText,
}));

const colorModeRef = computed<ColorMode>(() => props.colorMode ?? 'themed');
const selectedIdRef = computed(() => props.selectedId);
const {
  sexBg,
  boxFill,
  boxStroke,
  nameColor,
  dateColor,
  portraitBg,
  portraitTextColor,
  wrappedName,
  birthText,
  deathText,
  initials,
  nameStartY,
  portraitY,
  birthY,
  deathY,
  placeholderLabel,
  boxAriaLabel,
} = useChartBox({ colors, colorMode: colorModeRef, selectedId: selectedIdRef });

// Selection auto-pan — when the selected person changes, pan the scroll
// container so the box is on screen (~100 px inset from each edge). Shared by
// all three charts so selecting a relative always scrolls it into view, not
// just in Hourglass. Uses getBoundingClientRect against the rendered box <g>
// (every box carries data-testid="person-box-<id>"), so it's chart-agnostic —
// no per-chart layout/zoom/viewBox math needed.
function scrollSelectedIntoView(id: string | null) {
  if (!id || !scrollEl.value) return;
  const el = scrollEl.value.querySelector(`[data-testid="person-box-${id}"]`) as SVGGElement | null;
  if (!el) return;
  const box = el.getBoundingClientRect();
  const container = scrollEl.value.getBoundingClientRect();
  const inset = 100;
  if (box.left < container.left + inset) scrollEl.value.scrollLeft -= (container.left + inset - box.left);
  else if (box.right > container.right - inset) scrollEl.value.scrollLeft += (box.right - (container.right - inset));
  if (box.top < container.top + inset) scrollEl.value.scrollTop -= (container.top + inset - box.top);
  else if (box.bottom > container.bottom - inset) scrollEl.value.scrollTop += (box.bottom - (container.bottom - inset));
}
watch(() => props.selectedId, async (id) => { await nextTick(); scrollSelectedIntoView(id); });

defineExpose({ scrollEl });
</script>

<style scoped>
.chart-outer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.chart-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  cursor: grab;
}
.chart-scroll.panning {
  cursor: grabbing;
  user-select: none;
}
.chart-scroll.panning * {
  cursor: grabbing;
}
.chart-loading { color: #999; padding: 40px; text-align: center; }
.chart-reload-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  color: var(--text-muted);
  font-size: var(--font-xs);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  pointer-events: none;
  z-index: 20;
  box-shadow: var(--shadow-sm);
}
.person-box.clickable { cursor: pointer; }
.person-box.clickable:hover rect:first-child { opacity: 0.9; }
.person-box:focus { outline: none; }
.person-box.focused > rect:first-child,
.person-box:focus-visible > rect:first-child {
  stroke: var(--color-primary);
  stroke-width: 2.5;
}
.collapse-btn { cursor: pointer; }
.collapse-btn:hover circle { opacity: 0.7; }

.ghost-box { cursor: pointer; }
.ghost-box:hover rect { stroke: var(--color-primary, #3b82f6); }
.ghost-box:hover text { fill: var(--color-primary, #3b82f6); }
.ghost-box:focus { outline: 2px solid var(--color-primary, #3b82f6); outline-offset: 2px; border-radius: 6px; }

.add-relative-btn { cursor: pointer; }
.add-relative-btn circle {
  fill: var(--surface);
  stroke: var(--surface-border);
  stroke-width: 1;
  transition: fill 0.1s, stroke 0.1s;
}
.add-relative-btn line {
  stroke: var(--text-muted);
  stroke-width: 1.6;
  stroke-linecap: round;
  pointer-events: none;
}
.add-relative-btn:hover circle { fill: var(--accent); stroke: var(--accent); }
.add-relative-btn:hover line { stroke: var(--accent-text); }
.add-relative-leaf-glyph {
  pointer-events: none;
  user-select: none;
  transition: transform 0.1s;
}
.add-relative-btn:hover .add-relative-leaf-glyph { transform: scale(1.15); }
</style>
