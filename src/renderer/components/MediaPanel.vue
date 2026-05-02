<template>
  <EntityPanel
    entity-type="media"
    :entity="media"
    :label="$t('panel.manageMedia')"
    @close="emit('close')"
  >
    <template #empty>{{ $t('media.selectMedia') }}</template>
    <template #header>
      <div class="media-header-row">
        <div class="media-thumbnail">
          <img v-if="thumbnailSrc" :src="thumbnailSrc" :alt="media?.title || ''" class="media-thumb-img" />
          <div v-else class="media-placeholder">
            <span class="media-placeholder-ext">{{ (media?.format || '?').toUpperCase() }}</span>
          </div>
        </div>
        <div class="media-info">
          <div class="media-title-row">
            <span v-if="props.readonly" class="media-title-readonly">{{ titleDraft || $t('media.untitled') }}</span>
            <input
              v-else
              class="media-title-input"
              :value="titleDraft"
              :placeholder="$t('media.untitled')"
              @input="titleDraft = ($event.target as HTMLInputElement).value"
              @blur="saveTitle"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </div>
          <div class="media-meta">
            <span v-if="media?.format" class="media-format">{{ media.format.toUpperCase() }}</span>
            <AppButton variant="soft" size="sm" @click="emit('open-viewer')">{{ $t('panel.view') }}</AppButton>
          </div>
        </div>
      </div>
    </template>

    <template v-if="media">
      <!-- Notes -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.caption')"
          :collapsed="!sections.notes"
          @toggle="toggleSection('notes')"
        />
        <div v-if="sections.notes" class="panel-section-body">
          <template v-if="props.readonly">
            <SectionEmpty v-if="!notesDraft" :message="$t('empty.notes') || ''" />
            <pre v-else class="notes-readonly" :class="{ 'notes-mono': notesMonospaced }">{{ notesDraft }}</pre>
          </template>
          <template v-else>
            <div class="notes-toggle-row">
              <AppButton
                variant="soft"
                size="sm"
                :aria-pressed="notesMonospaced"
                :title="$t('common.monospacedTooltip')"
                @click="toggleNotesMonospaced"
              >
                <span class="mono-toggle-t" :class="{ 'is-mono': !notesMonospaced }">iWi</span>
              </AppButton>
            </div>
            <textarea
              ref="notesRef"
              v-model="notesDraft"
              class="notes-textarea"
              :class="{ 'notes-mono': notesMonospaced }"
              :placeholder="$t('media.notesPlaceholder')"
              rows="3"
              :style="notesStoredHeight ? { height: notesStoredHeight + 'px' } : undefined"
              @blur="persistNotesHeight(); saveNotes()"
              @mouseup="persistNotesHeight"
            ></textarea>
          </template>
        </div>
      </div>

      <!-- Linked Persons -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.linkedPersons')"
          :count="linkedPersons.length"
          :collapsed="!sections.persons"
          :action-label="props.readonly ? undefined : $t('media.linkPerson')"
          @toggle="toggleSection('persons')"
          @action="showPersonPicker = true"
        />
        <div v-if="sections.persons" class="panel-section-body">
          <div v-if="!props.readonly && showPersonPicker" class="picker-wrap">
            <PersonPicker :model-value="null" :relatee-id="linkedPersons[0]?.entityId" :placeholder="$t('addRelated.searchPlaceholder')" @select="linkPerson" />
            <AppButton variant="ghost" size="sm" @click="showPersonPicker = false">{{ $t('common.cancel') }}</AppButton>
          </div>
          <SectionEmpty v-if="linkedPersons.length === 0 && !showPersonPicker" :message="$t('empty.persons')" />
          <div v-for="lp in linkedPersons" :key="lp.linkId" class="linked-row">
            <AppAvatar :person-id="lp.entityId" :given-name="lp.givenName" :surname="lp.surname" :sex="lp.sex" size="sm" />
            <router-link :to="'/persons/' + lp.entityId" class="person-link">{{ lp.label }}</router-link>
            <AppButton v-if="!props.readonly" variant="ghost" size="sm" class="unlink-btn" :aria-label="$t('a11y.unlinkItem', { item: lp.label })" :title="$t('common.unlinkTooltip')" @click="unlinkEntity(lp.linkId)">
              <IconUnlink :size="14" />
            </AppButton>
          </div>
        </div>
      </div>

      <!-- Face Tags -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.faceTags')"
          :count="regions.length"
          :collapsed="!sections.faceTags"
          :action-label="props.readonly ? undefined : (drawMode ? $t('media.viewer.drawDone') : $t('media.viewer.drawTag'))"
          @toggle="toggleSection('faceTags')"
          @action="drawMode ? emit('stop-draw-mode') : emit('start-draw-mode')"
        />
        <div v-if="sections.faceTags" class="panel-section-body">
          <SectionEmpty v-if="regions.length === 0 && !drawMode" :message="$t('empty.faceTags')" />
          <div
            v-for="r in regions"
            :key="r.id"
            class="linked-row face-tag-row"
            :class="{ 'face-tag-highlighted': highlightedRegionId === r.id }"
            @mouseenter="emit('highlight-region', r.id)"
            @mouseleave="emit('highlight-region', null)"
          >
            <template v-if="!props.readonly && editingTagId === r.id">
              <div class="face-tag-assign">
                <PersonPicker :model-value="null" :relatee-id="linkedPersons[0]?.entityId" :placeholder="$t('media.viewer.assignPerson')" @select="(person: { id: string }) => assignPersonToRegion(r.id, person.id)" />
              </div>
            </template>
            <template v-else>
              <AppAvatar v-if="r.person_id" :person-id="r.person_id" :given-name="r.personGivenName || ''" :surname="r.personSurname || ''" :sex="r.personSex || 'U'" size="sm" />
              <div v-else class="face-tag-unknown">?</div>
              <router-link
                v-if="props.readonly && r.person_id"
                :to="'/persons/' + r.person_id"
                class="person-link face-tag-name"
              >{{ r.personName || $t('media.untitled') }}</router-link>
              <span
                v-else-if="props.readonly"
                class="face-tag-name"
              >{{ $t('media.untagged') || '—' }}</span>
              <span
                v-else
                class="face-tag-name face-tag-clickable"
                @click="editingTagId = r.id"
              >{{ r.person_id ? (r.personName || $t('media.untitled')) : $t('media.viewer.assignPerson') }}</span>
              <button
                v-if="!props.readonly && r.person_id"
                class="star-btn"
                :class="{ 'is-profile': regionIsProfile[r.id] }"
                :title="regionIsProfile[r.id] ? $t('media.currentProfile') : $t('media.setAsProfile')"
                :aria-label="regionIsProfile[r.id] ? $t('media.currentProfile') : $t('media.setAsProfile')"
                :disabled="!!regionIsProfile[r.id]"
                @click.stop="setProfileForRegion(r)"
              >{{ regionIsProfile[r.id] ? '★' : '☆' }}</button>
            </template>
            <AppButton v-if="!props.readonly" variant="ghost" size="sm" class="delete-btn" :aria-label="$t('a11y.deleteItem', { item: r.person_id ? (r.personName || $t('media.untitled')) : $t('media.faceTag') })" :title="$t('common.deleteTooltip')" @click="deleteRegion(r.id)">
              <IconTrash :size="14" />
            </AppButton>
          </div>
        </div>
      </div>

      <!-- Linked Places -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.linkedPlaces')"
          :count="linkedPlaces.length"
          :collapsed="!sections.places"
          :action-label="props.readonly ? undefined : $t('media.linkPlace')"
          @toggle="toggleSection('places')"
          @action="showPlacePicker = true"
        />
        <div v-if="sections.places" class="panel-section-body">
          <div v-if="!props.readonly && showPlacePicker" class="picker-wrap">
            <PlacePicker :model-value="null" :placeholder="$t('places.searchPlaceholder')" @select="linkPlace" />
            <AppButton variant="ghost" size="sm" @click="showPlacePicker = false">{{ $t('common.cancel') }}</AppButton>
          </div>
          <SectionEmpty v-if="linkedPlaces.length === 0 && !showPlacePicker" :message="$t('empty.places')" />
          <div v-for="lp in linkedPlaces" :key="lp.linkId" class="linked-row">
            <router-link :to="{ path: '/places', query: { place: lp.entityId } }" class="person-link">{{ lp.label }}</router-link>
            <AppButton v-if="!props.readonly" variant="ghost" size="sm" class="unlink-btn" :aria-label="$t('a11y.unlinkItem', { item: lp.label })" :title="$t('common.unlinkTooltip')" @click="unlinkEntity(lp.linkId)">
              <IconUnlink :size="14" />
            </AppButton>
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
          <SectionEmpty v-if="linkedEvents.length === 0" :message="$t('empty.events')" />
          <div v-for="le in linkedEvents" :key="le.linkId" class="linked-row">
            <span>{{ le.label }}</span>
            <AppButton v-if="!props.readonly" variant="ghost" size="sm" class="unlink-btn" :aria-label="$t('a11y.unlinkItem', { item: le.label })" :title="$t('common.unlinkTooltip')" @click="unlinkEntity(le.linkId)">
              <IconUnlink :size="14" />
            </AppButton>
          </div>
        </div>
      </div>

      <!-- Quality -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('quality.nav')"
          :count="checkCount"
          :collapsed="!sections.quality"
          @toggle="toggleSection('quality')"
        />
        <div v-if="sections.quality" class="panel-section-body">
          <MediaChecksSection ref="checksSectionRef" :media-id="mediaId!" />
        </div>
      </div>
    </template>

    <ConfirmModal
      :visible="delRegion.visible.value"
      :title="$t('media.removeFaceConfirmTitle')"
      :message="$t('media.confirmDeleteRegion')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.delete')"
      @cancel="delRegion.cancel"
      @confirm="delRegion.confirm"
    />

    <ConfirmModal
      :visible="delLink.visible.value"
      :title="$t('media.unlinkConfirmTitle')"
      :message="$t('media.confirmUnlink')"
      tone="danger"
      icon="⚠️"
      :confirm-label="$t('common.remove')"
      @cancel="delLink.cancel"
      @confirm="delLink.confirm"
    />
  </EntityPanel>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import AppAvatar from './ui/AppAvatar.vue';
