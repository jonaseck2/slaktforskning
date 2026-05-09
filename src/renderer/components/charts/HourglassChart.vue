<template>
  <div class="chart-outer" ref="outerRef">
    <div v-if="loading && tree" class="chart-reload-indicator" aria-live="polite">{{ $t('common.loading') }}</div>
    <div :class="['chart-scroll', { panning: isPanning }]" ref="scrollRef" @wheel="onWheel"
         @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
      <div v-if="loading && !tree" class="chart-loading">{{ $t('common.loading') }}</div>
      <svg
        v-if="tree"
        :width="layout.svgWidth * zoom"
        :height="layout.svgHeight * zoom"
        :viewBox="`0 ${layout.viewBoxMinY} ${layout.svgWidth} ${layout.svgHeight}`"
        data-testid="hourglass-svg"
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
          :ref="(el) => box.isFocal && setFocusBoxEl(el as Element | null)"
          v-memo="[box.x, box.y, box.w, box.h, box.isFocal, box.person.id, box.person.sex, box.person.living, box.person.givenName, box.person.surname, box.person.preferredName, box.person.nickname, box.person.birthDate, box.person.birthPlace, box.person.deathDate, box.person.deathPlace, box.person.photoUrl, props.colorMode, props.readonly, addBtnStyle]"
          :data-testid="'person-box-' + box.person.id"
          filter="url(#chart-shadow)"
          :class="['person-box', 'clickable']"
          :style="{ cursor: 'pointer' }"
          @click="$emit('navigate', box.person.id)"
          @dblclick="onPersonDblClick(box.person.id)"
        >
          <!-- Box background -->
          <rect
            :x="box.x" :y="box.y" :width="box.w" :height="box.h"
            rx="6"
            :fill="boxFill(box)"
            :stroke="boxStroke(box)"
            stroke-width="1"
          />
          <!-- Sex indicator bar -->
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
          <!-- Add-family-member badge — small floating shape at the top-right corner.
               Shape (plus circle vs tilted leaf) is configurable in Utseende → Knapp. -->
          <g
            v-if="!readonly"
            :class="['add-relative-btn', `add-relative-btn--${addBtnStyle}`]"
            :transform="`translate(${box.x + box.w}, ${box.y})`"
            role="button"
            :aria-label="$t('personDetail.addRelativeLabel')"
            @click.stop="(ev: MouseEvent) => $emit('person-context-menu', { personId: box.person.id, x: ev.clientX, y: ev.clientY })"
          >
            <template v-if="addBtnStyle === 'plus'">
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
        <template v-if="!readonly">
          <g
            v-for="btn in layout.collapseButtons"
            :key="`${btn.personId}:${btn.direction}:${btn.coParentId ?? ''}`"
            class="collapse-btn"
            @click.stop="handleCollapseButton(btn)"
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
            :key="'ph-' + (ph.key ?? ph.role + '-' + ph.childPersonId)"
            class="ghost-box"
            tabindex="0"
            role="button"
            :aria-label="placeholderLabel(ph.role)"
            @click="startAddFromPlaceholder(ph)"
            @keydown.enter="startAddFromPlaceholder(ph)"
            @keydown.space.prevent="startAddFromPlaceholder(ph)"
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
              :x="ph.x + BOX_W / 2" :y="ph.y + MIN_BOX_H / 2 + 12"
              text-anchor="middle" :fill="chartTokens.placeholderText" font-size="11"
            >{{ placeholderLabel(ph.role) }}</text>
          </g>
        </template>
      </svg>
    </div>
    <ZoomControls overlay :zoom="zoom" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom">
      <span class="zoom-extra-label" :title="$t('chart.tooltip.generationCount')" :aria-label="$t('chart.tooltip.generationCount')">{{ $t('reports.generations') }}</span>
      <button class="zoom-extra-btn" :title="$t('chart.tooltip.generationDecrease')" :aria-label="$t('chart.tooltip.generationDecrease')" @click="decrGens" :disabled="genTarget <= 1">−</button>
      <span class="zoom-extra-value" :title="$t('chart.tooltip.generationCount')" :aria-label="$t('chart.tooltip.generationCount')">{{ genTarget }}</span>
      <button class="zoom-extra-btn" :title="$t('chart.tooltip.generationIncrease')" :aria-label="$t('chart.tooltip.generationIncrease')" @click="incrGens">+</button>
    </ZoomControls>

    <!-- Add related person modal -->
    <PersonModal
      v-if="showAddRelative && addRelativePersonId"
      mode="standalone"
      :add-related-to="{ personId: addRelativePersonId, mode: addRelativeMode, personSex: addRelativePersonSex, personSurname: addRelativePersonSurname }"
      @saved="onRelativeSaved"
      @close="showAddRelative = false"
      @cancel="showAddRelative = false"
    />

    <!-- First-encounter coachmark anchored on the focus person box. Auto-dismisses
         once the user double-clicks any person (focusChangedOnce flips true). -->
    <Coachmark
      seen-key="coach.hourglass.focus"
      :anchor-el="focusBoxEl"
      tip-key="onboarding.coach.hourglassFocus.tip"
      dismiss-key="onboarding.coach.hourglassFocus.dismiss"
      placement="below"
      :auto-dismiss-on="() => focusChangedOnce"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, toRef, inject } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeHourglassLayout, BOX_W, MIN_BOX_H, PORTRAIT_W, PORTRAIT_H, BOX_PAD_X_LEFT, BOX_PAD_Y, PORTRAIT_GAP, TEXT_AREA_W, ADD_BTN_AREA_W, BOX_PAD_X_RIGHT } from '../../utils/chart-layout';
