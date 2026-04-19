<template>
  <div>
    <div v-if="citations.length === 0" class="empty-hint">{{ $t('empty.citations') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('citations.source') }}</th>
          <th>{{ $t('citations.pageLocation') }}</th>
          <th>{{ $t('citations.confidence') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in citations" :key="c.id" class="clickable-row" @click="$router.push('/sources/' + c.source_id)">
          <td>
            <router-link :to="'/sources/' + c.source_id" class="person-link" @click.stop>
              {{ c.source_title || '—' }}
            </router-link>
          </td>
          <td>{{ c.page || '—' }}</td>
          <td>
            <span v-if="c.confidence != null" class="confidence-badge">
              {{ $t('confidenceLevels.' + c.confidence) }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface CitationRow {
  id: string;
  source_id: string;
  source_title: string;
  page: string | null;
  confidence: number | null;
}

const props = defineProps<{ placeId: string }>();
const citations = ref<CitationRow[]>([]);

async function load() {
  const raw = (await window.api.citations.forPlace(props.placeId)) as Array<{
    id: string; source_id: string; page: string | null; confidence: number | null;
  }>;
  const enriched: CitationRow[] = [];
  for (const c of raw) {
    const source = (await window.api.sources.get(c.source_id)) as { title: string } | null;
    enriched.push({ ...c, source_title: source?.title ?? '' });
  }
  citations.value = enriched;
}

watch(() => props.placeId, () => load(), { immediate: true });

defineExpose({ reload: load });
</script>