import AppButton from './ui/AppButton.vue';
import SectionHeader from './ui/SectionHeader.vue';
import SectionEmpty from './ui/SectionEmpty.vue';
import PersonPicker from './PersonPicker.vue';
import ConfirmModal from './ConfirmModal.vue';
import EntityPanel from './EntityPanel.vue';
import { useDeleteConfirm } from '../composables/useDeleteConfirm';
import PlacePicker from './PlacePicker.vue';
import MediaChecksSection from './MediaChecksSection.vue';
import { resolvePersonDisplayName } from '../utils/nameUtils';
import { useTextareaHeight } from '../composables/useTextareaHeight';
import { useMonospacedNotes } from '../composables/useMonospacedNotes';
import { usePanelSections } from '../composables/usePanelSections';
import { setMediaAsPersonProfile, isMediaPersonProfile } from '../utils/mediaProfile';
import { isImageMedia } from '../utils/mediaUtils';
import { useProfilePicStore } from '../stores/profilePic';
import { useEntityData } from '../composables/useEntityData';
import IconUnlink from './ui/IconUnlink.vue';
import IconTrash from './ui/IconTrash.vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

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
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'link-changed': [];
  'close': [];
  'start-draw-mode': [];
  'stop-draw-mode': [];
  'highlight-region': [id: string | null];
  'region-deleted': [];
  'media-updated': [mediaId: string, fields: { title?: string; notes?: string }];
  'open-viewer': [];
}>();

