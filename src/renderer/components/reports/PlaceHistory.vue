<template>
  <div class="place-history">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="data">
      <!-- Header -->
      <div class="report-header">
        <h1 class="report-title">{{ data.placeName }}</h1>
        <p v-if="data.placePath" class="report-subtitle">{{ data.placePath }}</p>
        <p class="report-meta">{{ new Date().toLocaleDateString(locale === 'sv' ? 'sv-SE' : 'en-GB') }}</p>
      </div>

      <div v-if="data.events.length === 0" class="empty-section">
        {{ $t('reports.noEventsForPlace') }}
      </div>

      <!-- Events grouped by decade -->
      <section v-for="group in decadeGroups" :key="group.decade" class="decade-section">
        <h2 class="decade-heading">{{ group.label }}</h2>
        <table class="events-table">
          <thead>
            <tr>
              <th>{{ $t('events.date') }}</th>
              <th>{{ $t('common.type') }}</th>
              <th>{{ $t('persons.title') }}</th>
              <th>{{ $t('events.description') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ev in group.events" :key="ev.id">
              <td class="ev-date">{{ ev.dateFormatted || '\u2013' }}</td>
              <td class="ev-type">{{ eventTypeLabel(ev.event_type) }}</td>
              <td class="ev-persons">{{ ev.participant_names || '\u2013' }}</td>
              <td class="ev-desc">{{ ev.description || '\u2013' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '../../composables/useToast';

const { t, locale: i18nLocale } = useI18n();
const toast = useToast();

interface RawPlace { id: string; name: string; }
interface PlaceEvent {
  id: string;
  event_type: string;
  date_type: string | null;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string | null;
  description: string | null;
  participant_names: string;
  dateFormatted: string;
}

interface PlaceHistoryData {
  placeName: string;
  placePath: string | null;
  events: PlaceEvent[];
}

interface DecadeGroup {
  decade: number;
  label: string;
  events: PlaceEvent[];
}

const props = defineProps<{ placeId: string }>();

const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<PlaceHistoryData | null>(null);

const locale = computed(() => i18nLocale.value === 'sv' ? 'sv' : 'en');

function formatDate(ev: { date_type: string | null; date_value: string | null; date_value_end: string | null; date_original: string | null }): string {
  if (ev.date_original) return ev.date_original;
  if (!ev.date_value) return '';
  const prefix = ev.date_type ? t('datePrefix.' + ev.date_type, '') : '';
  if (ev.date_type === 'between' && ev.date_value_end) {
    return `${prefix}${ev.date_value}\u2013${ev.date_value_end}`;
  }
  return `${prefix}${ev.date_value}`;
}

function eventTypeLabel(et: string): string {
  return t('eventTypes.' + et, et);
}

function extractDecade(ev: { date_value: string | null }): number {
  if (!ev.date_value) return 0;
  const m = ev.date_value.match(/\d{4}/);
  if (!m) return 0;
  return Math.floor(parseInt(m[0], 10) / 10) * 10;
}

const decadeGroups = computed((): DecadeGroup[] => {
  if (!data.value) return [];
  const events = data.value.events;
  if (events.length === 0) return [];

  const map = new Map<number, PlaceEvent[]>();
  for (const ev of events) {
    const decade = extractDecade(ev);
    if (!map.has(decade)) map.set(decade, []);
    map.get(decade)!.push(ev);
  }

  const unknownLabel = t('reports.unknownDate');
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([decade, evs]) => ({
      decade,
      label: decade === 0 ? unknownLabel : `${decade}\u2013${decade + 9}`,
      events: evs,
    }));
});

async function load() {
  if (!props.placeId) return;
  loading.value = true;
  error.value = null;
  data.value = null;

  try {
    const place = (await window.api.places.get(props.placeId)) as RawPlace | null;
    if (!place) {
      error.value = t('reports.placeNotFound');
      return;
    }

    let placePath: string | null = null;
    try {
      const pathArr = (await window.api.places.getPath(props.placeId)) as RawPlace[];
      if (pathArr.length > 1) {
        placePath = pathArr.map(p => p.name).join(', ');
      }
    } catch { /* ignore */ }

    const rawEvents = (await window.api.events.forPlace(props.placeId)) as Array<{
      id: string; event_type: string;
      date_type: string | null; date_value: string | null; date_value_end: string | null;
      date_original: string | null; description: string | null;
      participant_names: string;
    }>;

    const events: PlaceEvent[] = rawEvents.map(ev => ({
      ...ev,
      dateFormatted: formatDate(ev),
    }));

    data.value = {
      placeName: place.name,
      placePath,
      events,
    };
  } catch (err) {
    console.error('[PlaceHistory] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = t('reports.loadFailed.placeHistory');
  } finally {
    loading.value = false;
  }
}

watch(() => props.placeId, load, { immediate: true });
</script>

<style scoped>
.place-history {
  font-family: Georgia, serif;
  max-width: 720px;
}
.loading, .error {
  color: #888; font-size: 13px; padding: 16px 0;
}
.error { color: #c00; }

.report-header { margin-bottom: 24px; }
.report-title { font-size: 24px; margin: 0 0 4px; }
.report-subtitle { font-size: 13px; color: #555; margin: 0 0 4px; font-style: italic; }
.report-meta { font-size: 11px; color: #aaa; margin: 0; }
.empty-section { font-size: 13px; color: #aaa; }

.decade-heading {
  font-size: 14px; font-weight: 700; color: #444;
  border-bottom: 1px solid #ccc; padding-bottom: 4px;
  margin: 20px 0 10px;
}

.events-table {
  width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;
}
.events-table th {
  text-align: left; font-weight: 600; padding: 4px 8px 4px 0;
  border-bottom: 1px solid #e0e0e0; color: #333; font-size: 12px;
}
.events-table td {
  padding: 4px 8px 4px 0; vertical-align: top; border-bottom: 1px solid #f0f0f0;
}
.ev-date { white-space: nowrap; }
.ev-type { white-space: nowrap; font-weight: 500; }
.ev-persons { color: #444; }
.ev-desc { color: #666; }

@media print {
  .report-title { font-size: 18px; }
  .events-table { font-size: 11px; }
  .decade-section { break-inside: avoid; }
}
</style>
