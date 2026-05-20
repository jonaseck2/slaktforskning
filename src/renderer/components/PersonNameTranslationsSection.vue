<!--
  Translations section (T23 — GEDCOM 7.0 NAME/TRAN + PLAC/TRAN).

  Generic over the two parent kinds we support:
   - `name`  → name_translations attached to person_names.id
   - `place` → place_translations attached to places.id

  The renderer surface for both is identical — value + language + optional
  transliteration scheme — so one component covers both with an inline
  add row (no separate modal: the schema is small and the user flow is
  "type value → save").

  Naming note: the file lives under `PersonNameTranslationsSection.vue`
  because the plan task labelled it that way, but the component itself is
  parent-kind-agnostic via the `kind` prop. The place version (T23 spec
  also calls out PlaceFormFields) reuses this same component with
  `kind="place"`.
-->
<template>
  <div>
    <!-- Empty-state coaching: surfaces what the section is for and the
         primary CTA when no rows exist yet. -->
    <SectionEmpty
      v-if="rows.length === 0 && !addOpen"
      :message="$t('translations.empty')"
    />

    <table v-if="rows.length > 0" class="data-table translations-table">
      <thead>
        <tr>
          <th class="th-value">{{ $t('translations.value') }}</th>
          <th class="th-lang">{{ $t('translations.language') }}</th>
          <th v-if="!props.readonly" class="actions-cell"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td class="td-value">
            <span class="tr-value">{{ row.value }}</span>
            <span v-if="row.transliteration_scheme" class="tr-scheme-badge">
              {{ row.transliteration_scheme }}
            </span>
          </td>
          <td class="td-lang">
            <span v-if="row.language" class="tr-lang-badge">{{ row.language }}</span>
            <span v-else class="muted">—</span>
          </td>
          <td v-if="!props.readonly" class="actions-cell">
            <AppButton
              variant="ghost"
              size="sm"
              :aria-label="$t('common.delete')"
              :title="$t('common.deleteTooltip')"
              @click="del.ask(row)"
            >
              <IconTrash :size="14" />
            </AppButton>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Inline add row — small enough that a modal would be heavier than
         the form itself. value is required; language + scheme are optional. -->
    <div v-if="!props.readonly && addOpen" class="tr-add-form">
      <input
        v-model="newValue"
        type="text"
        class="tr-input"
        :placeholder="$t('translations.value')"
        :aria-label="$t('translations.value')"
        @keydown.enter="onSave"
        @keydown.escape="closeAdd"
      />
      <input
        v-model="newLanguage"
        type="text"
        class="tr-input tr-input--narrow"
        :placeholder="$t('translations.language')"
        :aria-label="$t('translations.language')"
        maxlength="32"
        @keydown.enter="onSave"
      />
      <input
        v-model="newScheme"
        type="text"
        class="tr-input tr-input--narrow"
        :placeholder="$t('translations.transliterationScheme')"
        :aria-label="$t('translations.transliterationScheme')"
        maxlength="64"
        @keydown.enter="onSave"
      />
      <AppButton variant="soft" size="sm" :disabled="!newValue.trim()" @click="onSave">
        {{ $t('common.save') }}
      </AppButton>
      <AppButton variant="ghost" size="sm" @click="closeAdd">{{ $t('common.cancel') }}</AppButton>
    </div>
    <div v-else-if="!props.readonly" class="tr-add-row">
      <AppButton variant="soft" size="sm" @click="openAdd">{{ $t('translations.add') }}</AppButton>
    </div>

    <ConfirmModal
      :visible="del.visible.value"
      :title="$t('translations.deleteConfirm')"
      :message="$t('translations.deleteConfirm')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="del.cancel"
      @confirm="del.confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from './ui/AppButton.vue';
import IconTrash from './ui/IconTrash.vue';
import ConfirmModal from './ConfirmModal.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import { useEntityData } from '../composables/useEntityData';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import { useToast } from '../composables/useToast';
import type { NameTranslation, PlaceTranslation } from '../../api/types';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

