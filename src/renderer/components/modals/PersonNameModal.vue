<template>
  <BaseSubPanel
    entity-type="name"
    :title="displayTitle"
    :save-label="editingName ? $t('common.save') : $t('common.create')"
    :mode="mode"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <!-- Given name -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('persons.givenName') }} *</span>
        <input
          ref="givenNameRef"
          class="ep-input"
          v-model="form.given_name"
          type="text"
          :placeholder="$t('persons.givenName')"
          @keydown.enter.prevent="handleSave"
        />
        <span class="ep-field-hint">{{ $t('persons.givenNameHint') }}</span>
      </div>

      <!-- Surname -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('persons.surname') }}</span>
        <input
          class="ep-input"
          v-model="form.surname"
          type="text"
          :placeholder="$t('persons.surname')"
          @keydown.enter.prevent="handleSave"
        />
      </div>

      <!-- Name type segmented -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('names.nameType') }}</span>
        <div class="ep-seg">
          <button
            v-for="nt in NAME_TYPE_VALUES"
            :key="nt"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.name_type === nt }"
            @click="form.name_type = nt"
          >{{ $t('nameTypes.' + nt) }}</button>
        </div>
      </div>

      <!-- Preferred name (only for birth names) -->
      <div v-if="form.name_type === 'birth'" class="ep-field">
        <span class="ep-field-label">{{ $t('persons.preferredName') }}</span>
        <input
          class="ep-input"
          v-model="form.preferred_name"
          type="text"
          :placeholder="$t('persons.preferredNamePlaceholder')"
          @keydown.enter.prevent="handleSave"
        />
      </div>

      <!-- Nickname -->
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('persons.nickname') }}</span>
        <input
          class="ep-input"
          v-model="form.nickname"
          type="text"
          :placeholder="$t('persons.nicknamePlaceholder')"
          @keydown.enter.prevent="handleSave"
        />
      </div>

      <!-- Advanced / rare fields -->
      <details class="ep-details">
        <summary class="ep-details-summary">{{ $t('common.more') }}</summary>

        <!-- Qualifier -->
        <div class="ep-field">
          <span class="ep-field-label">{{ $t('names.qualifier') }}</span>
          <select class="ep-input" v-model="form.name_qualifier">
            <option value="">—</option>
            <option value="patronymic">{{ $t('names.qualifierPatronymic') }}</option>
            <option value="matronymic">{{ $t('names.qualifierMatronymic') }}</option>
            <option value="particle">{{ $t('names.qualifierParticle') }}</option>
          </select>
        </div>

        <!-- Patronymic base (only when qualifier is patronymic/matronymic) -->
        <div v-if="form.name_qualifier === 'patronymic' || form.name_qualifier === 'matronymic'" class="ep-field">
          <span class="ep-field-label">{{ $t('names.patronymicBase') }}</span>
          <input
            class="ep-input"
            v-model="form.patronymic_base"
            type="text"
            :placeholder="$t('names.patronymicBasePlaceholder')"
            @keydown.enter.prevent="handleSave"
          />
        </div>

        <!-- Prefix -->
        <div class="ep-field">
          <span class="ep-field-label">{{ $t('names.prefix') }}</span>
          <input
            class="ep-input"
            v-model="form.name_prefix"
            type="text"
            :placeholder="$t('names.prefixPlaceholder')"
            @keydown.enter.prevent="handleSave"
          />
        </div>

        <!-- Suffix -->
        <div class="ep-field">
          <span class="ep-field-label">{{ $t('names.suffix') }}</span>
          <input
            class="ep-input"
            v-model="form.name_suffix"
            type="text"
            :placeholder="$t('names.suffixPlaceholder')"
            @keydown.enter.prevent="handleSave"
          />
        </div>

        <!-- Date from / to -->
        <div class="ep-field">
          <span class="ep-field-label">{{ $t('names.dateFrom') }}</span>
          <input
            class="ep-input"
            v-model="form.date_from"
            type="text"
            placeholder="YYYY-MM-DD"
            @keydown.enter.prevent="handleSave"
          />
        </div>

        <div class="ep-field">
          <span class="ep-field-label">{{ $t('names.dateTo') }}</span>
          <input
            class="ep-input"
            v-model="form.date_to"
            type="text"
            placeholder="YYYY-MM-DD"
            @keydown.enter.prevent="handleSave"
          />
        </div>
      </details>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';