import { wrapFullNameSegments, truncateToWidth } from '../../utils/chart-layout/measure';
import { fetchHourglassTreePerson, loadAncestorGenerationTP, loadChildrenForNodeTP } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import { STORAGE_KEYS } from '../../utils/storage-keys';
import type { BoxLayout, CollapseButton, TreePerson, PlaceholderBox } from '../../utils/chart-layout';
import { useChartColors, applyColorMode } from '../../composables/useChartColors';
import { useEntityData } from '../../composables/useEntityData';
import type { ColorMode } from '../../../api/chart-export';
import PersonModal from '../modals/PersonModal.vue';
import ZoomControls from '../ZoomControls.vue';
import Coachmark from '../ui/Coachmark.vue';
import { hourglassGenerations } from '../../composables/useChartGenerations';
import { useSelectedParentInfo } from '../../composables/useSelectedParentInfo';

const { t } = useI18n();

const props = defineProps<{ personId: string | undefined; readonly?: boolean; selectedPersonId?: string | null; colorMode?: ColorMode }>();

// Add-family-member badge style — provided by App.vue's appearance-store.
const appearanceStore = inject<{ addBtnStyle: Ref<'plus' | 'leaf'> } | undefined>('appearance-store', undefined);
const addBtnStyle = computed<'plus' | 'leaf'>(() => appearanceStore?.addBtnStyle?.value ?? 'plus');
const emit = defineEmits<{
  navigate: [id: string];
  reload: [];
  'person-context-menu': [payload: { personId: string; x: number; y: number }];
  'focus-person': [id: string];
}>();

// Coachmark anchor — set to the focal person's <g> element via callback ref
// inside the v-for. Stays null until the layout renders the focal box.
const focusBoxEl = ref<HTMLElement | null>(null);
function setFocusBoxEl(el: Element | null) {
  // SVG <g> elements are Element, not HTMLElement, but Coachmark only calls
  // getBoundingClientRect() on it — which is on Element — so the cast is safe.
  focusBoxEl.value = (el as HTMLElement | null) ?? null;
}

// Flips on the first focus-switch double-click; drives the Coachmark's
// auto-dismiss so the user only ever sees the hint once they've
// successfully done the gesture (or until they restart with seen flag set).
const focusChangedOnce = ref(false);
function onPersonDblClick(personId: string) {
  focusChangedOnce.value = true;
  emit('focus-person', personId);
}

const loadingMore = ref(false);
const collapsed = ref(new Set<string>());
const genTarget = hourglassGenerations;
const loadedGens = ref(3);

watch(genTarget, (n) => {
  if (!tree.value) return;
  if (n > loadedGens.value) load();
  else applyGenerationDepth(n);
});

const showAddRelative = ref(false);
const addRelativePersonId = ref<string | null>(null);
type AddRelativeMode = 'father' | 'mother' | 'spouse' | 'child' | 'son' | 'daughter';
const addRelativeMode = ref<AddRelativeMode>('father');
const addRelativePersonSex = ref<'M' | 'F' | 'U' | undefined>(undefined);
const addRelativePersonSurname = ref<string | undefined>(undefined);

function placeholderLabel(role: string): string {
  const labels: Record<string, string> = {
    father: t('personDetail.addFather'),
    mother: t('personDetail.addMother'),
    spouse: t('personDetail.addSpouse'),
    son: t('personDetail.addSon'),
    daughter: t('personDetail.addDaughter'),
  };
  return labels[role] ?? role;
}

