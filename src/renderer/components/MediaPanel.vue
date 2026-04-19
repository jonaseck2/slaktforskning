<template>
  <div class="media-panel">
    <!-- Empty state -->
    <div v-if="!mediaId" class="panel-empty">
      {{ $t('media.selectMedia') }}
    </div>

    <template v-else-if="loading">
      <div class="panel-loading">
        <AppLoadingState :rows="3" />
      </div>
    </template>

    <template v-else-if="media">
      <!-- Header: thumbnail + title -->
      <div class="panel-header">
        <button class="panel-close-btn" @click="emit('close')" :title="$t('common.close')">&#10005;</button>
        <div class="media-thumbnail">
          <img v-if="thumbnailSrc" :src="thumbnailSrc" :alt="media.title || ''" class="media-thumb-img" />
          <div v-else class="media-placeholder">
            <span class="media-placeholder-ext">{{ (media.format || '?').toUpperCase() }}</span>
          </div>
        </div>
        <div class="media-info">
          <div class="media-title">{{ media.title || $t('media.untitled') }}</div>
          <div v-if="media.format" class="media-meta">{{ media.format.toUpperCase() }}</div>
        </div>
      </div>

      <!-- Notes -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('common.notes')"
          :collapsed="!sections.notes"
          @toggle="toggleSection('notes')"
        />
        <div v-if="sections.notes" class="panel-section-body">
          <textarea
            v-model="notesDraft"
            class="notes-textarea"
            :placeholder="$t('media.notesPlaceholder')"
            rows="3"
            @blur="saveNotes"
          ></textarea>
        </div>
      </div>

      <!-- Linked Persons -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.linkedPersons')"
          :count="linkedPersons.length"
          :collapsed="!sections.persons"
          :action-label="$t('media.linkPerson')"
          @toggle="toggleSection('persons')"
          @action="showPersonPicker = true"
        />
        <div v-if="sections.persons" class="panel-section-body">
          <div v-if="showPersonPicker" class="picker-wrap">
            <PersonPicker :model-value="null" :placeholder="$t('addRelated.searchPlaceholder')" @select="linkPerson" />
            <AppButton variant="ghost" size="sm" @click="showPersonPicker = false">{{ $t('common.cancel') }}</AppButton>
          </div>
          <div v-if="linkedPersons.length === 0 && !showPersonPicker" class="panel-empty-section">--</div>
          <div v-for="lp in linkedPersons" :key="lp.linkId" class="linked-row">
            <AppAvatar :given-name="lp.givenName" :surname="lp.surname" :sex="lp.sex" size="sm" />
            <router-link :to="'/persons/' + lp.entityId" class="person-link">{{ lp.label }}</router-link>
            <AppButton variant="ghost" size="sm" class="unlink-btn" @click="unlinkEntity(lp.linkId)">&#10005;</AppButton>
          </div>
        </div>
      </div>

      <!-- Linked Places -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.linkedPlaces')"
          :count="linkedPlaces.length"
          :collapsed="!sections.places"
          :action-label="$t('media.linkPlace')"
          @toggle="toggleSection('places')"
          @action="showPlacePicker = true"
        />
        <div v-if="sections.places" class="panel-section-body">
          <div v-if="showPlacePicker" class="picker-wrap">
            <PlacePicker :model-value="null" :placeholder="$t('places.searchPlaceholder')" @select="linkPlace" />
            <AppButton variant="ghost" size="sm" @click="showPlacePicker = false">{{ $t('common.cancel') }}</AppButton>
          </div>
          <div v-if="linkedPlaces.length === 0 && !showPlacePicker" class="panel-empty-section">--</div>
          <div v-for="lp in linkedPlaces" :key="lp.linkId" class="linked-row">
            <router-link :to="'/places/' + lp.entityId" class="person-link">{{ lp.label }}</router-link>
            <AppButton variant="ghost" size="sm" class="unlink-btn" @click="unlinkEntity(lp.linkId)">&#10005;</AppButton>
          </div>
        </div>
      </div>

      <!-- Linked Events -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.linkedEvents')"
          :count="linkedEvents.length"
          :collapsed="!sections.events"
          @toggle="toggleSection('events')"
        />
        <div v-if="sections.events" class="panel-section-body">
          <div v-if="linkedEvents.length === 0" class="panel-empty-section">--</div>
          <div v-for="le in linkedEvents" :key="le.linkId" class="linked-row">
            <span>{{ le.label }}</span>
            <AppButton variant="ghost" size="sm" class="unlink-btn" @click="unlinkEntity(le.linkId)">&#10005;</AppButton>
          </div>
        </div>
      </div>

      <!-- Face Tags -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.faceTags')"
          :count="regions.length"
          :collapsed="!sections.faceTags"
          :action-label="drawMode ? $t('media.viewer.drawDone') : $t('media.viewer.drawTag')"
          @toggle="toggleSection('faceTags')"
          @action="drawMode ? emit('stop-draw-mode') : emit('start-draw-mode')"
        />
        <div v-if="sections.faceTags" class="panel-section-body">
          <div v-if="regions.length === 0 && !drawMode" class="panel-empty-section">{{ $t('media.noFaceTags') }}</div>
          <div
            v-for="r in regions"
            :key="r.id"
            class="linked-row face-tag-row"
            :class="{ 'face-tag-highlighted': highlightedRegionId === r.id }"
            @mouseenter="emit('highlight-region', r.id)"
            @mouseleave="emit('highlight-region', null)"
          >
            <template v-if="editingTagId === r.id">
              <div class="face-tag-assign">
                <PersonPicker :model-value="null" :placeholder="$t('media.viewer.assignPerson')" @select="(person: { id: string }) => assignPersonToRegion(r.id, person.id)" />
              </div>
            </template>
            <template v-else>
              <AppAvatar v-if="r.person_id" :given-name="r.personGivenName || ''" :surname="r.personSurname || ''" :sex="r.personSex || 'U'" size="sm" />
              <div v-else class="face-tag-unknown">?</div>
              <span class="face-tag-name face-tag-clickable" @click="editingTagId = r.id">{{ r.person_id ? (r.personName || $t('media.untitled')) : $t('media.viewer.assignPerson') }}</span>
              <button
                v-if="r.person_id"
                class="star-btn"
                :class="{ 'is-profile': regionIsProfile[r.id] }"
                :title="regionIsProfile[r.id] ? $t('media.currentProfile') : $t('media.setAsProfile')"
                :disabled="!!regionIsProfile[r.id]"
                @click="setProfileForRegion(r)"
              >{{ regionIsProfile[r.id] ? '★' : '☆' }}</button>
            </template>
            <AppButton variant="ghost" size="sm" class="unlink-btn" @click="deleteRegion(r.id)">&#10005;</AppButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import AppAvatar from './ui/AppAvatar.vue';