const checksSectionRef = ref<InstanceType<typeof MediaChecksSection> | null>(null);
const checkCount = computed(() => checksSectionRef.value?.count ?? 0);
const showPersonPicker = ref(false);
const showPlacePicker = ref(false);
const editingTagId = ref<string | null>(null);
const titleDraft = ref('');
const notesDraft = ref('');
const { textareaRef: notesRef, storedHeight: notesStoredHeight, persistHeight: persistNotesHeight } = useTextareaHeight('media-panel-notes');
const profilePicStore = useProfilePicStore();
const { monospaced: notesMonospaced, toggle: toggleNotesMonospaced } = useMonospacedNotes('media');

const { sections, toggleSection } = usePanelSections(
  'media-panel-section-',
  { notes: false, persons: true, places: true, events: false, faceTags: false, quality: false },
  { notes: true, persons: true, places: true, events: true, faceTags: true, quality: false },
);

// ── Data (race-safe load) ────────────────────────────────────────────────────

interface MediaPanelData {
  media: MediaData | null;
  thumbnailSrc: string | null;
  linkedPersons: LinkedEntity[];
  linkedPlaces: LinkedEntity[];
  linkedEvents: LinkedEntity[];
  regions: RegionData[];
  regionIsProfile: Record<string, boolean>;
}

