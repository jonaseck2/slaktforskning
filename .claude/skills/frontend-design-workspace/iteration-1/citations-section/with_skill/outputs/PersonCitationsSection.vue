<template>
  <div>
    <div v-if="citations.length === 0" class="empty-hint">{{ $t('citations.none') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th>{{ $t('citations.source') }}</th>
          <th>{{ $t('citations.pageLocation') }}</th>
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
          <td class="td-page">{{ citation.page || '—' }}</td>
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
import { useToast } from '../composables/useToast';
import { useI18n } from 'vue-i18n';

export interface CitationRow {
  id: string;
  source_id: string;
  source_title: string | null;
  page: string | null;
}

const props = defineProps<{ personId: string }>();

const { t } = useI18n();
const toast = useToast();

const citations = ref<CitationRow[]>([]);

defineExpose({ reload: load });

async function load() {
  try {
    const raw = (await window.api.citations.forPerson(props.personId)) as Array<{
      id: string;
      source_id: string;
      page: string | null;
    }>;

    // Enrich with source title
    const enriched: CitationRow[] = await Promise.all(
      raw.map(async (c) => {
        let source_title: string | null = null;
        try {
          const src = await window.api.sources.get(c.source_id);
          source_title = src?.title ?? null;
        } catch {
          // Leave title null if fetch fails
        }
        return { id: c.id, source_id: c.source_id, source_title, page: c.page };
      }),
    );

    citations.value = enriched;
  } catch (err) {
    console.error('[PersonCitationsSection] load failed:', err);
    toast.error(t('errors.loadFailed'));
  }
}

async function remove(id: string) {
  if (!confirm(t('citations.confirmDelete'))) return;
  try {
    await window.api.citations.delete(id);
    await load();
  } catch (err) {
    console.error('[PersonCitationsSection] delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.td-page { color: var(--color-text-muted); font-size: var(--font-sm); }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; vertical-align: middle; }
</style>
