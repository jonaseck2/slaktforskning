<template>
  <BaseModal @close="emit('close')" title-id="modal-title-add-person">
    <h3 id="modal-title-add-person">+ {{ $t('persons.addPerson') }}</h3>
    <form @submit.prevent="submit">
      <label>{{ $t('persons.givenName') }}
        <input v-model="form.given_name" type="text" required autofocus />
      </label>
      <label>{{ $t('persons.surname') }}
        <input v-model="form.surname" type="text" />
      </label>
      <div class="form-row-2col">
        <label>{{ $t('persons.sex') }}
          <select v-model="form.sex">
            <option value="U">{{ $t('persons.sexUnknown') }}</option>
            <option value="M">{{ $t('persons.male') }}</option>
            <option value="F">{{ $t('persons.female') }}</option>
          </select>
        </label>
        <label class="checkbox-label">
          {{ $t('persons.living') }}
          <div class="checkbox-wrap">
            <input type="checkbox" v-model="form.living" />
            {{ form.living ? $t('personDetail.statusLiving') : $t('personDetail.statusDeceased') }}
          </div>
        </label>
      </div>

      <details class="event-section" :open="eventSectionOpen" @toggle="onToggle">
        <summary>{{ $t('events.addEvent') }}</summary>
        <EventFormBody
          v-model:event="eventForm"
          v-model:citation="citationForm"
          context="person"
        />
      </details>

      <div class="modal-actions">
        <AppButton variant="secondary" @click="emit('close')">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" type="submit">{{ $t('common.create') }}</AppButton>
      </div>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import AppButton from './ui/AppButton.vue';
import EventFormBody from './EventFormBody.vue';
import type { CitationFieldsModel } from './CitationFields.vue';
import { suggestNextEventType } from '../utils/eventDefaults';
import { useToast } from '../composables/useToast';
import { useSourceSession } from '../stores/sourceSession';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Person { id: string; sex: string; living: boolean; }

const props = defineProps<{
  prefillPlaceId?: string | null;
  prefillSurname?: string | null;
}>();

const emit = defineEmits<{ close: []; saved: [person: Person] }>();

const { t } = useI18n();
const toast = useToast();
const sourceSession = useSourceSession();

const form = reactive({
  given_name: '',
  surname: props.prefillSurname ?? '',
  sex: 'U',
  living: true,
});

const eventSectionOpen = ref<boolean>(!!props.prefillPlaceId);

const eventForm = reactive({
  event_type: '' as string,
  date_type: 'exact',
  date_value: '',
  date_value_end: '',
  date_original: '',
  place_id: (props.prefillPlaceId ?? null) as string | null,
  description: '',
  cause: '',
});

const citationForm = reactive<CitationFieldsModel>({
  source_id: null,
  page: '',
  confidence: 0,
  transcription: '',
  notes: '',
  date_accessed: new Date().toISOString().slice(0, 10),
});

function onToggle(ev: Event) {
  const el = ev.target as HTMLDetailsElement;
  eventSectionOpen.value = el.open;
}

onMounted(async () => {
  let smartDefaultsEnabled = true;
  if (window.api) {
    try {
      const raw = (await window.api.db.getSetting('event_defaults_config')) as string | null;
      if (raw) {
        const parsed = JSON.parse(raw) as { smartDefaults?: boolean };
        if (typeof parsed.smartDefaults === 'boolean') {
          smartDefaultsEnabled = parsed.smartDefaults;
        }
      }
    } catch {
      // Fallback to enabled=true on missing/malformed setting
      smartDefaultsEnabled = true;
    }
  }

  eventForm.event_type = suggestNextEventType([], smartDefaultsEnabled);

  if (sourceSession.lastSourceId) {
    citationForm.source_id = sourceSession.lastSourceId;
    if (sourceSession.lastPage) citationForm.page = sourceSession.lastPage;
  }
});

async function submit() {
  if (!window.api) return;
  try {
    const payload: Record<string, unknown> = {
      given_name: form.given_name,
      surname: form.surname,
      sex: form.sex,
      living: form.living,
    };

    if (eventSectionOpen.value && eventForm.event_type) {
      payload.event = {
        event_type: eventForm.event_type,
        date_type: eventForm.date_type,
        date_value: eventForm.date_value || null,
        date_value_end: eventForm.date_type === 'between' ? (eventForm.date_value_end || null) : null,
        date_original: eventForm.date_original,
        place_id: eventForm.place_id,
        place_name: null,
        description: eventForm.description,
        cause: eventForm.event_type === 'death' ? (eventForm.cause || null) : null,
      };

      if (citationForm.source_id) {
        payload.citation = {
          source_id: citationForm.source_id,
          page: citationForm.page,
          confidence: citationForm.confidence,
          transcription: citationForm.transcription,
          notes: citationForm.notes,
          date_accessed: citationForm.date_accessed,
        };
        sourceSession.setLastUsed(citationForm.source_id, citationForm.page);
      }
    }

    const result = (await window.api.persons.createWithEvent(payload)) as { person: Person };
    emit('saved', result.person);
  } catch (err) {
    console.error('[AddPersonModal] submit failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
</script>

<style scoped>
.event-section {
  border-top: 1px solid var(--surface-border-subtle);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.event-section > summary {
  cursor: pointer;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
  user-select: none;
}
</style>
