<template>
  <div v-if="visible" class="modal-overlay lightbox-overlay" @click.self="$emit('close')" @keydown="onKeydown">
    <div class="lightbox" role="dialog" :aria-label="$t('media.title')" ref="lightboxEl" tabindex="-1">
      <button class="lightbox-close" @click="$emit('close')" :title="$t('media.lightbox.close')">&#10005;</button>

      <div class="lightbox-body">
        <!-- Navigation prev -->
        <button
          v-if="mediaItems.length > 1"
          class="lightbox-nav lightbox-prev"
          :disabled="currentIndex <= 0"
          @click="$emit('update:currentIndex', currentIndex - 1)"
          :title="$t('media.lightbox.prev')"
        >&#9664;</button>

        <!-- Main content area -->
        <div class="lightbox-main">
          <div v-if="isImage" class="lightbox-image-container">
            <img
              v-if="dataUrl"
              :src="dataUrl"
              :alt="currentItem?.title || ''"
              class="lightbox-image"
            />
            <div v-else class="lightbox-loading">{{ $t('common.loading') }}</div>
          </div>
          <div v-else class="lightbox-file-icon">
            <div class="file-icon-box">
              <span class="file-ext">{{ currentItem?.format?.toUpperCase() || '?' }}</span>
            </div>
            <button class="btn-add" @click="openExternal">{{ $t('media.lightbox.openExternal') }}</button>
          </div>
        </div>

        <!-- Navigation next -->
        <button
          v-if="mediaItems.length > 1"
          class="lightbox-nav lightbox-next"
          :disabled="currentIndex >= mediaItems.length - 1"
          @click="$emit('update:currentIndex', currentIndex + 1)"
          :title="$t('media.lightbox.next')"
        >&#9654;</button>
      </div>

      <!-- Info panel -->
      <div class="lightbox-info">
        <div class="lightbox-meta">
          <h3 class="lightbox-title">{{ currentItem?.title || '—' }}</h3>
          <p v-if="currentItem?.format" class="lightbox-format">{{ currentItem.format }}</p>
          <p v-if="currentItem?.notes" class="lightbox-notes">{{ currentItem.notes }}</p>
          <p v-if="mediaItems.length > 1" class="lightbox-counter">
            {{ currentIndex + 1 }} / {{ mediaItems.length }}
          </p>
        </div>

        <!-- Linked entities -->
        <div class="lightbox-links">
          <h4>{{ $t('media.lightbox.linkedEntities') }}</h4>
          <div v-if="loadingLinks" class="lightbox-links-loading">{{ $t('common.loading') }}</div>
          <div v-else-if="linkedEntities.length === 0" class="lightbox-links-empty">
            {{ $t('media.noMedia') }}
          </div>
          <div v-else>
            <div v-for="group in groupedLinks" :key="group.type" class="link-group">
              <span class="link-group-label">{{ entityTypeLabel(group.type) }}</span>
              <div v-for="link in group.items" :key="link.linkId" class="link-item">
                <router-link
                  :to="entityRoute(link)"
                  class="person-link"
                  @click="$emit('close')"
                >{{ link.label }}</router-link>
                <button class="btn-unlink" @click="unlinkEntity(link.linkId)" :title="$t('media.lightbox.unlink')">&#10005;</button>
              </div>
            </div>
          </div>

          <!-- Add link controls -->
          <div class="link-add-section">
            <div v-if="!showLinkPicker" class="link-add-trigger">
              <button class="btn-sm" @click="showLinkPicker = true">{{ $t('media.lightbox.linkTo') }}</button>
            </div>
            <div v-else class="link-picker-panel">
              <div class="link-picker-tabs">
                <button
                  v-for="tab in linkTabs"
                  :key="tab"
                  class="tab-btn"
                  :class="{ active: linkTab === tab }"
                  @click="linkTab = tab"
                >{{ entityTypeLabel(tab) }}</button>
              </div>
              <div class="link-picker-input">
                <PersonPicker
                  v-if="linkTab === 'person'"
                  :model-value="null"
                  :placeholder="$t('app.search')"
                  @select="linkToPerson"
                />
                <PlacePicker
                  v-if="linkTab === 'place'"
                  :model-value="null"
                  :placeholder="$t('app.search')"
                  @select="linkToPlace"
                />
                <div v-if="linkTab === 'source'" class="source-picker">
                  <select v-model="selectedSourceId" @change="linkToSource">
                    <option value="">{{ $t('app.search') }}</option>
                    <option v-for="s in allSources" :key="s.id" :value="s.id">{{ s.title || '—' }}</option>
                  </select>
                </div>
              </div>
              <button class="btn-cancel btn-sm" @click="showLinkPicker = false">{{ $t('common.cancel') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import PersonPicker from './PersonPicker.vue';
import PlacePicker from './PlacePicker.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface MediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
  notes: string;
}

interface LinkedEntity {
  linkId: string;
  entityType: string;
  entityId: string;
  label: string;
}

interface SourceItem {
  id: string;
  title: string;
}

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif']);

const props = defineProps<{
  mediaItems: MediaItem[];
  currentIndex: number;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
  'update:currentIndex': [index: number];
  linkChanged: [];
}>();

const { t } = useI18n();
const lightboxEl = ref<HTMLDivElement | null>(null);
const dataUrl = ref<string | null>(null);
const linkedEntities = ref<LinkedEntity[]>([]);
const loadingLinks = ref(false);
const showLinkPicker = ref(false);
const linkTab = ref<'person' | 'place' | 'source'>('person');
const selectedSourceId = ref('');
const allSources = ref<SourceItem[]>([]);

const linkTabs = ['person', 'place', 'source'] as const;

const currentItem = computed(() => props.mediaItems[props.currentIndex] ?? null);

const isImage = computed(() => {
  const fmt = currentItem.value?.format?.toLowerCase();
  return fmt ? IMAGE_FORMATS.has(fmt) : false;
});

const groupedLinks = computed(() => {
  const groups: Record<string, LinkedEntity[]> = {};
  for (const link of linkedEntities.value) {
    if (!groups[link.entityType]) groups[link.entityType] = [];
    groups[link.entityType].push(link);
  }
  return Object.entries(groups).map(([type, items]) => ({ type, items }));
});

function entityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    person: t('persons.title'),
    event: t('events.title'),
    relationship: t('relationships.title'),
    place: t('places.title'),
    source: t('sources.title'),
  };
  return labels[type] || type;
}