import AppButton from './ui/AppButton.vue';
import AppLoadingState from './ui/AppLoadingState.vue';
import SectionHeader from './ui/SectionHeader.vue';
import PersonPicker from './PersonPicker.vue';
import PlacePicker from './PlacePicker.vue';
import { resolvePersonDisplayName } from '../utils/nameUtils';
import { setMediaAsPersonProfile, isMediaPersonProfile } from '../utils/mediaProfile';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif']);

interface MediaData {
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
  givenName: string;
  surname: string;
  sex: 'M' | 'F' | 'U';
}

interface RegionData {
  id: string;
  person_id: string | null;
  label: string | null;
  personName: string;
  personGivenName: string;
  personSurname: string;
  personSex: 'M' | 'F' | 'U';
}

const props = defineProps<{
  mediaId: string | null;
  drawMode?: boolean;
  highlightedRegionId?: string | null;
}>();

const emit = defineEmits<{
  'link-changed': [];
  'close': [];
  'start-draw-mode': [];
  'stop-draw-mode': [];
  'highlight-region': [id: string | null];
  'region-deleted': [];
}>();

const media = ref<MediaData | null>(null);
const loading = ref(false);
const thumbnailSrc = ref<string | null>(null);
const linkedPersons = ref<LinkedEntity[]>([]);
const linkedPlaces = ref<LinkedEntity[]>([]);
const linkedEvents = ref<LinkedEntity[]>([]);
const regions = ref<RegionData[]>([]);
const regionIsProfile = ref<Record<string, boolean>>({});
const showPersonPicker = ref(false);
const showPlacePicker = ref(false);
const editingTagId = ref<string | null>(null);
const notesDraft = ref('');

const sections = reactive({
  notes: false,
  persons: true,
  places: true,
  events: false,
  faceTags: false,
});

function toggleSection(key: keyof typeof sections) {
  sections[key] = !sections[key];
}

