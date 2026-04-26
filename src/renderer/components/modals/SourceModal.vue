<template>
  <BaseSubPanel
    entity-type="source"
    :title="form.title || $t('sources.newSource')"
    :mode="mode"
    @cancel="$emit('cancel')"
    @save="save"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.sourceTitle') }}</span>
        <input
          ref="titleRef"
          class="ep-input"
          v-model="form.title"
          :placeholder="$t('sources.titlePlaceholder')"
          required
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.sourceType') }}</span>
        <select class="ep-input" v-model="form.source_type">
          <option v-for="st in SOURCE_TYPE_VALUES" :key="st" :value="st">
            {{ $t('sourceTypes.' + st) }}
          </option>
        </select>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.author') }}</span>
        <input class="ep-input" v-model="form.author" :placeholder="$t('sources.authorPlaceholder')" />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.publicationInfo') }}</span>
        <input class="ep-input" v-model="form.publication_info" :placeholder="$t('sources.publicationInfoPlaceholder')" />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.repository') }}</span>
        <input class="ep-input" v-model="form.repository" :placeholder="$t('sources.repositoryPlaceholder')" />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.url') }}</span>
        <input class="ep-input" v-model="form.url" type="url" :placeholder="$t('sources.urlPlaceholder')" />
      </div>
    </div>

    <!-- Citations section — only in standalone mode after first save -->
    <template v-if="mode === 'standalone' && savedSourceId">
      <div class="ep-sec-header" data-entity="citation">
        <div class="ep-sec-left">
          <span class="ep-sec-title">📖 {{ $t('citations.title') }}</span>
          <span class="ep-sec-count">{{ citations.length }}</span>
        </div>
        <span class="ep-sec-open">›</span>
      </div>
      <div class="ep-sec-content">
        <div
          v-for="c in citations"
          :key="c.id"
          class="ep-entity-row"
          @click="goToSource"
        >
          <div class="ep-entity-main">
            <div class="ep-entity-name">{{ citationLabel(c) }}</div>
            <div v-if="c.transcription || c.notes" class="ep-entity-sub">
              {{ (c.transcription || c.notes || '').slice(0, 60) }}{{ (c.transcription || c.notes || '').length > 60 ? '…' : '' }}
            </div>
          </div>
          <span class="ep-entity-arrow">›</span>
        </div>
        <div v-if="citations.length === 0" class="ep-sec-empty">{{ $t('empty.citations') }}</div>
      </div>
      <div class="ep-sec-gap"></div>
    </template>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, watch, nextTick, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import BaseSubPanel from './BaseSubPanel.vue';
import { SOURCE_TYPE_VALUES } from '../../constants/eventTypes';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Source { id: string; title: string; }
interface Citation {
  id: string;
  page: string | null;
  confidence: number | null;
  transcription: string | null;
  notes: string | null;
}

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  editingSource?: Source | null;
  initialTitle?: string;
}>(), {
  mode: 'subpanel',
  editingSource: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [sourceId: string, sourceTitle: string];
}>();

const router = useRouter();
const titleRef = ref<HTMLInputElement | null>(null);
const savedSourceId = ref<string | null>(props.editingSource?.id ?? null);
const citations = ref<Citation[]>([]);

const form = reactive({
  title: props.editingSource?.title ?? props.initialTitle ?? '',
  source_type: 'church_record',
  author: '',
  publication_info: '',
  repository: '',
  url: '',
});

function citationLabel(c: Citation): string {
  if (c.page) return c.page;
  if (c.confidence !== null && c.confidence !== undefined) {
    const labels = ['Unreliable', 'Questionable', 'Secondary', 'Primary'];
    return labels[c.confidence] ?? '—';
  }
  return '—';
}

function goToSource() {
  if (savedSourceId.value) {
    router.push('/sources/' + savedSourceId.value);
  }
}

async function loadCitations() {
  if (!savedSourceId.value || !window.api) return;
  try {
    citations.value = (await window.api.citations.forSource(savedSourceId.value)) as Citation[];
  } catch {
    // ignore
  }
}

// Load citations when savedSourceId is set (standalone mode)
watch(savedSourceId, (id) => {
  if (props.mode === 'standalone' && id) {
    loadCitations();
  }
});

onMounted(() => {
  nextTick(() => titleRef.value?.focus());
  if (props.mode === 'standalone' && savedSourceId.value) {
    loadCitations();
  }
});

async function save() {
  if (!window.api || !form.title.trim()) return;
  try {
    const payload = {
      title: form.title,
      source_type: form.source_type,
      author: form.author,
      publication_info: form.publication_info,
      repository: form.repository,
      url: form.url,
    };
    let source: Source;
    if (savedSourceId.value) {
      source = (await window.api.sources.update(savedSourceId.value, payload)) as Source;
    } else {
      source = (await window.api.sources.create(payload)) as Source;
      savedSourceId.value = source.id;
    }
    if (props.mode === 'standalone') {
      await loadCitations();
    }
    emit('saved', source.id, source.title);
  } catch (err) {
    console.error('[SourceModal] save failed:', err);
  }
}
</script>

<style scoped>
.ep-sec-empty {
  padding: 8px 12px;
  font-size: var(--font-sm);
  color: var(--text-muted);
}
</style>