const selectedParentInfo = useSelectedParentInfo(toRef(props, 'selectedPersonId'));

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], paths: [], svgWidth: 1400, svgHeight: 688, viewBoxMinY: 0, collapseButtons: [], placeholders: [], placeholderLines: [] };
  return computeHourglassLayout(tree.value, collapsed.value, props.selectedPersonId, selectedParentInfo.value);
});

// Path-class prefixes:
//   'D:' — outline placeholder connectors (rendered dashed 4 3, placeholder colour)
//   (no prefix) — parent_child + couple connectors (solid)
const solidPaths = computed(() =>
  layout.value.paths.filter(d => !d.startsWith('D:')),
);
const dashedPaths = computed(() =>
  layout.value.paths.filter(d => d.startsWith('D:')).map(d => d.slice(2)),
);

function toggle(personId: string, dir: 'up' | 'down' | 'left' | 'right', coParentId?: string | null) {
  const key = coParentId !== undefined
    ? `${personId}:${dir}:${coParentId ?? 'solo'}`
    : `${personId}:${dir}`;
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}

function applyGenerationDepth(n: number) {
  applyGenerationDepthFor(tree.value, n);
}

function decrGens() {
  if (genTarget.value <= 1) return;
  genTarget.value--;
  applyGenerationDepth(genTarget.value);
}

function incrGens() {
  genTarget.value++;
  if (genTarget.value > loadedGens.value) {
    load();
  } else {
    applyGenerationDepth(genTarget.value);
  }
}

async function handleCollapseButton(btn: CollapseButton) {
  if (!btn.isLoadMore) {
    toggle(btn.personId, btn.direction, btn.coParentId);
    return;
  }
  if (loadingMore.value || !tree.value) return;
  loadingMore.value = true;
  try {
    if (btn.direction === 'up') {
      tree.value = await loadAncestorGenerationTP(tree.value, btn.personId);
    } else if (btn.direction === 'down') {
      tree.value = await loadChildrenForNodeTP(tree.value, btn.personId);
    }
  } finally {
    loadingMore.value = false;
  }
}

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp } = useChartZoom(1, STORAGE_KEYS.vizZoomHourglass);

const outerRef = ref<HTMLElement | null>(null);
const baseColors = useChartColors(true, outerRef);
const colors = computed(() => applyColorMode(baseColors.value, props.colorMode ?? 'themed'));

const chartTokens = computed(() => ({
  line: colors.value.line,
  placeholderStroke: colors.value.placeholderStroke,
  placeholderText: colors.value.placeholderText,
}));

function sexBg(sex: string): string {
  if (sex === 'M') return colors.value.sexMBg;
  if (sex === 'F') return colors.value.sexFBg;
  return colors.value.sexUBg;
}

function isHighlighted(box: BoxLayout): boolean {
  return !!props.selectedPersonId && box.person.id === props.selectedPersonId;
}

function boxFill(box: BoxLayout): string {
  if (isHighlighted(box)) return colors.value.boxFocal;
  if ((props.colorMode ?? 'themed') === 'sex-colored') return sexBg(box.person.sex);
  if (!box.person.living) return colors.value.boxDeceased;
  return colors.value.boxBg;
}

function boxStroke(box: BoxLayout): string {
  return isHighlighted(box) ? colors.value.focalStroke : colors.value.boxStroke;
}

function nameColor(box: BoxLayout): string {
  return isHighlighted(box) ? colors.value.textFocal : colors.value.text;
}

function dateColor(box: BoxLayout): string {
  return isHighlighted(box) ? colors.value.textFocalSub : colors.value.textSub;
}

function portraitBg(box: BoxLayout): string {
  return sexBg(box.person.sex);
}

function portraitTextColor(): string {
  return '#ffffff';
}

function wrappedName(box: BoxLayout) {
  return wrapFullNameSegments(
    box.person.givenName,
    box.person.surname,
    box.person.preferredName,
    box.person.nickname,
    TEXT_AREA_W,
    12,
  );
}

function birthText(box: BoxLayout): string {
  const parts = [box.person.birthDate, box.person.birthPlace].filter(Boolean).join(' ');
  if (!parts) return '';
  return truncateToWidth('* ' + parts, TEXT_AREA_W, 10);
}

function deathText(box: BoxLayout): string {
  const parts = [box.person.deathDate, box.person.deathPlace].filter(Boolean).join(' ');
  if (!parts) return '';
  return truncateToWidth('† ' + parts, TEXT_AREA_W, 10);
}