async function resolveEntityLabel(entityType: string, entityId: string): Promise<string> {
  try {
    if (entityType === 'person') {
      return await resolvePersonDisplayName(entityId);
    } else if (entityType === 'source') {
      const s = await window.api.sources.get(entityId) as { title?: string } | null;
      if (s) return s.title || '--';
    } else if (entityType === 'place') {
      const pl = await window.api.places.get(entityId) as { name?: string } | null;
      if (pl) return pl.name || '--';
    } else if (entityType === 'event') {
      const ev = await window.api.events.get(entityId) as { event_type?: string; date_original?: string } | null;
      if (ev) return [ev.event_type, ev.date_original].filter(Boolean).join(' - ') || '--';
    }
  } catch { /* ignore */ }
  return entityType + ':' + entityId;
}

async function computeRegionProfileState() {
  if (!props.mediaId) {
    regionIsProfile.value = {};
    return;
  }
  const newState: Record<string, boolean> = {};
  for (const r of regions.value) {
    if (!r.person_id) continue;
    newState[r.id] = await isMediaPersonProfile(r.person_id, props.mediaId);
  }
  regionIsProfile.value = newState;
}

async function load() {
  if (!props.mediaId) {
    media.value = null;
    thumbnailSrc.value = null;
    notesDraft.value = '';
    linkedPersons.value = [];
    linkedPlaces.value = [];
    linkedEvents.value = [];
    regions.value = [];
    regionIsProfile.value = {};
    return;
  }

  loading.value = true;
  try {
    const m = await window.api.media.get(props.mediaId) as MediaData | null;
    media.value = m;
    notesDraft.value = m?.notes ?? '';
    if (m?.notes) sections.notes = true;

    if (m && m.format && IMAGE_FORMATS.has(m.format.toLowerCase())) {
      const url = await window.api.media.readAsDataUrl(props.mediaId) as string | null;
      thumbnailSrc.value = url;
    } else {
      thumbnailSrc.value = null;
    }

    // Load links
    const links = await window.api.media.linksForMedia(props.mediaId) as Array<{
      id: string;
      entity_type: string;
      entity_id: string;
    }>;

    const persons: LinkedEntity[] = [];
    const places: LinkedEntity[] = [];
    const events: LinkedEntity[] = [];

    for (const link of links) {
      const label = await resolveEntityLabel(link.entity_type, link.entity_id);
      let givenName = '';
      let surname = '';
      let sex: 'M' | 'F' | 'U' = 'U';

      if (link.entity_type === 'person') {
        try {
          const p = await window.api.persons.get(link.entity_id) as { sex?: string } | null;
          if (p) {
            sex = (p.sex as 'M' | 'F' | 'U') || 'U';
          }
          const names = await window.api.persons.getNames(link.entity_id) as Array<{
            given_name?: string; surname?: string; sort_order: number;
          }>;
          if (names.length > 0) {
            const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0];
            givenName = primary.given_name || '';
            surname = primary.surname || '';
          }
        } catch { /* ignore */ }
      }

      const entity: LinkedEntity = {
        linkId: link.id,
        entityType: link.entity_type,
        entityId: link.entity_id,
        label,
        givenName,
        surname,
        sex,
      };

      if (link.entity_type === 'person') persons.push(entity);
      else if (link.entity_type === 'place') places.push(entity);
      else if (link.entity_type === 'event') events.push(entity);
    }

    linkedPersons.value = persons;
    linkedPlaces.value = places;
    linkedEvents.value = events;

    // Load face tag regions
    const regs = await window.api.mediaRegions.getForMedia(props.mediaId) as Array<{
      id: string;
      person_id: string | null;
      label: string | null;
    }>;

    const enrichedRegions: RegionData[] = [];
    for (const r of regs) {
      let personName = '';
      let personGivenName = '';
      let personSurname = '';
      let personSex: 'M' | 'F' | 'U' = 'U';
      if (r.person_id) {
        try {
          personName = await resolvePersonDisplayName(r.person_id);
          const p = await window.api.persons.get(r.person_id) as { sex?: string } | null;
          if (p) {
            personSex = (p.sex as 'M' | 'F' | 'U') || 'U';
          }
          const names = await window.api.persons.getNames(r.person_id) as Array<{
            given_name?: string; surname?: string; sort_order: number;
          }>;
          if (names.length > 0) {
            const primary = [...names].sort((a, b) => a.sort_order - b.sort_order)[0];
            personGivenName = primary.given_name || '';
            personSurname = primary.surname || '';
          }
        } catch { /* ignore */ }
      }
      enrichedRegions.push({
        id: r.id,
        person_id: r.person_id,
        label: r.label,
        personName,
        personGivenName,
        personSurname,
        personSex,
      });
    }
    regions.value = enrichedRegions;
    await computeRegionProfileState();
  } finally {
    loading.value = false;
  }
}

