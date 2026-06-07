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
    :selected-id="layoutSelectedId"
    :ariaLabel="'a11y.descendantChart'"
    test-id="descendant-svg"
    :add-btn-style="addBtnStyle"
    @navigate="(id) => $emit('navigate', id)"
    @focus-person="(id) => $emit('focus-person', id)"
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
        <span class="zoom-extra-label" :title="$t('chart.tooltip.generationCountDescendants')" :aria-label="$t('chart.tooltip.generationCountDescendants')">{{ $t('reports.generations') }}</span>
        <button class="zoom-extra-btn" :title="$t('chart.tooltip.generationDecreaseDescendants')" :aria-label="$t('chart.tooltip.generationDecreaseDescendants')" @click="decrGens" :disabled="genTarget <= 1">−</button>
        <span class="zoom-extra-value" :title="$t('chart.tooltip.generationCountDescendants')" :aria-label="$t('chart.tooltip.generationCountDescendants')">{{ genTarget }}</span>
        <button class="zoom-extra-btn" :title="$t('chart.tooltip.generationIncreaseDescendants')" :aria-label="$t('chart.tooltip.generationIncreaseDescendants')" @click="incrGens">+</button>
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
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, onMounted, nextTick, toRef, inject } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeDescendantLayout } from '../../utils/chart-layout';
import { useSelectedParentInfo } from '../../composables/useSelectedParentInfo';
import { fetchDescendantTree, loadChildrenForNode } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import { STORAGE_KEYS } from '../../utils/storage-keys';
import type { CollapseButton, DescendantNode, PlaceholderBox } from '../../utils/chart-layout';
import { useEntityData } from '../../composables/useEntityData';
import type { ColorMode } from '../../../api/chart-export';
import PersonModal from '../modals/PersonModal.vue';
import ZoomControls from '../ZoomControls.vue';
import ChartCanvas from './ChartCanvas.vue';
import { descendantGenerations } from '../../composables/useChartGenerations';

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

const loadingMore = ref(false);
const collapsed = ref(new Set<string>());
const maxGens = ref(6);
const genTarget = descendantGenerations;

watch(genTarget, (n) => {
  if (!tree.value) return;
  if (n > maxGens.value) { maxGens.value = n; load(); }
  else applyGenerationDepth(n);
});

const showAddRelative = ref(false);
const addRelativePersonId = ref<string | null>(null);
type AddRelativeMode = 'father' | 'mother' | 'spouse' | 'child' | 'son' | 'daughter';
const addRelativeMode = ref<AddRelativeMode>('son');
const addRelativePersonSex = ref<'M' | 'F' | 'U' | undefined>(undefined);
const addRelativePersonSurname = ref<string | undefined>(undefined);

// Deferred selectedPersonId for layout — same pattern as PedigreeChart.
const layoutSelectedId = ref<string | null>(props.selectedPersonId ?? null);
let selectionRaf: number | null = null;
watch(() => props.selectedPersonId, (id) => {
  if (selectionRaf !== null) cancelAnimationFrame(selectionRaf);
  selectionRaf = requestAnimationFrame(() => {
    selectionRaf = null;
    layoutSelectedId.value = id ?? null;
  });
});
onUnmounted(() => { if (selectionRaf !== null) cancelAnimationFrame(selectionRaf); });

const selectedParentInfo = useSelectedParentInfo(toRef(props, 'selectedPersonId'));

const layout = computed(() => {
  if (!tree.value) return { boxes: [], lines: [], paths: [], svgWidth: 800, svgHeight: 400, viewBoxMinY: 0, collapseButtons: [], placeholders: [], placeholderLines: [] };
  return computeDescendantLayout(tree.value, maxGens.value, collapsed.value, layoutSelectedId.value, selectedParentInfo.value);
});

function toggle(personId: string) {
  const key = `${personId}:down`;
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}

function applyGenerationDepthFor(t: DescendantNode | null, n: number) {
  if (!t) return;
  const next = new Set<string>();
  for (const k of collapsed.value) if (!k.endsWith(':down')) next.add(k);
  function walk(node: DescendantNode, depth: number, seen: Set<string>) {
    if (seen.has(node.person.id)) return;
    seen.add(node.person.id);
    if (depth >= n) {
      next.add(`${node.person.id}:down`);
      return;
    }
    for (const c of node.children) walk(c, depth + 1, seen);
  }
  for (const c of t.children) walk(c, 1, new Set());
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
  if (genTarget.value > maxGens.value) {
    maxGens.value = genTarget.value;
    load();
  } else {
    applyGenerationDepth(genTarget.value);
  }
}

async function handleCollapseButton(btn: CollapseButton) {
  if (!btn.isLoadMore) {
    toggle(btn.personId);
    return;
  }
  if (loadingMore.value || !tree.value) return;
  loadingMore.value = true;
  try {
    tree.value = await loadChildrenForNode(tree.value, btn.personId);
  } finally {
    loadingMore.value = false;
  }
}

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp } = useChartZoom(1, STORAGE_KEYS.vizZoomDescendant);

// ChartCanvas owns the actual scroll element; bind useChartZoom's scrollRef to
// it on mount so pan/zoom (and centerOnFocal) operate on it.
const canvasRef = ref<InstanceType<typeof ChartCanvas> | null>(null);
onMounted(() => { scrollRef.value = (canvasRef.value?.scrollEl ?? null) as HTMLDivElement | null; });

function startAddFromPlaceholder(ph: PlaceholderBox) {
  addRelativePersonId.value = ph.childPersonId;
  addRelativeMode.value = ph.role as AddRelativeMode;
  const personBox = layout.value.boxes.find(b => b.person.id === ph.childPersonId);
  addRelativePersonSex.value = (personBox?.person.sex as 'M' | 'F' | 'U') ?? undefined;
  addRelativePersonSurname.value = personBox?.person.surname ?? undefined;
  showAddRelative.value = true;
}

function onRelativeSaved() {
  showAddRelative.value = false;
  emit('reload');
}

// useEntityData drives both the initial load and reload-on-mutation. The
// composable subscribes to onDataChanged and reloads automatically — we no
// longer register a listener ourselves.
let keepViewOnNextLoad = false;
let prevId: string | null = null;
const idRef = computed(() => props.personId ?? null);
const { data: tree, loading, reload } = useEntityData<DescendantNode | null>(idRef, async (id) => {
  const keepView = keepViewOnNextLoad || id === prevId;
  keepViewOnNextLoad = false;
  prevId = id;
  const fetched = await fetchDescendantTree(id, 0, maxGens.value);
  if (!keepView) collapsed.value = new Set<string>();
  applyGenerationDepthFor(fetched, genTarget.value);
  if (!keepView) {
    nextTick(() => centerOnFocal());
  }
  return fetched;
});

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

defineExpose({ boxes: computed(() => layout.value.boxes), refetch });
</script>