import BaseSubPanel from './BaseSubPanel.vue';
import { NAME_TYPE_VALUES } from '../../constants/eventTypes';
import { parseAsteriskNotation } from '../../utils/nameUtils';
import type { NameRow } from '../PersonNamesTable.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId: string;
  editingName?: NameRow | null;
  defaultSurname?: string;
}>(), {
  mode: 'standalone',
  editingName: null,
  defaultSurname: undefined,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [];
}>();

const { t } = useI18n();
const toast = useToast();
const givenNameRef = ref<HTMLInputElement | null>(null);

const form = reactive({
  given_name: '',
  surname: '',
  name_type: 'married' as string,
  name_prefix: '',
  name_suffix: '',
  name_qualifier: '',
  patronymic_base: '',
  preferred_name: '',
  nickname: '',
  date_from: '',
  date_to: '',
});

watch(() => props.editingName, (n) => {
  form.given_name = n?.given_name ?? '';
  form.surname = n?.surname ?? (props.defaultSurname || '');
  form.name_type = n?.name_type ?? 'married';
  form.name_prefix = n?.name_prefix ?? '';
  form.name_suffix = n?.name_suffix ?? '';
  form.name_qualifier = n?.name_qualifier ?? '';
  form.patronymic_base = n?.patronymic_base ?? '';
  form.preferred_name = n?.preferred_name ?? '';
  form.nickname = n?.nickname ?? '';
  form.date_from = '';
  form.date_to = '';
}, { immediate: true });

const personName = ref('');

const displayTitle = computed(() => {
  const full = [form.given_name, form.surname].filter(Boolean).join(' ');
  if (full) return full;
  const base = props.editingName ? t('personDetail.editNameTitle') : t('personDetail.addNameTitle');
  return personName.value ? t('persons.titleFor', { title: base, name: personName.value }) : base;
});

async function loadPersonName() {
  if (!window.api) return;
  try {
    const names = (await window.api.persons.getNames(props.personId)) as Array<{ given_name: string; surname: string }>;
    const primary = names[0];
    if (primary) personName.value = [primary.given_name, primary.surname].filter(Boolean).join(' ');
  } catch { /* ignore */ }
}

async function handleSave() {
  if (!form.given_name.trim()) return;
  try {
    const { given_name: parsedGiven, preferred_name: parsedPreferred } = parseAsteriskNotation(form.given_name);
    const resolvedPreferred = form.preferred_name || parsedPreferred || null;
    const payload = {
      given_name: parsedGiven,
      surname: form.surname || null,
      name_type: form.name_type as 'birth' | 'married' | 'alias' | 'aka',
      name_prefix: form.name_prefix || null,
      name_suffix: form.name_suffix || null,
      name_qualifier: form.name_qualifier || null,
      patronymic_base: form.patronymic_base || null,
      preferred_name: resolvedPreferred,
      nickname: form.nickname || null,
      date_from: form.date_from || null,
      date_to: form.date_to || null,
    };
    if (props.editingName) {
      await window.api.persons.updateName(props.editingName.id, payload);
    } else {
      await window.api.persons.addName(props.personId, payload);
    }
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('[PersonNameModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

onMounted(async () => {
  await loadPersonName();
  await nextTick();
  givenNameRef.value?.focus();
});
</script>

<style scoped>
.ep-details {
  margin-top: var(--space-xs);
}
.ep-details-summary {
  font-size: var(--font-sm);
  color: var(--text-muted);
  cursor: pointer;
  padding: var(--space-xs) 0;
  user-select: none;
}
.ep-details-summary:hover {
  color: var(--text-secondary);
}
.ep-details[open] .ep-details-summary {
  margin-bottom: var(--space-sm);
}
.ep-field-hint {
  display: block;
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: var(--space-xs);
}
</style>
