<template>
  <div>
    <div v-if="citations.length === 0" class="empty-hint">{{ $t('citations.none') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('citations.source') }}</th>
          <th class="th-shrink">{{ $t('citations.page') }}</th>
          <th class="th-shrink">{{ $t('citations.confidence') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="citation in citations" :key="citation.id">
          <td>
            <router-link
              v-if="citation.source_id"
              :to="'/sources/' + citation.source_id"
              class="person-link"
              @click.stop
            >{{ citation.source_title || $t('common.unknown') }}</router-link>
            <span v-else>{{ $t('common.unknown') }}</span>
          </td>
          <td class="td-shrink">{{ citation.page || '—' }}</td>
          <td class="td-shrink">
            <span class="confidence-badge" :class="'confidence-' + citation.confidence">
              {{ confidenceLabel(citation.confidence) }}
            </span>
          </td>
          <td class="actions-cell">
            <button class="btn-sm btn-delete" @click="remove(citation.id)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

export interface CitationRow {
  id: string;
  source_id: string | null;
  source_title: string | null;
  page: string | null;
  confidence: number | null;
}

const CONFIDENCE_LABELS: Record<number, string> = {
  0: 'Unreliable',
  1: 'Questionable',
  2: 'Secondary',
  3: 'Primary',
};

const props = defineProps<{ personId: string }>();

const citations = ref<CitationRow[]>([]);

defineExpose({ reload: load });

function confidenceLabel(level: number | null): string {
  if (level === null || level === undefined) return '—';
  return CONFIDENCE_LABELS[level] ?? String(level);
}

async function load() {
  citations.value = (await (window as any).api.citations.forPerson(props.personId)) as CitationRow[];
}

async function remove(id: string) {
  await (window as any).api.citations.delete(id);
  await load();
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.th-shrink,
.td-shrink {
  width: 1%;
  white-space: nowrap;
}
.actions-cell {
  width: 1px;
  text-align: right;
  white-space: nowrap;
  vertical-align: middle;
}
.confidence-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
}
.confidence-0 { background: var(--color-danger-bg); color: var(--color-danger-text); }
.confidence-1 { background: #fef9c3; color: #854d0e; }
.confidence-2 { background: #e0f2fe; color: #0369a1; }
.confidence-3 { background: #f0fdf4; color: #166534; }
</style>
