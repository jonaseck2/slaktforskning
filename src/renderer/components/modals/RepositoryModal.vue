<template>
  <BaseSubPanel
    entity-type="repository"
    :title="form.name || $t('repositories.newRepository')"
    :mode="mode"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <label class="ep-field-label" for="repo-field-name">{{ $t('repositories.name') }}</label>
        <input id="repo-field-name"
          ref="nameRef"
          class="ep-input"
          v-model="form.name"
          :placeholder="$t('repositories.namePlaceholder')"
          required
        />
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="repo-field-address">{{ $t('repositories.address') }}</label>
        <input id="repo-field-address" class="ep-input" v-model="form.address" />
      </div>
      <div class="ep-row">
        <div class="ep-field">
          <label class="ep-field-label" for="repo-field-postal">{{ $t('repositories.postalCode') }}</label>
          <input id="repo-field-postal" class="ep-input" v-model="form.postal_code" />
        </div>
        <div class="ep-field">
          <label class="ep-field-label" for="repo-field-city">{{ $t('repositories.city') }}</label>
          <input id="repo-field-city" class="ep-input" v-model="form.city" />
        </div>
      </div>
      <div class="ep-row">
        <div class="ep-field">
          <label class="ep-field-label" for="repo-field-state">{{ $t('repositories.state') }}</label>
          <input id="repo-field-state" class="ep-input" v-model="form.state" />
        </div>
        <div class="ep-field">
          <label class="ep-field-label" for="repo-field-country">{{ $t('repositories.country') }}</label>
          <input id="repo-field-country" class="ep-input" v-model="form.country" />
        </div>
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="repo-field-phone">{{ $t('repositories.phone') }}</label>
        <input id="repo-field-phone" class="ep-input" v-model="form.phone" type="tel" />
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="repo-field-email">{{ $t('repositories.email') }}</label>
        <input id="repo-field-email" class="ep-input" v-model="form.email" type="email" />
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="repo-field-web">{{ $t('repositories.web') }}</label>
        <input id="repo-field-web" class="ep-input" v-model="form.web" type="url" />
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="repo-field-call">{{ $t('repositories.callNumber') }}</label>
        <input id="repo-field-call" class="ep-input" v-model="form.call_number" />
      </div>
      <div class="ep-field">
        <label class="ep-field-label" for="repo-field-notes">{{ $t('repositories.notes') }}</label>
        <textarea id="repo-field-notes" class="ep-textarea" v-model="form.notes" rows="3" />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import { useToast } from '../../composables/useToast';

interface Repository {
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
}

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  editingRepository?: Repository | null;
  initialName?: string;
}>(), {
  mode: 'standalone',
  editingRepository: null,
  initialName: '',
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [repository: Repository];
}>();

const { t } = useI18n();
const toast = useToast();
const nameRef = ref<HTMLInputElement | null>(null);
const savedId = ref<string | null>(props.editingRepository?.id ?? null);

const form = reactive({
  name: props.editingRepository?.name ?? props.initialName ?? '',
  address: props.editingRepository?.address ?? '',
  city: props.editingRepository?.city ?? '',
  postal_code: props.editingRepository?.postal_code ?? '',
  state: props.editingRepository?.state ?? '',
  country: props.editingRepository?.country ?? '',
  phone: props.editingRepository?.phone ?? '',
  email: props.editingRepository?.email ?? '',
  web: props.editingRepository?.web ?? '',
  call_number: props.editingRepository?.call_number ?? '',
  notes: props.editingRepository?.notes ?? '',
});

async function handleSave() {
  if (!window.api || !form.name.trim()) return;
  try {
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      web: form.web.trim() || null,
      call_number: form.call_number.trim() || null,
      notes: form.notes,
    };
    let repo: Repository;
    if (savedId.value) {
      repo = (await window.api.repositories.update(savedId.value, payload)) as Repository;
    } else {
      repo = (await window.api.repositories.create(payload)) as Repository;
      savedId.value = repo.id;
    }
    emit('saved', repo);
  } catch (err) {
    console.error('[RepositoryModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

onMounted(() => {
  nextTick(() => nameRef.value?.focus());
});
</script>

<style scoped>
.ep-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}
</style>
