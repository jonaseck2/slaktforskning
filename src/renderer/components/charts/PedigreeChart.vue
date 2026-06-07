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
    :ariaLabel="'a11y.pedigreeChart'"
    test-id="pedigree-svg"
    :add-btn-style="addBtnStyle"
    @navigate="(id) => $emit('navigate', id)"
    @focus-person="(id) => $emit('focus-person', id)"
    @person-context-menu="(p) => $emit('person-context-menu', p)"
    @collapse-toggle="handleCollapseButton"
    @add-from-placeholder="startAddFromPlaceholder"
    @box-keydown="({ event, box }) => onBoxKeydown(event, box)"
    @wheel="onWheel"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
  >
    <template #zoom-controls>
      <ZoomControls overlay :zoom="zoom" @zoom-in="zoomIn" @zoom-out="zoomOut" @reset="resetZoom">
        <span class="zoom-extra-label" :title="$t('chart.tooltip.generationCountAncestors')" :aria-label="$t('chart.tooltip.generationCountAncestors')">{{ $t('reports.generations') }}</span>
        <button class="zoom-extra-btn" :title="$t('chart.tooltip.generationDecreaseAncestors')" :aria-label="$t('chart.tooltip.generationDecreaseAncestors')" @click="decrGens" :disabled="genTarget <= 1">−</button>
        <span class="zoom-extra-value" :title="$t('chart.tooltip.generationCountAncestors')" :aria-label="$t('chart.tooltip.generationCountAncestors')">{{ genTarget }}</span>
        <button class="zoom-extra-btn" :title="$t('chart.tooltip.generationIncreaseAncestors')" :aria-label="$t('chart.tooltip.generationIncreaseAncestors')" @click="incrGens">+</button>
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
import { ref, computed, watch, onUnmounted, onMounted, toRef, inject } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { computePedigreeLayout, BOX_W, H_GAP } from '../../utils/chart-layout';
import { useSelectedParentInfo } from '../../composables/useSelectedParentInfo';
import { fetchPedigreeTree, loadAncestorGeneration } from '../../utils/chartData';
import { useChartZoom } from '../../utils/useChartZoom';
import { STORAGE_KEYS } from '../../utils/storage-keys';
import type { BoxLayout, CollapseButton, PedigreeTree, PlaceholderBox } from '../../utils/chart-layout';
import { useEntityData } from '../../composables/useEntityData';
import type { ColorMode } from '../../../api/chart-export';
import PersonModal from '../modals/PersonModal.vue';
import ZoomControls from '../ZoomControls.vue';
import ChartCanvas from './ChartCanvas.vue';
import { pedigreeGenerations } from '../../composables/useChartGenerations';

// useI18n must be called within setup so $t resolves inside this component's
// template (the zoom-controls slot references $t directly).
useI18n();

const props = defineProps<{ personId: string | undefined; focusedPerson?: string | null; readonly?: boolean; selectedPersonId?: string | null; colorMode?: ColorMode }>();

// Add-family-member badge style — provided by App.vue's appearance-store.
const appearanceStore = inject<{ addBtnStyle: Ref<'plus' | 'leaf'> } | undefined>('appearance-store', undefined);
const addBtnStyle = computed<'plus' | 'leaf'>(() => appearanceStore?.addBtnStyle?.value ?? 'plus');
const emit = defineEmits<{
  navigate: [id: string];
  'focus-person': [id: string];
  reload: [];
  'person-context-menu': [payload: { personId: string; x: number; y: number }];
}>();

const loadingMore = ref(false);
const collapsed = ref(new Set<string>());
const genTarget = pedigreeGenerations;
const loadedGens = ref(5);

watch(genTarget, (n) => {
  if (!tree.value) return;
  if (n > loadedGens.value) load();
  else applyGenerationDepth(n);
});

// Focus state for keyboard navigation
const focusedBoxId = ref<string | null>(null);

const PAD = 10;
function generationOf(box: BoxLayout): number {
  return Math.round((box.x - PAD) / (BOX_W + H_GAP));
}

function onBoxKeydown(e: KeyboardEvent, box: BoxLayout) {
  const boxes = layout.value.boxes;
  const idx = boxes.findIndex((b) => b.person.id === box.person.id);
  const gen = generationOf(box);
  let targetIdx = -1;

  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    emit('navigate', box.person.id);
    return;
  }
  if (e.key === 'ArrowRight') {
    // Next person in higher generation (further ancestor)
    targetIdx = boxes.findIndex((b, i) => i > idx && generationOf(b) === gen + 1);
  } else if (e.key === 'ArrowLeft') {
    // Previous person in lower generation (closer to focal)
    targetIdx = boxes.findIndex((b) => generationOf(b) === gen - 1);
  } else if (e.key === 'ArrowDown') {
    // Next sibling in same generation
    targetIdx = boxes.findIndex((b, i) => i > idx && generationOf(b) === gen);
  } else if (e.key === 'ArrowUp') {
    // Previous sibling in same generation
    for (let i = idx - 1; i >= 0; i--) {
      if (generationOf(boxes[i]) === gen) { targetIdx = i; break; }
    }
  }

  if (targetIdx >= 0) {
    e.preventDefault();
    const targetEl = scrollRef.value?.querySelector(
      `[data-testid="person-box-${boxes[targetIdx].person.id}"]`
    ) as HTMLElement | null;
    targetEl?.focus();
  }
}

