<template>
  <div>
    <div v-if="citations.length === 0" class="empty-hint">{{ $t('citations.none') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('citations.source') }}</th>
          <th class="th-shrink">{{ $t('sourceDetail.page') }}</th>
          <th class="th-shrink">{{ $t('citations.confidence') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="citation in citations"
          :key="citation.id"
          class="clickable-row"
          @click="router.push('/sources/' + citation.source_id)"
        >
          <td>{{ citation.source_title || '—' }}</td>
          <td class="td-shrink">{{ citation.page || '—' }}</td>
          <td class="td-shrink">
            <span class="confidence-badge" :class="'confidence-' + citation.confidence">
              {{ $t('confidenceLevels.' + citation.confidence) }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';

export interface CitationRow {
  id: string;
  source_id: string;
  source_title: string | null;
  page: string | null;
  confidence: number;
}

const props = defineProps<{ personId: string }>();

const router = useRouter();
const citations = ref<CitationRow[]>([]);

async function load() {
  citations.value = (await window.api.citations.forPerson(props.personId)) as CitationRow[];
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.th-shrink, .td-shrink { width: 1%; white-space: nowrap; }
.confidence-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-xs);
  white-space: nowrap;
}
.confidence-3 { background: #f0fdf4; color: #166534; }
.confidence-2 { background: #eff6ff; color: #1e40af; }
.confidence-1 { background: #fefce8; color: #854d0e; }
.confidence-0 { background: #fef2f2; color: #991b1b; }
</style>