const idRef = computed(() => props.mediaId ?? null);
const { data: panelData, reload } = useEntityData<MediaPanelData>(idRef, async (id) => {
  const m = await window.api.media.get(id) as MediaData | null;
  if (!m) return { media: null, thumbnailSrc: null, linkedPersons: [], linkedPlaces: [], linkedEvents: [], regions: [], regionIsProfile: {} };

  let thumbnailSrc: string | null = null;
  if (isImageMedia(m.format, m.file_ref)) {
    thumbnailSrc = await window.api.media.readAsDataUrl(id) as string | null;
  }

  // Load links
  const links = await window.api.media.linksForMedia(id) as Array<{
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

  // Load face tag regions
  const regs = await window.api.mediaRegions.getForMedia(id) as Array<{
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

  const tagged = enrichedRegions.filter(r => r.person_id);
  const profileResults = await Promise.all(
    tagged.map(r => isMediaPersonProfile(r.person_id!, id).then(v => [r.id, v] as const))
  );
  const regionIsProfile = Object.fromEntries(profileResults);

  return { media: m, thumbnailSrc, linkedPersons: persons, linkedPlaces: places, linkedEvents: events, regions: enrichedRegions, regionIsProfile };
});

const media = computed(() => panelData.value?.media ?? null);
const thumbnailSrc = computed(() => panelData.value?.thumbnailSrc ?? null);
const linkedPersons = computed(() => panelData.value?.linkedPersons ?? []);
const linkedPlaces = computed(() => panelData.value?.linkedPlaces ?? []);
const linkedEvents = computed(() => panelData.value?.linkedEvents ?? []);
const regions = computed(() => panelData.value?.regions ?? []);
const regionIsProfile = computed(() => panelData.value?.regionIsProfile ?? {});

// Sync editable drafts + auto-open notes section when media changes
watch(media, (m) => {
  titleDraft.value = m?.title ?? '';
  notesDraft.value = m?.notes ?? '';
  if (m?.notes) sections.notes = true;
}, { immediate: true });

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


async function saveTitle() {
  if (!props.mediaId || !media.value) return;
  const next = titleDraft.value;
  if (next === (media.value.title ?? '')) return;
  await window.api.media.update(props.mediaId, { title: next });
  media.value.title = next;
  emit('media-updated', props.mediaId, { title: next });
}

async function saveNotes() {
  if (!props.mediaId || !media.value) return;
  const next = notesDraft.value;
  if (next === (media.value.notes ?? '')) return;
  await window.api.media.update(props.mediaId, { notes: next });
  media.value.notes = next;
  emit('media-updated', props.mediaId, { notes: next });
}

const delLink = useDeleteConfirm<string>(async (linkId) => {
  const lp = linkedPersons.value.find(x => x.linkId === linkId);
  const personId = lp?.entityId ?? null;
  await window.api.media.removeLink(linkId);
  if (personId) profilePicStore.invalidatePerson(personId);
  emit('link-changed');
  await reload();
});
function unlinkEntity(linkId: string) { delLink.ask(linkId); }

async function linkPerson(person: { id: string }) {
  if (!props.mediaId) return;
  await window.api.media.addLink({
    media_id: props.mediaId,
    entity_type: 'person',
    entity_id: person.id,
  });
  profilePicStore.invalidatePerson(person.id);
  showPersonPicker.value = false;
  emit('link-changed');
  await reload();
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
  await reload();
}

const delRegion = useDeleteConfirm<string>(async (regionId) => {
  const r = regions.value.find(rr => rr.id === regionId);
  const personId = r?.person_id ?? null;
  await window.api.mediaRegions.delete(regionId);
  if (personId) profilePicStore.invalidatePerson(personId);
  emit('region-deleted');
  await reload();
});
function deleteRegion(regionId: string) { delRegion.ask(regionId); }

async function assignPersonToRegion(regionId: string, personId: string) {
  editingTagId.value = null;
  const prevPersonId = regions.value.find(r => r.id === regionId)?.person_id ?? null;
  await window.api.mediaRegions.update(regionId, { person_id: personId });
  profilePicStore.invalidatePerson(personId);
  if (prevPersonId && prevPersonId !== personId) {
    profilePicStore.invalidatePerson(prevPersonId);
  }
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
  await reload();
}

async function setProfileForRegion(r: RegionData) {
  if (!props.mediaId || !r.person_id) return;
  if (regionIsProfile.value[r.id]) return; // already profile
  await setMediaAsPersonProfile(r.person_id, props.mediaId);
  await reload();
  emit('link-changed');
}

function expandFaceTags() {
  sections.faceTags = true;
}

defineExpose({ reload, expandFaceTags });
</script>

<style scoped>
/* Header slot content — rendered in EntityPanel's `<slot name="header">`
   but owned by this template, so MediaPanel's scope hash applies. */
.media-header-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
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

.media-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.media-title-row .media-title-input {
  flex: 1;
  min-width: 0;
}
.media-title-input {
  width: 100%;
  font-size: var(--font-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  margin: -2px -4px;
  outline: none;
}
.media-title-input:hover {
  border-color: var(--surface-border);
  background: var(--surface-hover);
}
.media-title-input:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.media-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin-top: 2px;
}
.media-format {
  flex-shrink: 0;
}

/* Sections */
.panel-section {
  border-bottom: 1px solid var(--surface-border-subtle);
  flex-shrink: 0;
  padding: 0 var(--space-lg);
}

.panel-section-body {
  padding: var(--space-xs) 0 var(--space-sm);
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

.delete-btn {
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
.picker-wrap > :first-child {
  flex: 1;
  min-width: 0;
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
  font-size: var(--font-base);
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

.notes-toggle-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-xs);
}
.notes-textarea.notes-mono {
  font-family: var(--font-mono);
}
.media-title-readonly {
  flex: 1;
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text-primary);
  padding: var(--space-xs) var(--space-sm);
}
.notes-readonly {
  margin: 0;
  padding: var(--space-sm);
  background: var(--surface);
  border-radius: var(--radius-sm);
  white-space: pre-wrap;
  font-family: inherit;
  font-size: var(--font-sm);
  color: var(--text-primary);
}
.notes-readonly.notes-mono {
  font-family: var(--font-mono);
}
.face-tag-name.person-link {
  text-decoration: none;
}
</style>
