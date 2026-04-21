<template>
  <div class="photo-album-report">
    <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="displayItems.length > 0">
      <!-- Cover -->
      <ReportCover
        :title="albumTitle"
        :subtitle="albumSubtitle"
        :hero-image-url="heroImageUrl"
        :researcher-name="researcherName"
      />

      <!-- Chronological media gallery -->
      <section class="report-section">
        <MediaChronological
          :items="displayItems"
          :show-captions="props.showCaptions"
          :per-page="props.perPage"
          :include-documents="props.includeDocuments"
        />
      </section>

      <!-- Photo index -->
      <section v-if="props.showIndex" class="report-section">
        <h2 class="section-heading">{{ $t('reports.photoAlbum.index') }}</h2>
        <ol class="index-list">
          <li v-for="item in displayItems" :key="item.id">
            <a :href="'#media-' + item.id" class="report-link">{{ item.title || $t('common.unknown') }}</a>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ReportCover from './primitives/ReportCover.vue';
import MediaChronological, { type MediaDisplayItem } from './primitives/MediaChronological.vue';
import {
  useMediaChronological,
  type ChronologicalMediaItem,
  type MediaEntityRef,
} from '../../composables/useMediaChronological';
import { formatFullName } from '../../utils/nameUtils';
import { useToast } from '../../composables/useToast';

const props = withDefaults(defineProps<{
  subjectType: 'person' | 'relationship' | 'place' | 'all';
  subjectId?: string | null;
  perPage?: 1 | 2 | 4;
  showCaptions?: boolean;
  showIndex?: boolean;
  includeDocuments?: boolean;
}>(), {
  subjectId: null,
  perPage: 1,
  showCaptions: true,
  showIndex: false,
  includeDocuments: false,
});

const { t } = useI18n();
const toast = useToast();

const loading = ref(false);
const error = ref<string | null>(null);
const researcherName = ref<string | null>(null);
const heroImageUrl = ref<string | null>(null);
const subjectLabel = ref<string | null>(null);

// Entity ref drives useMediaChronological for non-"all" scopes
const mediaEntityRef = computed<MediaEntityRef | null>(() => {
  if (props.subjectType === 'all' || !props.subjectId) return null;
  return { entityType: props.subjectType, entityId: props.subjectId };
});
const { items: entityMediaItems } = useMediaChronological(mediaEntityRef);

// For subjectType === 'all', load all media directly
const allMediaItems = ref<ChronologicalMediaItem[]>([]);

async function loadAllMedia(): Promise<void> {
  if (props.subjectType !== 'all') {
    allMediaItems.value = [];
    return;
  }
  try {
    const raw = (await window.api.media.list()) as Array<Record<string, unknown>>;
    const mapped: ChronologicalMediaItem[] = raw.map((m) => ({
      id: m.id as string,
      title: (m.title as string) || null,
      notes: (m.notes as string) || null,
      fileRef: (m.file_ref as string) || null,
      format: (m.format as string) || null,
      isPrintable: !!(m.is_printable as number | boolean),
      sortOrder: 0,
      inferredDateISO: null,
    }));
    // Sort by title since there's no per-entity sort_order for this scope
    mapped.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    allMediaItems.value = mapped;
  } catch (err) {
    console.error('[PhotoAlbumReport] loadAllMedia failed:', err);
    allMediaItems.value = [];
  }
}

// Unified chronological source
const mediaItems = computed<ChronologicalMediaItem[]>(() =>
  props.subjectType === 'all' ? allMediaItems.value : entityMediaItems.value,
);

function toDisplayItem(m: ChronologicalMediaItem): MediaDisplayItem {
  return {
    id: m.id,
    title: m.title,
    notes: m.notes,
    fileRef: m.fileRef,
    format: m.format,
    inferredDateISO: m.inferredDateISO,
    contextLine: null,
  };
}

function isImageItem(fileRef: string | null, format: string | null): boolean {
  if (!fileRef) return false;
  const fmt = (format || '').toLowerCase();
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(fileRef) || /image/.test(fmt);
}

// The primitive also filters by fileRef + optionally documents, but we pre-filter
// here so the photo index and hero image only reference visible items.
const displayItems = computed<MediaDisplayItem[]>(() =>
  mediaItems.value
    .filter((m) => {
      if (!m.fileRef) return false;
      if (isImageItem(m.fileRef, m.format)) return true;
      return props.includeDocuments;
    })
    .map(toDisplayItem),
);