const showAddRelative = ref(false);
const addRelativePersonId = ref<string | null>(null);
type AddRelativeMode = 'father' | 'mother' | 'spouse' | 'child' | 'son' | 'daughter';
const addRelativeMode = ref<AddRelativeMode>('father');
const addRelativePersonSex = ref<'M' | 'F' | 'U' | undefined>(undefined);
const addRelativePersonSurname = ref<string | undefined>(undefined);

// Deferred selectedPersonId for layout — same pattern as HourglassChart.
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
  if (!tree.value) return { boxes: [], lines: [], paths: [], svgWidth: 995, svgHeight: 1024, viewBoxMinY: 0, collapseButtons: [], placeholders: [], placeholderLines: [] };
  return computePedigreeLayout(tree.value, collapsed.value, layoutSelectedId.value, selectedParentInfo.value);
});

// Reverse map: personId → ahnentafel key — needed by handleCollapseButton to call loadAncestorGeneration
const personToAhnen = computed(() => {
  const m = new Map<string, number>();
  for (const [k, person] of (tree.value?.nodes ?? [])) {
    m.set(person.id, k);
  }
  return m;
});

function toggle(personId: string, dir: 'up' | 'down' | 'left' | 'right') {
  const key = `${personId}:${dir}`;
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}

function applyGenerationDepthFor(t: PedigreeTree | null, n: number) {
  if (!t) return;
  const next = new Set<string>();
  for (const k of collapsed.value) if (!k.endsWith(':right')) next.add(k);
  for (const [ahn, person] of t.nodes) {
    if (Math.floor(Math.log2(ahn)) === n) next.add(`${person.id}:right`);
  }
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
    toggle(btn.personId, btn.direction);
    return;
  }
  if (loadingMore.value || !tree.value) return;
  const ahnNum = personToAhnen.value.get(btn.personId);
  if (ahnNum === undefined) return;
  loadingMore.value = true;
  try {
    tree.value = await loadAncestorGeneration(tree.value, ahnNum);
  } finally {
    loadingMore.value = false;
  }
}

const { zoom, scrollRef, onWheel, zoomIn, zoomOut, resetZoom, isPanning, onMouseDown, onMouseMove, onMouseUp } = useChartZoom(1, STORAGE_KEYS.vizZoomPedigree);

// ChartCanvas owns the actual scroll element; bind useChartZoom's scrollRef to
// it on mount so pan/zoom (and onBoxKeydown's querySelector) operate on it.
const canvasRef = ref<InstanceType<typeof ChartCanvas> | null>(null);
onMounted(() => { scrollRef.value = (canvasRef.value?.scrollEl ?? null) as HTMLDivElement | null; });

function startAddFromPlaceholder(ph: PlaceholderBox) {
  const childBox = layout.value.boxes.find((b: BoxLayout) => b.person.id === ph.childPersonId);
  addRelativePersonId.value = ph.childPersonId;
  addRelativeMode.value = ph.role as AddRelativeMode;
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
// longer register a listener ourselves. `keepViewOnNextLoad` lets refetch()
// preserve collapsed state across a reload; same-id reloads default to that
// behaviour too (mutation broadcasts) so the user's view doesn't reset.
let keepViewOnNextLoad = false;
let prevId: string | null = null;
const idRef = computed(() => props.personId ?? null);
const { data: tree, loading, reload } = useEntityData<PedigreeTree | null>(idRef, async (id) => {
  const keepView = keepViewOnNextLoad || id === prevId;
  keepViewOnNextLoad = false;
  prevId = id;
  if (!keepView) collapsed.value = new Set();
  const gens = Math.max(5, genTarget.value);
  const fetched = await fetchPedigreeTree(id, gens);
  loadedGens.value = gens;
  applyGenerationDepthFor(fetched, genTarget.value);
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

// Sync focused box with parent-controlled focusedPerson prop (screen reader nav)
watch(() => props.focusedPerson, (pid) => {
  if (pid) focusedBoxId.value = pid;
});

defineExpose({ boxes: computed(() => layout.value.boxes), refetch });
</script>
