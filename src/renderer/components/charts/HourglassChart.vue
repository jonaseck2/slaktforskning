<template>
  <ChartCanvas
    ref="canvasRef"
    :layout="layout"
    :tree="tree"
    :loading="loading"
    :zoom="zoom"
    :is-panning="isPanning"
    :readonly="readonly"
    :color-mode="props.colorMode"
    :selected-id="selectedIdRef"
    :ariaLabel="'a11y.hourglassChart'"
    test-id="hourglass-svg"
    :add-btn-style="addBtnStyle"
    @navigate="(id) => $emit('navigate', id)"
    @focus-person="onPersonDblClick"
    @person-context-menu="(p) => $emit('person-context-menu', p)"
    @collapse-toggle="handleCollapseButton"
    @add-from-placeholder="startAddFromPlaceholder"
    @box-keydown="() => {}"
    @wheel="onWheel"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
  >
    <template #zoom-controls>
      <ZoomControls overlay :zoom="zoom" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom">
        <span class="zoom-extra-label" :title="$t('chart.tooltip.generationCount')" :aria-label="$t('chart.tooltip.generationCount')">{{ $t('reports.generations') }}</span>
        <button class="zoom-extra-btn" :title="$t('chart.tooltip.generationDecrease')" :aria-label="$t('chart.tooltip.generationDecrease')" @click="decrGens" :disabled="genTarget <= 1">−</button>
        <span class="zoom-extra-value" :title="$t('chart.tooltip.generationCount')" :aria-label="$t('chart.tooltip.generationCount')">{{ genTarget }}</span>
        <button class="zoom-extra-btn" :title="$t('chart.tooltip.generationIncrease')" :aria-label="$t('chart.tooltip.generationIncrease')" @click="incrGens">+</button>
      </ZoomControls>
    </template>
  </ChartCanvas>

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
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, toRef, inject } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeHourglassLayout } from '../../utils/chart-layout';
import { fetchHourglassTreePerson, loadAncestorGenerationTP, loadChildrenForNodeTP } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import { STORAGE_KEYS } from '../../utils/storage-keys';
import type { CollapseButton, TreePerson, PlaceholderBox, BoxLayout } from '../../utils/chart-layout';
import { useEntityData } from '../../composables/useEntityData';
import type { ColorMode } from '../../../api/chart-export';
import PersonModal from '../modals/PersonModal.vue';
import ZoomControls from '../ZoomControls.vue';
import ChartCanvas from './ChartCanvas.vue';
import Coachmark from '../ui/Coachmark.vue';
import { hourglassGenerations } from '../../composables/useChartGenerations';
import { useSelectedParentInfo } from '../../composables/useSelectedParentInfo';

// useI18n must be called within setup so $t resolves inside this component's
// template (the zoom-controls slot references $t directly).
useI18n();

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

// Coachmark anchor — the focal person's <g> element, resolved by querying
// ChartCanvas's scroll element once the layout has rendered. Stays null until
// the focal box exists in the DOM.
const focusBoxEl = ref<HTMLElement | null>(null);

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

const selectedParentInfo = useSelectedParentInfo(toRef(props, 'selectedPersonId'));

// Hourglass feeds selectedPersonId directly to its layout fn (no RAF defer).
const selectedIdRef = computed<string | null>(() => props.selectedPersonId ?? null);

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], paths: [], svgWidth: 1400, svgHeight: 688, viewBoxMinY: 0, collapseButtons: [], placeholders: [], placeholderLines: [] };
  return computeHourglassLayout(tree.value, collapsed.value, props.selectedPersonId, selectedParentInfo.value);
});

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

// ChartCanvas owns the actual scroll element; bind useChartZoom's scrollRef to
// it on mount so pan/zoom (and centerOnFocal / scrollSelectedBoxIntoView)
// operate on it.
const canvasRef = ref<InstanceType<typeof ChartCanvas> | null>(null);
onMounted(() => { scrollRef.value = (canvasRef.value?.scrollEl ?? null) as HTMLDivElement | null; });

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

// Resolve the focal box element for the Coachmark anchor. The focal box lives
// inside ChartCanvas's scroll element now, so we query for it by data-testid
// after the layout settles. Re-runs whenever the focal id or load state
// changes. (Declared after useEntityData so `loading` is in scope.)
const focalId = computed<string | null>(() => layout.value.boxes.find((b: BoxLayout) => b.isFocal)?.person.id ?? null);
function resolveFocusBoxEl() {
  const id = focalId.value;
  const scrollEl = canvasRef.value?.scrollEl;
  if (!id || !scrollEl) { focusBoxEl.value = null; return; }
  focusBoxEl.value = scrollEl.querySelector(`[data-testid="person-box-${id}"]`) as HTMLElement | null;
}
watch([focalId, loading], () => { nextTick(resolveFocusBoxEl); });
onMounted(() => { nextTick(resolveFocusBoxEl); });

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