// Cover title — subject-aware
const albumTitle = computed(() => {
  if (props.subjectType === 'person' && subjectLabel.value) {
    return t('reports.photoAlbum.titlePerson', { name: subjectLabel.value });
  }
  if (props.subjectType === 'relationship' && subjectLabel.value) {
    return t('reports.photoAlbum.titleFamily', { name: subjectLabel.value });
  }
  if (props.subjectType === 'place' && subjectLabel.value) {
    return t('reports.photoAlbum.titlePlace', { name: subjectLabel.value });
  }
  return t('reports.photoAlbum.title');
});

const albumSubtitle = computed(() => {
  if (props.subjectType === 'all') return t('reports.photoAlbum.subjectAll');
  if (props.subjectType === 'person') return t('reports.photoAlbum.subjectPerson');
  if (props.subjectType === 'relationship') return t('reports.photoAlbum.subjectRelationship');
  if (props.subjectType === 'place') return t('reports.photoAlbum.subjectPlace');
  return '';
});

// Hero image: first image in the display set
watch(
  () => displayItems.value[0]?.id ?? null,
  async (id) => {
    if (!id) {
      heroImageUrl.value = null;
      return;
    }
    try {
      heroImageUrl.value = (await window.api.media.readAsDataUrl(id)) as string | null;
    } catch {
      heroImageUrl.value = null;
    }
  },
  { immediate: true },
);

interface RawPersonName {
  given_name: string | null;
  surname: string | null;
  name_prefix?: string | null;
  name_suffix?: string | null;
  preferred_name?: string | null;
  nickname?: string | null;
  sort_order: number;
  name_type: string;
}

async function loadSubjectLabel(): Promise<void> {
  subjectLabel.value = null;
  if (!props.subjectId || props.subjectType === 'all') return;
  try {
    if (props.subjectType === 'person') {
      const names = (await window.api.persons.getNames(props.subjectId)) as RawPersonName[];
      if (names.length > 0) {
        const sorted = [...names].sort((a, b) => a.sort_order - b.sort_order);
        subjectLabel.value = formatFullName(sorted[0]);
      }
    } else if (props.subjectType === 'place') {
      const place = (await window.api.places.get(props.subjectId)) as { name: string } | null;
      subjectLabel.value = place?.name ?? null;
    } else if (props.subjectType === 'relationship') {
      const rel = (await window.api.relationships.get(props.subjectId)) as {
        person1_id: string | null;
        person2_id: string | null;
      } | null;
      if (rel) {
        const [p1Names, p2Names] = await Promise.all([
          rel.person1_id
            ? (window.api.persons.getNames(rel.person1_id) as Promise<RawPersonName[]>)
            : Promise.resolve<RawPersonName[]>([]),
          rel.person2_id
            ? (window.api.persons.getNames(rel.person2_id) as Promise<RawPersonName[]>)
            : Promise.resolve<RawPersonName[]>([]),
        ]);
        const n1 = p1Names.sort((a, b) => a.sort_order - b.sort_order)[0];
        const n2 = p2Names.sort((a, b) => a.sort_order - b.sort_order)[0];
        const parts: string[] = [];
        if (n1) parts.push(formatFullName(n1));
        if (n2) parts.push(formatFullName(n2));
        subjectLabel.value = parts.length > 0 ? parts.join(' & ') : null;
      }
    }
  } catch (err) {
    console.error('[PhotoAlbumReport] loadSubjectLabel failed:', err);
  }
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [, , researcher] = await Promise.all([
      loadAllMedia(),
      loadSubjectLabel(),
      window.api.db.getSetting('researcher_name') as Promise<string | null>,
    ]);
    researcherName.value = researcher || null;
  } catch (err) {
    console.error('[PhotoAlbumReport] load failed:', err);
    toast.error(t('errors.loadFailed'));
    error.value = t('reports.loadFailed.photoAlbum');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.subjectType, props.subjectId] as const,
  load,
  { immediate: true },
);
</script>

<style scoped>
.photo-album-report {
  font-family: var(--report-serif-stack);
}
.loading, .error {
  color: var(--text-muted);
  font-size: var(--font-sm);
  padding: var(--space-md) 0;
}
.error { color: var(--error-text); }

.report-section {
  padding: var(--space-xl) 0;
  page-break-inside: avoid;
}
.section-heading {
  font-family: var(--report-serif-stack);
  font-size: 1.5rem;
  margin-bottom: var(--space-lg);
}
.index-list {
  padding-left: var(--space-lg);
  line-height: var(--report-prose-leading);
}
.index-list li {
  padding: 2px 0;
}
.report-link {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--surface-border-subtle);
  transition: border-color 0.15s, color 0.15s;
}
.report-link:hover {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
@media print {
  .report-link { border-bottom: none; }
}
</style>