function entityRoute(link: LinkedEntity): string {
  const routes: Record<string, string> = {
    person: `/persons/${link.entityId}`,
    relationship: `/relationships/${link.entityId}`,
    source: `/sources/${link.entityId}`,
    place: `/places/${link.entityId}`,
  };
  return routes[link.entityType] || '/';
}

async function loadImage() {
  dataUrl.value = null;
  if (!currentItem.value || !isImage.value) return;
  const url = await window.api.media.readAsDataUrl(currentItem.value.id) as string | null;
  dataUrl.value = url;
}

async function loadLinks() {
  if (!currentItem.value) {
    linkedEntities.value = [];
    return;
  }
  loadingLinks.value = true;
  try {
    const links = await window.api.media.linksForMedia(currentItem.value.id) as Array<{
      id: string;
      entity_type: string;
      entity_id: string;
    }>;
    const resolved: LinkedEntity[] = [];
    for (const link of links) {
      const label = await resolveEntityLabel(link.entity_type, link.entity_id);
      resolved.push({
        linkId: link.id,
        entityType: link.entity_type,
        entityId: link.entity_id,
        label,
      });
    }
    linkedEntities.value = resolved;
  } finally {
    loadingLinks.value = false;
  }
}

async function resolveEntityLabel(entityType: string, entityId: string): Promise<string> {
  try {
    if (entityType === 'person') {
      const p = await window.api.persons.get(entityId) as { given_name?: string; surname?: string } | null;
      if (p) return [p.given_name, p.surname].filter(Boolean).join(' ') || '—';
    } else if (entityType === 'source') {
      const s = await window.api.sources.get(entityId) as { title?: string } | null;
      if (s) return s.title || '—';
    } else if (entityType === 'place') {
      const pl = await window.api.places.get(entityId) as { name?: string } | null;
      if (pl) return pl.name || '—';
    } else if (entityType === 'relationship') {
      const r = await window.api.relationships.get(entityId) as { type?: string } | null;
      if (r) return r.type || '—';
    } else if (entityType === 'event') {
      const e = await window.api.events.get(entityId) as { event_type?: string; date_original?: string } | null;
      if (e) return [e.event_type, e.date_original].filter(Boolean).join(' ') || '—';
    }
  } catch {
    // entity may have been deleted
  }
  return entityId.slice(0, 8);
}

async function unlinkEntity(linkId: string) {
  await window.api.media.removeLink(linkId);
  await loadLinks();
  emit('linkChanged');
}

async function linkToPerson(person: { id: string }) {
  if (!currentItem.value) return;
  await window.api.media.addLink({
    media_id: currentItem.value.id,
    entity_type: 'person',
    entity_id: person.id,
  });
  showLinkPicker.value = false;
  await loadLinks();
  emit('linkChanged');
}

async function linkToPlace(place: { id: string }) {
  if (!currentItem.value) return;
  await window.api.media.addLink({
    media_id: currentItem.value.id,
    entity_type: 'place',
    entity_id: place.id,
  });
  showLinkPicker.value = false;
  await loadLinks();
  emit('linkChanged');
}

async function linkToSource() {
  if (!currentItem.value || !selectedSourceId.value) return;
  await window.api.media.addLink({
    media_id: currentItem.value.id,
    entity_type: 'source',
    entity_id: selectedSourceId.value,
  });
  selectedSourceId.value = '';
  showLinkPicker.value = false;
  await loadLinks();
  emit('linkChanged');
}