async function saveNotes() {
  if (!props.mediaId || !media.value) return;
  const next = notesDraft.value;
  if (next === (media.value.notes ?? '')) return;
  await window.api.media.update(props.mediaId, { notes: next });
  media.value.notes = next;
}

async function unlinkEntity(linkId: string) {
  await window.api.media.removeLink(linkId);
  emit('link-changed');
  if (props.mediaId) await load();
}

async function linkPerson(person: { id: string }) {
  if (!props.mediaId) return;
  await window.api.media.addLink({
    media_id: props.mediaId,
    entity_type: 'person',
    entity_id: person.id,
  });
  showPersonPicker.value = false;
  emit('link-changed');
  await load();
}

async function linkPlace(place: { id: string }) {
  if (!props.mediaId) return;
  await window.api.media.addLink({
    media_id: props.mediaId,
    entity_type: 'place',
    entity_id: place.id,
  });
  showPlacePicker.value = false;
  emit('link-changed');
  await load();
}

async function deleteRegion(regionId: string) {
  await window.api.mediaRegions.delete(regionId);
  emit('region-deleted');
  if (props.mediaId) await load();
}

async function assignPersonToRegion(regionId: string, personId: string) {
  editingTagId.value = null;
  await window.api.mediaRegions.update(regionId, { person_id: personId });
  // Also ensure the person is linked to this media
  if (props.mediaId && !linkedPersons.value.some(lp => lp.entityId === personId)) {
    await window.api.media.addLink({
      media_id: props.mediaId,
      entity_type: 'person',
      entity_id: personId,
    });
    emit('link-changed');
  }
  emit('region-deleted'); // triggers viewer reload too
  if (props.mediaId) await load();
}

async function setProfileForRegion(r: RegionData) {
  if (!props.mediaId || !r.person_id) return;
  if (regionIsProfile.value[r.id]) return; // already profile
  await setMediaAsPersonProfile(r.person_id, props.mediaId);
  await computeRegionProfileState();
  emit('link-changed');
}

watch(() => props.mediaId, load, { immediate: true });

function expandFaceTags() {
  sections.faceTags = true;
}

defineExpose({ reload: load, expandFaceTags });
</script>

<style scoped>
.media-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-sm);
}

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: var(--font-sm);
  padding: var(--space-xl);
  text-align: center;
}

.panel-loading {
  padding: var(--space-lg);
}

/* Close button */
.panel-close-btn {
  position: absolute;
  top: var(--space-xs);
  right: var(--space-xs);
  z-index: 10;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
}
.panel-close-btn:hover { color: var(--text-primary); background: var(--surface-hover); }

/* Header */
.panel-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-lg) var(--space-lg);
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  position: relative;
}

.media-thumbnail {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.media-placeholder-ext {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  color: var(--text-muted);
}

.media-info {
  flex: 1;
  min-width: 0;
}

.media-title {
  font-size: var(--font-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.media-meta {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: 2px;
}

/* Sections */
.panel-section {
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
  padding: 0 var(--space-md);
}

.panel-section-body {
  padding: var(--space-xs) 0 var(--space-sm);
}

.panel-empty-section {
  padding: var(--space-xs) 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

/* Linked rows */
.linked-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) 0;
  font-size: var(--font-sm);
}

.unlink-btn {
  margin-left: auto;
  flex-shrink: 0;
}

/* Picker */
.picker-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--surface-border-subtle);
  margin-bottom: var(--space-xs);
}

/* Face tag rows */
.face-tag-row {
  transition: background 0.15s;
  padding: var(--space-xs) var(--space-xs);
  border-radius: var(--radius-sm);
  margin: 0 calc(-1 * var(--space-xs));
}
.face-tag-highlighted {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.face-tag-unknown {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--warning-bg);
  color: var(--warning-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-xs);
  font-weight: 600;
  flex-shrink: 0;
}
.face-tag-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.face-tag-clickable {
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 1px 4px;
  margin: -1px -4px;
}
.face-tag-clickable:hover {
  background: var(--surface-hover);
}
.face-tag-assign {
  flex: 1;
  min-width: 0;
}

.star-btn {
  background: none;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0 3px;
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1;
  margin-left: auto;
}
.star-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--surface-border);
}
.star-btn.is-profile {
  color: var(--accent);
  cursor: default;
}
.star-btn:disabled {
  cursor: default;
}

.notes-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  font-size: var(--font-sm);
  color: var(--text-primary);
  background: var(--surface-bg);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs) var(--space-sm);
  resize: vertical;
}
.notes-textarea:focus {
  outline: none;
  border-color: var(--accent);
}
</style>