function initials(box: BoxLayout): string {
  const given = box.person.preferredName ?? box.person.givenName ?? '';
  const sur = box.person.surname ?? '';
  const g = given.trim()[0] ?? '';
  const s = sur.trim()[0] ?? '';
  return (g + s).toUpperCase() || '?';
}

function nameStartY(box: BoxLayout): number {
  return box.y + BOX_PAD_Y + 12;
}

function portraitY(box: BoxLayout): number {
  return box.y + (box.h - PORTRAIT_H) / 2;
}

function birthY(box: BoxLayout): number {
  const lines = wrappedName(box);
  return box.y + BOX_PAD_Y + lines.length * 16 + 10;
}

function deathY(box: BoxLayout): number {
  const hasBirth = !!(box.person.birthDate || box.person.birthPlace);
  return birthY(box) + (hasBirth ? 14 : 0);
}

function startAddFromPlaceholder(ph: PlaceholderBox) {
  const childBox = layout.value.boxes.find((b: BoxLayout) => b.person.id === ph.childPersonId);
  addRelativePersonId.value = ph.childPersonId;
  addRelativeMode.value = ph.role;
  addRelativePersonSex.value = childBox?.person.sex ?? 'U';
  addRelativePersonSurname.value = childBox?.person.surname ?? undefined;
  showAddRelative.value = true;
}

function onRelativeSaved() {
  showAddRelative.value = false;
  emit('reload');
}

// useEntityData drives both the initial load and reload-on-mutation. The
// composable subscribes to onDataChanged and reloads automatically — we no
// longer register a listener ourselves.
//
// `keepViewOnNextLoad` lets callers preserve scroll/collapsed state across a
// reload (used by mutation-driven auto-refresh). The default is to reset
// (used when the focal person changes). The first load sets `prevId` so any
// subsequent reload for the same id is treated as in-place.
let keepViewOnNextLoad = false;
let prevId: string | null = null;
const idRef = computed(() => props.personId ?? null);
const { data: tree, loading, reload } = useEntityData<TreePerson | null>(idRef, async (id) => {
  // Treat same-id reloads as in-place by default (mutation broadcasts) so
  // scroll / collapsed state survive. id-change resets unless an explicit
  // keepView was requested before reload().
  const keepView = keepViewOnNextLoad || id === prevId;
  keepViewOnNextLoad = false;
  prevId = id;
  const gens = Math.max(3, genTarget.value);
  const fetched = await fetchHourglassTreePerson(id, gens, gens);
  loadedGens.value = gens;
  if (!keepView) collapsed.value = new Set();
  // applyGenerationDepth needs `tree.value` to be set — but the composable
  // only assigns the loader's return value after we resolve. So queue the
  // collapsed-set adjustment using the freshly fetched tree directly.
  applyGenerationDepthFor(fetched, genTarget.value);
  // Defer recenter until layout is computed against the new tree.
  if (!keepView) {
    nextTick(() => centerOnFocal());
  }
  return fetched;
});

// applyGenerationDepth originally read tree.value. Provide a tree-explicit
// variant so we can call it with the freshly fetched value before the
// composable has assigned it.
function applyGenerationDepthFor(t: TreePerson | null, n: number) {
  if (!t) return;
  const next = new Set<string>();
  for (const k of collapsed.value) {
    if (k.endsWith(':up') || k.endsWith(':down')) continue;
    next.add(k);
  }
  function walk(node: TreePerson, depth: number, dir: 'up' | 'down', seen: Set<string>) {
    if (seen.has(node.person.id)) return;
    seen.add(node.person.id);
    if (depth >= n) {
      next.add(`${node.person.id}:${dir}`);
      return;
    }
    const children = dir === 'up' ? node.parents : node.children;
    for (const c of children) walk(c, depth + 1, dir, seen);
  }
  for (const p of t.parents) walk(p, 1, 'up', new Set());
  for (const c of t.children) walk(c, 1, 'down', new Set());
  collapsed.value = next;
}

// Imperative reload helper — used internally for genTarget changes and load
// more, and exposed as `refetch` for PersonsView.
function load() {
  return reload();
}

// Reload data in place without remounting the component. Preserves scroll,
// zoom, and collapse state — used by PersonsView when an unrelated mutation
// fires onDataChanged. Zoom is already preserved automatically by
// useChartZoom, which persists to localStorage.
function refetch() {
  keepViewOnNextLoad = true;
  return reload();
}

function centerOnFocal() {
  const focal = layout.value.boxes.find(b => b.isFocal);
  if (!focal || !scrollRef.value) return;
  const focalCenterX = (focal.x + focal.w / 2) * zoom.value;
  const viewportW = (scrollRef.value as HTMLElement).clientWidth;
  (scrollRef.value as HTMLElement).scrollLeft = Math.max(0, focalCenterX - viewportW / 2);
}

