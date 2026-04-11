<template>
  <div class="media-timeline">
    <div v-if="items.length === 0" class="empty-hint">{{ $t('mediaTimeline.empty') }}</div>
    <div v-else class="timeline-scroll" role="list" :aria-label="$t('mediaTimeline.title')">
      <!-- Year markers + thumbnails -->
      <div class="timeline-track">
        <div class="timeline-line"></div>
        <div
          v-for="item in datedItems"
          :key="'d-' + item.media.id"
          class="timeline-card"
          :class="{ 'approximate': item.dateType === 'about', 'range': item.dateType === 'between' }"
          role="listitem"
          :title="tooltipText(item)"
          @click="openLightbox(item)"
        >
          <div class="timeline-year">{{ displayYear(item) }}</div>
          <div class="timeline-thumb-wrap">
            <img
              v-if="thumbnails[item.media.id]"
              :src="thumbnails[item.media.id]"
              class="timeline-thumb"
              :alt="item.media.title || $t('media.title')"
            />
            <div v-else class="timeline-thumb-placeholder">
              {{ item.media.format?.toUpperCase() || '?' }}
            </div>
          </div>
          <div class="timeline-event-type" v-if="item.eventType">{{ item.eventType }}</div>
        </div>

        <!-- Undated section -->
        <template v-if="undatedItems.length > 0">
          <div class="timeline-separator">
            <span class="timeline-separator-label">{{ $t('mediaTimeline.undated') }}</span>
          </div>
          <div
            v-for="item in undatedItems"
            :key="'u-' + item.media.id"
            class="timeline-card undated"
            role="listitem"
            :title="item.media.title || ''"
            @click="openLightbox(item)"
          >
            <div class="timeline-thumb-wrap">
              <img
                v-if="thumbnails[item.media.id]"
                :src="thumbnails[item.media.id]"
                class="timeline-thumb"
                :alt="item.media.title || $t('media.title')"
              />
              <div v-else class="timeline-thumb-placeholder">
                {{ item.media.format?.toUpperCase() || '?' }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Lightbox -->
    <div v-if="lightboxItem" class="modal-overlay" @click.self="lightboxItem = null">
      <div class="lightbox-modal">
        <div class="lightbox-header">
          <h3>{{ lightboxItem.media.title || $t('media.title') }}</h3>
          <button class="btn-cancel" @click="lightboxItem = null">&times;</button>
        </div>
        <div class="lightbox-body">
          <img
            v-if="lightboxDataUrl"
            :src="lightboxDataUrl"
            class="lightbox-image"
            :alt="lightboxItem.media.title || ''"
          />
          <div v-else class="lightbox-no-image">
            {{ lightboxItem.media.format?.toUpperCase() || '?' }}
          </div>
        </div>
        <div class="lightbox-info">
          <div v-if="lightboxItem.eventType" class="lightbox-detail">
            <strong>{{ $t('events.eventType') }}:</strong> {{ lightboxItem.eventType }}
          </div>
          <div v-if="lightboxItem.date" class="lightbox-detail">
            <strong>{{ $t('events.date') }}:</strong> {{ displayDate(lightboxItem) }}
          </div>
          <div v-if="lightboxItem.placeName" class="lightbox-detail">
            <strong>{{ $t('events.place') }}:</strong> {{ lightboxItem.placeName }}
          </div>
          <div v-if="lightboxItem.eventDescription" class="lightbox-detail">
            <strong>{{ $t('events.description') }}:</strong> {{ lightboxItem.eventDescription }}
          </div>
        </div>
        <div class="lightbox-actions">
          <button v-if="lightboxItem.media.file_ref" class="btn-add" @click="openFile(lightboxItem.media.id)">{{ $t('media.open') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface TimelineMedia {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
  link_id: string;
  link_type: number | null;
  sort_order: number;
}

interface TimelineItem {
  media: TimelineMedia;
  date?: string;
  dateEnd?: string;
  dateType?: string;
  eventType?: string;
  eventDescription?: string;
  placeName?: string;
}

const props = defineProps<{
  entityType: 'person' | 'place';
  entityId: string;
}>();

const items = ref<TimelineItem[]>([]);
const thumbnails = ref<Record<string, string>>({});
const lightboxItem = ref<TimelineItem | null>(null);
const lightboxDataUrl = ref<string | null>(null);

const datedItems = computed(() => items.value.filter(i => i.date));
const undatedItems = computed(() => items.value.filter(i => !i.date));

async function load() {
  if (!props.entityId) { items.value = []; return; }
  items.value = (await window.api.media.getTimeline(props.entityType, props.entityId)) as TimelineItem[];

  // Load thumbnails for image media
  const thumbs: Record<string, string> = {};
  for (const item of items.value) {
    if (item.media.file_ref && isImage(item.media.format)) {
      const url = await window.api.media.readAsDataUrl(item.media.id) as string | null;
      if (url) thumbs[item.media.id] = url;
    }
  }
  thumbnails.value = thumbs;
}

function isImage(format: string | null): boolean {
  if (!format) return false;
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(format.toLowerCase());
}

function displayYear(item: TimelineItem): string {
  if (!item.date) return '';
  const year = item.date.substring(0, 4);
  if (item.dateType === 'about') return `~${year}`;
  if (item.dateType === 'before') return `<${year}`;
  if (item.dateType === 'after') return `>${year}`;
  if (item.dateType === 'between' && item.dateEnd) {
    const endYear = item.dateEnd.substring(0, 4);
    return `${year}-${endYear}`;
  }
  return year;
}

function displayDate(item: TimelineItem): string {
  if (!item.date) return '';
  if (item.dateType === 'about') return `~${item.date}`;
  if (item.dateType === 'before') return `<${item.date}`;
  if (item.dateType === 'after') return `>${item.date}`;
  if (item.dateType === 'between' && item.dateEnd) {
    return `${item.date} - ${item.dateEnd}`;
  }
  return item.date;
}

function tooltipText(item: TimelineItem): string {
  const parts: string[] = [];
  if (item.media.title) parts.push(item.media.title);
  if (item.eventType) parts.push(item.eventType);
  if (item.date) parts.push(displayDate(item));
  if (item.placeName) parts.push(item.placeName);
  return parts.join(' - ');
}

async function openLightbox(item: TimelineItem) {
  lightboxItem.value = item;
  if (item.media.file_ref && isImage(item.media.format)) {
    lightboxDataUrl.value = await window.api.media.readAsDataUrl(item.media.id) as string | null;
  } else {
    lightboxDataUrl.value = null;
  }
}

async function openFile(id: string) {
  await window.api.media.openFile(id);
}

watch(() => props.entityId, load, { immediate: true });
</script>

<style scoped>
.media-timeline {
  width: 100%;
}

.timeline-scroll {
  overflow-x: auto;
  padding: 8px 0 16px;
}

.timeline-track {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  position: relative;
  min-width: max-content;
  padding: 0 4px;
}

.timeline-line {
  position: absolute;
  top: 50px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--color-border, #ddd);
  z-index: 0;
}

.timeline-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  position: relative;
  z-index: 1;
  min-width: 80px;
}

.timeline-card:hover .timeline-thumb-wrap {
  border-color: var(--color-primary, #2980b9);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.timeline-year {
  font-size: var(--font-xs, 11px);
  font-weight: 600;
  color: var(--color-text-muted, #666);
  white-space: nowrap;
}

.timeline-card.approximate .timeline-year {
  font-style: italic;
}

.timeline-card.approximate .timeline-thumb-wrap {
  border-style: dashed;
}

.timeline-card.range .timeline-thumb-wrap {
  border-width: 2px;
}

.timeline-thumb-wrap {
  width: 72px;
  height: 72px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 6px;
  overflow: hidden;
  background: var(--color-bg-muted, #f5f5f5);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.timeline-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.timeline-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-xs, 11px);
  color: var(--color-text-faint, #bbb);
  font-weight: 600;
}

.timeline-event-type {
  font-size: var(--font-xs, 11px);
  color: var(--color-text-subtle, #888);
  white-space: nowrap;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.timeline-separator {
  display: flex;
  align-items: center;
  align-self: center;
  z-index: 1;
  padding: 0 8px;
}

.timeline-separator-label {
  font-size: var(--font-xs, 11px);
  color: var(--color-text-faint, #999);
  font-style: italic;
  white-space: nowrap;
}

.timeline-card.undated .timeline-thumb-wrap {
  opacity: 0.7;
}

/* Lightbox */
.lightbox-modal {
  background: var(--color-bg, #fff);
  border-radius: 8px;
  max-width: 600px;
  width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.lightbox-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #eee);
}

.lightbox-header h3 {
  margin: 0;
  font-size: var(--font-md, 15px);
}

.lightbox-body {
  padding: 16px;
  display: flex;
  justify-content: center;
}

.lightbox-image {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
  border-radius: 4px;
}

.lightbox-no-image {
  width: 200px;
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-muted, #f5f5f5);
  border-radius: 4px;
  color: var(--color-text-faint, #bbb);
  font-size: 24px;
  font-weight: 600;
}

.lightbox-info {
  padding: 0 16px 12px;
}

.lightbox-detail {
  font-size: var(--font-sm, 13px);
  margin-bottom: 4px;
  color: var(--color-text, #333);
}

.lightbox-actions {
  padding: 8px 16px 16px;
  display: flex;
  gap: 8px;
}
</style>
