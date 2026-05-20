<template>
  <EntityPanel
    entity-type="repository"
    :entity="repository"
    :label="$t('panel.manageRepository')"
    :created-at="repository?.created_at ?? null"
    @close="emit('close')"
  >
    <template #empty>{{ $t('repositories.panelNoneSelected') }}</template>
    <template #header>
      <div class="panel-name-row">
        <div class="panel-name">{{ repository?.name || $t('common.unknown') }}</div>
        <span v-if="sources.length > 0" class="member-count-badge">{{ sources.length }}</span>
      </div>
    </template>

    <template v-if="repository">
      <!-- Repository fields -->
      <div class="panel-section">
        <SectionHeader :title="$t('repositories.singular')" :collapsed="!sections.info" @toggle="toggleSection('info')" />
        <div v-if="sections.info" class="panel-section-body">
          <div class="compact-form">
            <div class="compact-field">
              <label class="compact-label">{{ $t('repositories.name') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="fields.name ?? ''"
                @input="(fields as RepositoryData).name = ($event.target as HTMLInputElement).value"
                @blur="save('name')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('repositories.address') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="fields.address ?? ''"
                @input="(fields as RepositoryData).address = ($event.target as HTMLInputElement).value"
                @blur="save('address')"
              />
            </div>
            <div class="compact-row">
              <div class="compact-field">
                <label class="compact-label">{{ $t('repositories.postalCode') }}</label>
                <input
                  class="compact-control"
                  type="text"
                  :value="fields.postal_code ?? ''"
                  @input="(fields as RepositoryData).postal_code = ($event.target as HTMLInputElement).value"
                  @blur="save('postal_code')"
                />
              </div>
              <div class="compact-field">
                <label class="compact-label">{{ $t('repositories.city') }}</label>
                <input
                  class="compact-control"
                  type="text"
                  :value="fields.city ?? ''"
                  @input="(fields as RepositoryData).city = ($event.target as HTMLInputElement).value"
                  @blur="save('city')"
                />
              </div>
            </div>
            <div class="compact-row">
              <div class="compact-field">
                <label class="compact-label">{{ $t('repositories.state') }}</label>
                <input
                  class="compact-control"
                  type="text"
                  :value="fields.state ?? ''"
                  @input="(fields as RepositoryData).state = ($event.target as HTMLInputElement).value"
                  @blur="save('state')"
                />
              </div>
              <div class="compact-field">
                <label class="compact-label">{{ $t('repositories.country') }}</label>
                <input
                  class="compact-control"
                  type="text"
                  :value="fields.country ?? ''"
                  @input="(fields as RepositoryData).country = ($event.target as HTMLInputElement).value"
                  @blur="save('country')"
                />
              </div>
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('repositories.phone') }}</label>
              <input
                class="compact-control"
                type="tel"
                :value="fields.phone ?? ''"
                @input="(fields as RepositoryData).phone = ($event.target as HTMLInputElement).value"
                @blur="save('phone')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('repositories.email') }}</label>
              <input
                class="compact-control"
                type="email"
                :value="fields.email ?? ''"
                @input="(fields as RepositoryData).email = ($event.target as HTMLInputElement).value"
                @blur="save('email')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('repositories.web') }}</label>
              <input
                class="compact-control"
                type="url"
                :value="fields.web ?? ''"
                @input="(fields as RepositoryData).web = ($event.target as HTMLInputElement).value"
                @blur="save('web')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('repositories.callNumber') }}</label>
              <input
                class="compact-control"
                type="text"
                :value="fields.call_number ?? ''"
                @input="(fields as RepositoryData).call_number = ($event.target as HTMLInputElement).value"
                @blur="save('call_number')"
              />
            </div>
            <div class="compact-field">
              <label class="compact-label">{{ $t('repositories.notes') }}</label>
              <textarea
                class="compact-control"
                rows="3"
                :value="fields.notes ?? ''"
                @input="(fields as RepositoryData).notes = ($event.target as HTMLTextAreaElement).value"
                @blur="save('notes')"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Sources at this repository -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('repositories.sourcesAt')"
          :count="sources.length"
          :collapsed="!sections.sources"
          @toggle="toggleSection('sources')"
        />
        <div v-if="sections.sources" class="panel-section-body">
          <!-- Empty-state coaching N/A: this is a read-only derived view of
               sources linked to this repository; users add the link from the
               Source side (SourceRepositoriesSection), not from here. A plain
               muted message + clickable rows that route to /sources/:id is the
               right shape — no add CTA to attach an empty state to. -->
          <p v-if="sources.length === 0" class="muted small">{{ $t('repositories.noSources') }}</p>
          <table v-else class="data-table">
            <thead>
              <tr>
                <th>{{ $t('sources.sourceTitle') }}</th>
                <th>{{ $t('sources.author') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in sources"
                :key="s.id"
                class="clickable-row"
                @click="router.push('/sources/' + s.id)"
              >
                <td>{{ s.title }}</td>
                <td>{{ s.author || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <PanelDangerZone
        v-if="props.repositoryId"
        entity-type="repository"
        :entity-id="props.repositoryId"
        :entity-label="dangerEntityLabel"
        :cascade-summary="[deleteConfirmMessage]"
        @deleted="onDeleted"
      />
    </template>
  </EntityPanel>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import type { Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EntityPanel from './EntityPanel.vue';
import PanelDangerZone from './PanelDangerZone.vue';
import SectionHeader from './ui/SectionHeader.vue';
import { useToast } from '../composables/useToast';
import { usePanelSections } from '../composables/usePanelSections';
import { useEntityData } from '../composables/useEntityData';
import { useEditableFields } from '../composables/useEditableFields';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface RepositoryData {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  web: string | null;
  call_number: string | null;
  notes: string;
  created_at: string;
}

interface SourceRow {
  id: string;
  title: string;
  author: string;
}

const props = defineProps<{ repositoryId: string | null }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const toast = useToast();
const router = useRouter();

const { sections, toggleSection } = usePanelSections(
  'repository-panel-section-',
  { info: true, sources: true },
);

interface PanelData {
  repository: RepositoryData | null;
  sources: SourceRow[];
}

const idRef = toRef(props, 'repositoryId');
const { data: panelData } = useEntityData<PanelData>(idRef, async (id) => {
  try {
    const repo = (await window.api.repositories.get(id)) as RepositoryData | null;
    if (!repo) return { repository: null, sources: [] };
    // The api exposes `repositories.forSource` (sources for a repo's perspective
    // is fetched by iterating all sources and filtering, OR via a query). The
    // simplest correct path is listing all sources and filtering by linked
    // source_repository rows. For now we iterate sources.list and check
    // repositories.forSource(s.id) for membership; future optimization can
    // add a forRepository endpoint.
    const allSources = (await window.api.sources.list()) as Array<{ id: string; title: string; author: string }>;
    const matching: SourceRow[] = [];
    for (const s of allSources) {
      const repos = (await window.api.repositories.forSource(s.id)) as Array<{ id: string }>;
      if (repos.some(r => r.id === id)) {
        matching.push({ id: s.id, title: s.title, author: s.author });
      }
    }
    return { repository: repo, sources: matching };
  } catch (err) {
    console.error('[RepositoryPanel] load failed:', err);
    toast.error(t('errors.loadFailed'));
    return { repository: null, sources: [] };
  }
});

const repository = computed(() => panelData.value?.repository ?? null);
const sources = computed(() => panelData.value?.sources ?? []);

const persistRepository = async (id: string, patch: Partial<RepositoryData>) => {
  try {
    await window.api.repositories.update(id, patch);
  } catch (err) {
    console.error('[RepositoryPanel] persist failed:', err);
    toast.error(t('errors.saveFailed'));
    throw err;
  }
};

const { fields, save } = useEditableFields<RepositoryData & Record<string, unknown>>(
  idRef,
  repository as unknown as Ref<(RepositoryData & Record<string, unknown>) | null>,
  persistRepository,
);

const dangerEntityLabel = computed(() => repository.value?.name ?? t('common.unknown'));
const deleteConfirmMessage = computed(() =>
  t('repositories.deleteConfirmMessage', {
    name: dangerEntityLabel.value,
    sources: sources.value.length,
  }),
);

function onDeleted() {
  toast.success(t('repositories.deletedToast', { name: dangerEntityLabel.value }));
  emit('close');
}
</script>

<style scoped>
.panel-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}
.panel-name {
  font-size: var(--font-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.member-count-badge {
  flex-shrink: 0;
  background: var(--surface-bg);
  color: var(--text-muted);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  font-size: var(--font-xs);
}
.panel-section {
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  padding: 0 var(--space-lg);
}
.panel-section-body { padding: var(--space-xs) 0 var(--space-sm); }

.compact-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.compact-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}
.compact-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.compact-label {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.4px;
}
.compact-control {
  font-size: var(--font-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical;
}
.compact-control:focus {
  outline: none;
  border-color: var(--accent);
}
.muted { color: var(--text-muted); }
.small { font-size: var(--font-sm); }
</style>