async function openExternal() {
  if (!currentItem.value) return;
  await window.api.media.openFile(currentItem.value.id);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  } else if (e.key === 'ArrowLeft' && props.currentIndex > 0) {
    emit('update:currentIndex', props.currentIndex - 1);
  } else if (e.key === 'ArrowRight' && props.currentIndex < props.mediaItems.length - 1) {
    emit('update:currentIndex', props.currentIndex + 1);
  }
}

watch(() => [props.visible, props.currentIndex], async () => {
  if (!props.visible) return;
  showLinkPicker.value = false;
  await Promise.all([loadImage(), loadLinks()]);
  await nextTick();
  lightboxEl.value?.focus();
}, { immediate: true });

watch(() => props.visible, async (vis) => {
  if (vis && showLinkPicker.value) {
    allSources.value = (await window.api.sources.list()) as SourceItem[];
  }
});

watch(() => showLinkPicker.value, async (val) => {
  if (val) {
    allSources.value = (await window.api.sources.list()) as SourceItem[];
  }
});
</script>

<style scoped>
.lightbox-overlay {
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lightbox {
  position: relative;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  color: #e0e0e0;
  border-radius: 8px;
  max-width: 95vw;
  max-height: 92vh;
  width: 900px;
  overflow: hidden;
  outline: none;
}
.lightbox-close {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 10;
  background: none;
  border: none;
  color: #aaa;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.lightbox-close:hover { color: #fff; background: rgba(255,255,255,0.1); }

.lightbox-body {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 300px;
  max-height: 60vh;
  position: relative;
}
.lightbox-nav {
  background: none;
  border: none;
  color: #999;
  font-size: 28px;
  cursor: pointer;
  padding: 16px 12px;
  flex-shrink: 0;
}
.lightbox-nav:hover:not(:disabled) { color: #fff; }
.lightbox-nav:disabled { opacity: 0.2; cursor: default; }

.lightbox-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 16px 0;
}
.lightbox-image-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.lightbox-image {
  max-width: 100%;
  max-height: 55vh;
  object-fit: contain;
  border-radius: 4px;
}
.lightbox-loading {
  color: #888;
  font-size: var(--font-sm);
}

.lightbox-file-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.file-icon-box {
  width: 100px;
  height: 120px;
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.file-ext {
  font-size: 18px;
  font-weight: 700;
  color: #999;
}

.lightbox-info {
  display: flex;
  gap: 24px;
  padding: 12px 20px 16px;
  border-top: 1px solid #333;
  max-height: 30vh;
  overflow-y: auto;
}
.lightbox-meta {
  flex: 1;
  min-width: 0;
}
.lightbox-title {
  font-size: var(--font-lg);
  font-weight: 600;
  margin: 0 0 4px;
  color: #fff;
}
.lightbox-format {
  font-size: var(--font-xs);
  color: #888;
  margin: 0 0 4px;
  text-transform: uppercase;
}
.lightbox-notes {
  font-size: var(--font-sm);
  color: #aaa;
  margin: 0;
  white-space: pre-line;
}
.lightbox-counter {
  font-size: var(--font-xs);
  color: #666;
  margin: 8px 0 0;
}

.lightbox-links {
  width: 260px;
  flex-shrink: 0;
}
.lightbox-links h4 {
  margin: 0 0 8px;
  font-size: var(--font-sm);
  color: #aaa;
  font-weight: 600;
}
.lightbox-links-loading, .lightbox-links-empty {
  font-size: var(--font-xs);
  color: #666;
}

.link-group {
  margin-bottom: 8px;
}
.link-group-label {
  display: block;
  font-size: var(--font-xs);
  color: #777;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}
.link-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
}
.link-item .person-link {
  color: #7ab3f0;
  font-size: var(--font-sm);
}
.btn-unlink {
  background: none;
  border: none;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
}
.btn-unlink:hover { color: #e53e3e; background: rgba(229,62,62,0.1); }

.link-add-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #333;
}
.link-picker-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.link-picker-tabs {
  display: flex;
  gap: 4px;
}
.link-picker-tabs .tab-btn {
  font-size: var(--font-xs);
  padding: 3px 8px;
  background: #2a2a2a;
  border: 1px solid #444;
  color: #aaa;
  border-radius: 3px;
  cursor: pointer;
}
.link-picker-tabs .tab-btn.active {
  background: #333;
  color: #fff;
  border-color: #666;
}
.link-picker-input :deep(input),
.link-picker-input select {
  width: 100%;
  padding: 4px 8px;
  font-size: var(--font-sm);
  background: #2a2a2a;
  border: 1px solid #444;
  color: #e0e0e0;
  border-radius: 4px;
}
.source-picker select {
  width: 100%;
}
</style>