type Row = (NameTranslation | PlaceTranslation) & { id: string };

const props = withDefaults(defineProps<{
  /** 'name' → name_translations attached to person_names.id.
   *  'place' → place_translations attached to places.id. */
  kind: 'name' | 'place';
  /** Parent row id (person_names.id or places.id). */
  parentId: string;
  readonly?: boolean;
}>(), { readonly: false });

const { t } = useI18n();
const toast = useToast();

// Pick the right api surface based on `kind`. Each surface exposes the same
// shape (forName/forPlace, create, delete), so the renderer code is
// kind-agnostic past this point.
const apiFor = computed(() => {
  if (props.kind === 'name') {
    return {
      load: (id: string) => window.api.nameTranslations.forName(id) as Promise<NameTranslation[]>,
      create: (data: { value: string; language: string; transliteration_scheme: string }) =>
        window.api.nameTranslations.create({
          person_name_id: props.parentId,
          ...data,
        }),
      delete: (id: string) => window.api.nameTranslations.delete(id),
    };
  }
  return {
    load: (id: string) => window.api.placeTranslations.forPlace(id) as Promise<PlaceTranslation[]>,
    create: (data: { value: string; language: string; transliteration_scheme: string }) =>
      window.api.placeTranslations.create({
        place_id: props.parentId,
        ...data,
      }),
    delete: (id: string) => window.api.placeTranslations.delete(id),
  };
});

const parentIdRef = toRef(props, 'parentId');
const { data, reload } = useEntityData<Row[]>(parentIdRef, async (id) => {
  if (!id) return [];
  try {
    return (await apiFor.value.load(id)) as Row[];
  } catch (err) {
    console.error('[EntityTranslationsSection] load failed:', err);
    return [];
  }
});

const rows = computed(() => data.value ?? []);
const count = computed(() => rows.value.length);

// ── Inline add form ────────────────────────────────────────────────────────
const addOpen = ref(false);
const newValue = ref('');
const newLanguage = ref('');
const newScheme = ref('');

function openAdd() {
  newValue.value = '';
  newLanguage.value = '';
  newScheme.value = '';
  addOpen.value = true;
}

function closeAdd() {
  addOpen.value = false;
}

async function onSave() {
  const value = newValue.value.trim();
  if (!value) return;
  try {
    await apiFor.value.create({
      value,
      language: newLanguage.value.trim(),
      transliteration_scheme: newScheme.value.trim(),
    });
    closeAdd();
    await reload();
  } catch (err) {
    console.error('[EntityTranslationsSection] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────
const del = useDeleteConfirm<Row>(async (row) => {
  try {
    await apiFor.value.delete(row.id);
    await reload();
  } catch (err) {
    console.error('[EntityTranslationsSection] delete failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
});

defineExpose({ count, reload, openAdd });
</script>

<style scoped>
.translations-table { width: 100%; }
.th-value, .td-value { width: 60%; }
.th-lang, .td-lang { width: 30%; white-space: nowrap; }
.actions-cell {
  width: 1px;
  white-space: nowrap;
  text-align: right;
}
.tr-value {
  font-size: var(--font-sm);
}
.tr-scheme-badge {
  display: inline-block;
  margin-left: var(--space-xs);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-hover);
  color: var(--text-muted);
  font-size: var(--font-xs);
}
.tr-lang-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--info-bg, var(--surface-hover));
  color: var(--info-text, var(--text-secondary));
  font-size: var(--font-xs);
}
.muted { color: var(--text-muted); }
.tr-add-form {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  margin-top: var(--space-sm);
  padding: var(--space-sm);
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
  flex-wrap: wrap;
}
.tr-input {
  padding: 4px 8px;
  font-size: var(--font-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  flex: 1;
  min-width: 100px;
}
.tr-input--narrow {
  flex: 0 1 120px;
}
.tr-input:focus {
  outline: none;
  border-color: var(--accent);
}
.tr-add-row {
  margin-top: var(--space-sm);
}
</style>