// Pan the viewport so the selected box is on screen. Called when the user
// clicks a relative (changing selectedPersonId) without re-rooting the tree.
// Only pans when the box is meaningfully off-screen — if it's already inside
// the viewport with >= 100 px inset from each edge, we leave the scroll
// position alone so the user isn't jolted by tiny corrections.
//
// Skipped when the selected person is also the focal: centerOnFocal() (and
// the initial fit-to-fill on tree load) already handles that case, and
// firing both would compete.
const SCROLL_INSET_PX = 100;
function scrollSelectedBoxIntoView(selectedId: string | null | undefined) {
  if (!selectedId || !scrollRef.value || !layout.value.boxes.length) return;
  // If the selected person is the focal, the load path's centerOnFocal /
  // initial fit-to-fill already handles positioning. Don't fight it.
  if (selectedId === props.personId) return;
  const box = layout.value.boxes.find(b => b.person.id === selectedId);
  if (!box) return;
  const el = scrollRef.value as HTMLElement;
  const z = zoom.value;
  // SVG renders with viewBox="0 ${viewBoxMinY} svgWidth svgHeight" sized to
  // (svgWidth * zoom, svgHeight * zoom), so layout coordinates map to screen
  // pixels as: screenX = box.x * zoom, screenY = (box.y - viewBoxMinY) * zoom.
  const minY = layout.value.viewBoxMinY;
  const boxLeft = box.x * z;
  const boxTop = (box.y - minY) * z;
  const boxRight = boxLeft + box.w * z;
  const boxBottom = boxTop + box.h * z;
  const viewLeft = el.scrollLeft;
  const viewTop = el.scrollTop;
  const viewW = el.clientWidth;
  const viewH = el.clientHeight;
  const viewRight = viewLeft + viewW;
  const viewBottom = viewTop + viewH;
  const insetX = Math.min(SCROLL_INSET_PX, viewW / 2);
  const insetY = Math.min(SCROLL_INSET_PX, viewH / 2);
  const insideHorizontally =
    boxLeft >= viewLeft + insetX && boxRight <= viewRight - insetX;
  const insideVertically =
    boxTop >= viewTop + insetY && boxBottom <= viewBottom - insetY;
  if (insideHorizontally && insideVertically) return;
  // Centre the box in the viewport.
  const targetLeft = Math.max(0, boxLeft + (box.w * z) / 2 - viewW / 2);
  const targetTop = Math.max(0, boxTop + (box.h * z) / 2 - viewH / 2);
  // scrollTo with behavior:'smooth' gives the browser-native ~200–300 ms ease.
  el.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
}

watch(() => props.selectedPersonId, (id) => {
  // Wait for layout to settle (selectedPersonId can change layout via
  // outline placeholders; box coordinates need to reflect post-update state).
  nextTick(() => scrollSelectedBoxIntoView(id));
});

defineExpose({ boxes: computed(() => layout.value.boxes), refetch });
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
.collapse-btn { cursor: pointer; }
.collapse-btn:hover circle { opacity: 0.7; }

.ghost-box { cursor: pointer; }
.ghost-box:hover rect { stroke: var(--color-primary, #3b82f6); }
.ghost-box:hover text { fill: var(--color-primary, #3b82f6); }
.ghost-box:focus { outline: 2px solid var(--color-primary, #3b82f6); outline-offset: 2px; border-radius: 6px; }

/* Add-family-member badge that overhangs the top-right corner of each
   person box. Shape and styling match the box (rounded rect, border,
   surface fill) so it reads as a small attached tile. */
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
.add-relative-btn:hover circle {
  fill: var(--accent);
  stroke: var(--accent);
}
.add-relative-btn:hover line {
  stroke: var(--accent-text);
}
.add-relative-leaf-glyph {
  pointer-events: none;
  user-select: none;
  transition: transform 0.1s;
}
.add-relative-btn:hover .add-relative-leaf-glyph {
  transform: scale(1.15);
}

/* Floating legend in the bottom-left corner. Shown only when the chart
   contains non-biological parent_child edges, so the common all-biological
   case stays uncluttered. */
.chart-legend {
  position: absolute;
  bottom: var(--space-md);
  left: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  z-index: 10;
  pointer-events: none;
  font-size: var(--font-xs);
  color: var(--text-secondary);
}
.chart-legend-entry {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.chart-legend-swatch {
  flex-shrink: 0;
}
</style>
