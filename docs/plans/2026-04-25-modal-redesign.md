# Modal / Form UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented modal/form system with one canonical component per entity type (Person, Event, Source, Citation), rendered as a centered overlay or a right-growing sub-panel, with a keyboard-first citation search flow.

**Architecture:** New components live in `src/renderer/components/modals/`. `BaseSubPanel.vue` handles standalone vs sub-panel layout via a `mode` prop; all entity modals use it as their layout shell. Each entity modal manages its own sub-panels via a `#subpanels` named slot — the sub-panels grow to the right inside a flex row container. Old components (`AddPersonModal`, `EventForm`, `EventFormBody`, `CitationForm`, `CitationEditModal`) are deleted once replaced.

**Tech Stack:** Vue 3 + TypeScript, `window.api.*` IPC bridge. See `docs/IPC_REFERENCE.md` for the complete surface. Visuals: `.superpowers/brainstorm/57914-1777100663/content/full-flow.html` (three-panel chain), `flush-sections-v3.html` (section header style), `citation-flow.html` (citation flow).

---

### Task 1: Entity color constants + shared CSS classes

**Files:**
- Create: `src/renderer/constants/entityColors.ts`
- Modify: `src/renderer/styles/shared.css` (add entity panel layout classes)

- [ ] **Create `src/renderer/constants/entityColors.ts`**

```typescript
export const ENTITY_COLORS = {
  person:       { fg: '#4f46e5', hd: '#f5f3ff', border: '#c7d2fe' },
  event:        { fg: '#c2410c', hd: '#fff3e8', border: '#fed7aa' },
  source:       { fg: '#7e22ce', hd: '#faf5ff', border: '#e9d5ff' },
  citation:     { fg: '#166534', hd: '#f0fdf4', border: '#bbf7d0' },
  place:        { fg: '#166534', hd: '#f0fdf4', border: '#bbf7d0' },
  relationship: { fg: '#166534', hd: '#f0fdf4', border: '#bbf7d0' },
  task:         { fg: '#92400e', hd: '#fffbeb', border: '#fde68a' },
} as const;

export type EntityType = keyof typeof ENTITY_COLORS;
```

- [ ] **Append entity panel layout classes to `src/renderer/styles/shared.css`**

Add at the end of the file:

```css
/* ── Entity panel layout (modal redesign) ── */
.entity-panel-wrap { display: flex; gap: 8px; align-items: flex-start; }

.entity-panel {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 6px 32px rgba(0,0,0,0.18);
  font-size: 12px;
  color: #1a1a1a;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 268px;
}
.entity-panel--dim { opacity: 0.5; pointer-events: none; }

.ep-header {
  padding: 9px 14px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-shrink: 0;
}
.ep-header-left { display: flex; flex-direction: column; gap: 3px; }
.ep-label { font-size: 11px; font-weight: 700; }
.ep-title { font-size: 13px; font-weight: 600; color: #111827; }
.ep-close {
  font-size: 18px; color: #9ca3af; background: none; border: none;
  cursor: pointer; line-height: 1; padding: 0; flex-shrink: 0;
}

.ep-body { flex: 1; overflow-y: auto; }
.ep-fields { padding: 10px 14px 8px; }

.ep-footer {
  display: flex; justify-content: flex-end; gap: 6px;
  padding: 8px 14px; border-top: 1px solid #f3f4f6; flex-shrink: 0;
}

/* Section headers inside entity panels (flush-sections-v3 style) */
.ep-sec-header {
  padding: 7px 14px;
  border-radius: 8px 8px 0 0;
  border-bottom: 1px solid transparent;
  display: flex; align-items: center; justify-content: space-between;
}
.ep-sec-left { display: flex; align-items: center; gap: 8px; }
.ep-sec-title { font-size: 11px; font-weight: 700; }
.ep-sec-count { font-size: 11px; font-weight: 700; opacity: 0.6; }
.ep-sec-open  { font-size: 11px; font-weight: 600; opacity: 0.65; }
.ep-sec-content { padding: 8px 14px 8px; }
.ep-sec-gap { height: 8px; }

/* Entity rows in sections */
.ep-entity-row {
  display: flex; align-items: center;
  padding: 5px 6px; border-radius: 6px; cursor: pointer; margin-bottom: 2px;
}
.ep-entity-row:hover { background: #f9fafb; }
.ep-entity-main { flex: 1; min-width: 0; }
.ep-entity-name { font-size: 12px; font-weight: 600; color: #111827; }
.ep-entity-sub  { font-size: 10px; color: #9ca3af; margin-top: 1px; }
.ep-entity-arrow { color: #cbd5e1; font-size: 14px; flex-shrink: 0; }

/* Search bar in sections */
.ep-search-input {
  width: 100%; border: 1.5px solid #e5e7eb; border-radius: 6px;
  padding: 6px 9px; margin-bottom: 6px; background: #f9fafb;
  font-size: 12px; color: #374151; outline: none;
}
.ep-search-input:focus {
  border-color: #3b82f6; background: #fff;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}

/* Dropdown results */
.ep-dropdown {
  border: 1px solid #e5e7eb; border-radius: 7px;
  background: #fff; box-shadow: 0 4px 14px rgba(0,0,0,0.1);
  overflow: hidden; margin-bottom: 6px;
}
.ep-dd-row {
  padding: 7px 11px; font-size: 12px; color: #374151; cursor: pointer;
  border-bottom: 1px solid #fafafa;
  display: flex; align-items: center; justify-content: space-between;
}
.ep-dd-row:last-child { border-bottom: none; }
.ep-dd-row:hover, .ep-dd-row--hl { background: #eff6ff; color: #1d4ed8; }
.ep-dd-row--create { color: #2563eb; font-weight: 600; border-top: 1px solid #f0f0f0; }
.ep-dd-key {
  font-size: 10px; font-family: monospace; background: #f3f4f6;
  border: 1px solid #e5e7eb; border-radius: 3px; padding: 1px 5px; color: #6b7280;
}

/* Segmented controls */
.ep-seg { display: flex; border: 1.5px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
.ep-seg-opt {
  flex: 1; text-align: center; padding: 5px 0; font-size: 11px;
  color: #9ca3af; background: #f9fafb; border-right: 1px solid #e5e7eb;
  cursor: pointer; border-top: none; border-bottom: none; border-left: none;
}
.ep-seg-opt:last-child { border-right: none; }
.ep-seg-opt--on { font-weight: 700; }

/* Readonly display field */
.ep-field-readonly {
  width: 100%; background: #f9fafb; border: 1.5px solid #e5e7eb;
  border-radius: 6px; padding: 6px 9px; font-size: 12px; color: #6b7280;
}
/* Standard text inputs inside entity panels */
.ep-input {
  width: 100%; background: #f9fafb; border: 1.5px solid #e5e7eb;
  border-radius: 6px; padding: 6px 9px; font-size: 12px; color: #374151;
  outline: none;
}
.ep-input:focus { border-color: #3b82f6; background: #fff; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
.ep-input--name { flex: 1; }
.ep-name-row { display: flex; gap: 6px; }
.ep-field { margin-bottom: 8px; }
.ep-field:last-child { margin-bottom: 0; }
.ep-field-label {
  display: block; font-size: 10px; color: #6b7280; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px;
}
.ep-textarea {
  width: 100%; background: #f9fafb; border: 1.5px solid #e5e7eb;
  border-radius: 6px; padding: 6px 9px; font-size: 12px; color: #374151;
  outline: none; resize: vertical; min-height: 48px;
}
.ep-textarea:focus { border-color: #3b82f6; background: #fff; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
```

- [ ] **Run lint**

```bash
npm run lint
```
Expected: 0 errors.

- [ ] **Commit**

```bash
git add src/renderer/constants/entityColors.ts src/renderer/styles/shared.css
git commit -m "feat: add entity color constants and shared panel CSS"
```

---

### Task 2: BaseSubPanel.vue

**Files:**
- Create: `src/renderer/components/modals/BaseSubPanel.vue`

`BaseSubPanel` is the layout shell used by all entity modals. In `standalone` mode it wraps the panel in `BaseModal` (overlay, Escape key, focus trap). In `subpanel` mode it renders as a plain floating card with a × close button. Both modes expose a `#subpanels` slot for child sub-panels that render to the right.

- [ ] **Create `src/renderer/components/modals/BaseSubPanel.vue`**

```vue
<template>
  <!-- ── STANDALONE: centred overlay via BaseModal ── -->
  <BaseModal
    v-if="mode === 'standalone'"
    :title-id="titleId"
    @close="$emit('cancel')"
  >
    <div class="entity-panel-wrap">
      <div class="entity-panel" :class="{ 'entity-panel--dim': hasSub }">
        <div class="ep-header" :style="headerStyle">
          <div class="ep-header-left">
            <span class="ep-label" :style="{ color: color.fg }">{{ label }}</span>
            <div :id="titleId" class="ep-title">{{ title }}</div>
          </div>
        </div>
        <div class="ep-body">
          <slot />
        </div>
        <div class="ep-footer">
          <button type="button" class="btn-cancel" @click="$emit('cancel')">
            {{ $t('common.cancel') }}
          </button>
          <button
            type="button"
            class="btn-add"
            :style="{ background: color.fg, color: '#fff' }"
            @click="$emit('save')"
          >
            {{ saveLabel ?? $t('common.save') }}
          </button>
        </div>
      </div>
      <slot name="subpanels" />
    </div>
  </BaseModal>

  <!-- ── SUBPANEL: floating card, no overlay ── -->
  <div v-else class="entity-panel-wrap">
    <div class="entity-panel" :class="{ 'entity-panel--dim': hasSub }">
      <div class="ep-header" :style="headerStyle">
        <div class="ep-header-left">
          <span class="ep-label" :style="{ color: color.fg }">{{ label }}</span>
          <div class="ep-title">{{ title }}</div>
        </div>
        <button
          class="ep-close"
          type="button"
          @click="$emit('close')"
          :aria-label="$t('common.close')"
        >×</button>
      </div>
      <div class="ep-body">
        <slot />
      </div>
      <div class="ep-footer">
        <button type="button" class="btn-cancel" @click="$emit('cancel')">
          {{ $t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn-add"
          :style="{ background: color.fg, color: '#fff' }"
          @click="$emit('save')"
        >
          {{ saveLabel ?? $t('common.save') }}
        </button>
      </div>
    </div>
    <slot name="subpanels" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../BaseModal.vue';
import { ENTITY_COLORS, type EntityType } from '../../constants/entityColors';

const { t } = useI18n();

const props = withDefaults(defineProps<{
  entityType: EntityType;
  label: string;
  title: string;
  mode?: 'standalone' | 'subpanel';
  saveLabel?: string;
  hasSub?: boolean;
}>(), {
  mode: 'standalone',
  hasSub: false,
});

defineEmits<{
  cancel: [];
  save: [];
  close: [];
}>();

const color = computed(() => ENTITY_COLORS[props.entityType]);
const titleId = computed(() => `${props.entityType}-panel-title`);
const headerStyle = computed(() => ({
  background: color.value.hd,
  borderBottom: `1px solid ${color.value.border}`,
}));
</script>
```

- [ ] **Run lint**

```bash
npm run lint
```
Expected: 0 errors.

- [ ] **Commit**

```bash
git add src/renderer/components/modals/BaseSubPanel.vue
git commit -m "feat: add BaseSubPanel layout shell for entity modals"
```

---

### Task 3: CitationModal.vue

**Files:**
- Create: `src/renderer/components/modals/CitationModal.vue`

Always opened as a sub-panel (never standalone). Fields: source (readonly), page/location (auto-focused), confidence (segmented), transcription (optional), notes (optional). Saves a `citations` row via `window.api.citations.create`.

- [ ] **Create `src/renderer/components/modals/CitationModal.vue`**

```vue
<template>
  <BaseSubPanel
    entity-type="citation"
    :label="$t('citations.entity')"
    :title="sourceTitle"
    mode="subpanel"
    :save-label="$t('common.save') + ' ↩'"
    @cancel="$emit('cancel')"
    @save="save"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.title') }}</span>
        <div class="ep-field-readonly">{{ sourceTitle }}</div>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('citations.pageLocation') }}</span>
        <input
          ref="pageRef"
          class="ep-input"
          v-model="form.page"
          :placeholder="$t('citations.pagePlaceholder')"
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('citations.confidence') }}</span>
        <div class="ep-seg">
          <button
            v-for="level in CONFIDENCE_LEVEL_VALUES"
            :key="level"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.confidence === level }"
            :style="form.confidence === level ? { background: ENTITY_COLORS.citation.hd, color: ENTITY_COLORS.citation.fg } : {}"
            @click="form.confidence = level"
          >{{ $t('confidenceLevels.' + level) }}</button>
        </div>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('citations.transcription') }}</span>
        <textarea
          class="ep-textarea"
          v-model="form.transcription"
          :placeholder="$t('citations.transcriptionPlaceholder')"
          rows="2"
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('citations.notes') }}</span>
        <input class="ep-input" v-model="form.notes" :placeholder="$t('citations.notesPlaceholder')" />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import { ENTITY_COLORS } from '../../constants/entityColors';
import { CONFIDENCE_LEVEL_VALUES } from '../../constants/eventTypes';
import { useToast } from '../../composables/useToast';
import { useSourceSession } from '../../stores/sourceSession';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  sourceId: string;
  sourceTitle: string;
  eventId?: string;
  personId?: string;
  relationshipId?: string;
  placeId?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [];
}>();

const { t } = useI18n();
const toast = useToast();
const sourceSession = useSourceSession();
const pageRef = ref<HTMLInputElement | null>(null);

const form = reactive({
  page: sourceSession.lastPage ?? '',
  confidence: 0 as 0 | 1 | 2 | 3,
  transcription: '',
  notes: '',
  date_accessed: new Date().toISOString().slice(0, 10),
});

onMounted(() => nextTick(() => pageRef.value?.focus()));

async function save() {
  if (!window.api) return;
  try {
    const data: Record<string, unknown> = {
      source_id: props.sourceId,
      page: form.page,
      confidence: form.confidence,
      transcription: form.transcription,
      notes: form.notes,
      date_accessed: form.date_accessed,
    };
    if (props.eventId)        data.event_id        = props.eventId;
    if (props.personId)       data.person_id       = props.personId;
    if (props.relationshipId) data.relationship_id = props.relationshipId;
    if (props.placeId)        data.place_id        = props.placeId;

    await window.api.citations.create(data);
    sourceSession.setLastUsed(props.sourceId, form.page);
    emit('saved');
  } catch (err) {
    console.error('[CitationModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
</script>
```

- [ ] **Add missing i18n keys** — add to both `src/renderer/i18n/en.ts` and `src/renderer/i18n/sv.ts` under `citations:` if not present:

```
entity: 'Citation',
```

Run: `grep -n "entity:" src/renderer/i18n/en.ts` — if missing from citations block, add it.

- [ ] **Run lint**

```bash
npm run lint
```
Expected: 0 errors.

- [ ] **Commit**

```bash
git add src/renderer/components/modals/CitationModal.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat: add CitationModal sub-panel"
```

---

### Task 4: SourceModal.vue

**Files:**
- Create: `src/renderer/components/modals/SourceModal.vue`

Creates a new source record. Used from EventModal's "Create new source" flow. After save, emits `saved(sourceId, sourceTitle)` so the parent can immediately open CitationModal for the new source.

- [ ] **Create `src/renderer/components/modals/SourceModal.vue`**

```vue
<template>
  <BaseSubPanel
    entity-type="source"
    :label="$t('sources.entity')"
    :title="form.title || $t('sources.newSource')"
    mode="subpanel"
    @cancel="$emit('cancel')"
    @save="save"
    @close="$emit('close')"
  >
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.sourceTitle') }}</span>
        <input
          ref="titleRef"
          class="ep-input"
          v-model="form.title"
          :placeholder="$t('sources.titlePlaceholder')"
          required
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.type') }}</span>
        <select class="ep-input" v-model="form.source_type">
          <option v-for="t in SOURCE_TYPE_VALUES" :key="t" :value="t">
            {{ $t('sourceTypes.' + t) }}
          </option>
        </select>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.author') }}</span>
        <input class="ep-input" v-model="form.author" :placeholder="$t('sources.authorPlaceholder')" />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.publicationInfo') }}</span>
        <input class="ep-input" v-model="form.publication_info" :placeholder="$t('sources.publicationInfoPlaceholder')" />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('sources.url') }}</span>
        <input class="ep-input" v-model="form.url" type="url" :placeholder="$t('sources.urlPlaceholder')" />
      </div>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import { SOURCE_TYPE_VALUES } from '../../constants/eventTypes';
import { useToast } from '../../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface Source { id: string; title: string; }

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [sourceId: string, sourceTitle: string];
}>();

const { t } = useI18n();
const toast = useToast();
const titleRef = ref<HTMLInputElement | null>(null);

const form = reactive({
  title: '',
  source_type: 'church_record',
  author: '',
  publication_info: '',
  url: '',
});

onMounted(() => nextTick(() => titleRef.value?.focus()));

async function save() {
  if (!window.api || !form.title.trim()) return;
  try {
    const source = (await window.api.sources.create({
      title: form.title,
      source_type: form.source_type,
      author: form.author,
      publication_info: form.publication_info,
      url: form.url,
    })) as Source;
    emit('saved', source.id, source.title);
  } catch (err) {
    console.error('[SourceModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
</script>
```

- [ ] **Verify i18n keys exist** — check `en.ts` for `sources.entity`, `sources.newSource`, `sources.titlePlaceholder`, `sources.authorPlaceholder`, `sources.publicationInfoPlaceholder`, `sources.urlPlaceholder`. Add any missing under `sources:`.

- [ ] **Run lint**

```bash
npm run lint
```

- [ ] **Commit**

```bash
git add src/renderer/components/modals/SourceModal.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat: add SourceModal sub-panel"
```

---

### Task 5: EventModal.vue

**Files:**
- Create: `src/renderer/components/modals/EventModal.vue`

Core fields: Type (segmented for common types + dropdown for all), Date (reuse `DateInput`), Place (reuse `PlacePicker`). Sources section: search bar, dropdown, citation flow. Manages sub-panels (CitationModal, SourceModal) internally.

- [ ] **Create `src/renderer/components/modals/EventModal.vue`**

```vue
<template>
  <BaseSubPanel
    entity-type="event"
    :label="$t('events.entity')"
    :title="eventTitle"
    :mode="mode"
    :has-sub="!!subPanel"
    @cancel="handleCancel"
    @save="handleSave"
    @close="$emit('close')"
  >
    <!-- ── Fields ── -->
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('common.type') }}</span>
        <div class="ep-seg">
          <button
            v-for="et in QUICK_EVENT_TYPES"
            :key="et"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.event_type === et }"
            :style="form.event_type === et ? { background: ENTITY_COLORS.event.hd, color: ENTITY_COLORS.event.fg } : {}"
            @click="form.event_type = et"
          >{{ $t('eventTypes.' + et) }}</button>
          <button
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': !QUICK_EVENT_TYPES.includes(form.event_type as any) && form.event_type !== '' }"
            @click="showTypeDropdown = !showTypeDropdown"
          >…</button>
        </div>
        <select
          v-if="showTypeDropdown"
          class="ep-input"
          style="margin-top:4px"
          v-model="form.event_type"
          @change="showTypeDropdown = false"
        >
          <option v-for="et in EVENT_TYPE_VALUES" :key="et" :value="et">
            {{ $t('eventTypes.' + et) }}
          </option>
        </select>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('events.date') }}</span>
        <DateInput
          :date-type="form.date_type"
          :date-value="form.date_value"
          :date-value-end="form.date_value_end"
          :date-original="form.date_original"
          @update:date-type="form.date_type = $event"
          @update:date-value="form.date_value = $event"
          @update:date-value-end="form.date_value_end = $event"
          @update:date-original="form.date_original = $event"
        />
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('places.title') }}</span>
        <PlacePicker v-model="form.place_id" :placeholder="$t('events.placePlaceholder')" />
      </div>
      <div v-if="form.event_type === 'death'" class="ep-field">
        <span class="ep-field-label">{{ $t('events.cause') }}</span>
        <input class="ep-input" v-model="form.cause" :placeholder="$t('events.causePlaceholder')" />
      </div>
    </div>

    <!-- ── Sources section ── -->
    <div
      class="ep-sec-header"
      :style="{ background: ENTITY_COLORS.source.hd, borderBottomColor: ENTITY_COLORS.source.border }"
    >
      <div class="ep-sec-left">
        <span class="ep-sec-title" :style="{ color: ENTITY_COLORS.source.fg }">
          📚 {{ $t('sources.title') }}
        </span>
        <span class="ep-sec-count" :style="{ color: ENTITY_COLORS.source.fg }">
          {{ citations.length }}
        </span>
      </div>
      <span class="ep-sec-open" :style="{ color: ENTITY_COLORS.source.fg }">Open ›</span>
    </div>
    <div class="ep-sec-content">
      <input
        class="ep-search-input"
        v-model="sourceSearch"
        :placeholder="$t('sources.searchOrAdd')"
        @focus="onSearchFocus"
        @blur="onSearchBlur"
        @keydown.down.prevent="highlightedIdx = Math.min(highlightedIdx + 1, searchResults.length)"
        @keydown.up.prevent="highlightedIdx = Math.max(highlightedIdx - 1, 0)"
        @keydown.enter.prevent="selectHighlighted"
        @keydown.esc="closeDropdown"
        @input="runSearch"
      />
      <div v-if="showDropdown" class="ep-dropdown">
        <div
          v-for="(src, i) in searchResults"
          :key="src.id"
          class="ep-dd-row"
          :class="{ 'ep-dd-row--hl': i === highlightedIdx }"
          @click="openCitationFor(src.id, src.title)"
        >
          {{ src.title }}
          <span class="ep-dd-key">↩</span>
        </div>
        <div
          class="ep-dd-row ep-dd-row--create"
          :class="{ 'ep-dd-row--hl': highlightedIdx === searchResults.length }"
          @click="openCreateSource"
        >
          + {{ $t('sources.createNew') }}
          <span class="ep-dd-key">↩</span>
        </div>
      </div>

      <!-- Existing citations list -->
      <div
        v-for="cit in citations"
        :key="cit.id"
        class="ep-entity-row"
      >
        <div class="ep-entity-main">
          <div class="ep-entity-name">{{ cit.sourceTitle }}</div>
          <div v-if="cit.page" class="ep-entity-sub">{{ cit.page }}</div>
        </div>
        <button
          type="button"
          class="btn-sm btn-delete"
          style="flex-shrink:0"
          @click.stop="deleteCitation(cit.id)"
        >✕</button>
      </div>
    </div>

    <!-- ── Sub-panels slot ── -->
    <template #subpanels>
      <CitationModal
        v-if="subPanel === 'citation' && activeSrc"
        :source-id="activeSrc.id"
        :source-title="activeSrc.title"
        :event-id="savedEventId || undefined"
        @cancel="closeSubPanel"
        @close="closeSubPanel"
        @saved="onCitationSaved"
      />
      <SourceModal
        v-if="subPanel === 'source'"
        @cancel="closeSubPanel"
        @close="closeSubPanel"
        @saved="onSourceCreated"
      />
    </template>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import CitationModal from './CitationModal.vue';
import SourceModal from './SourceModal.vue';
import DateInput from '../DateInput.vue';
import PlacePicker from '../PlacePicker.vue';
import { ENTITY_COLORS } from '../../constants/entityColors';
import { EVENT_TYPE_VALUES } from '../../constants/eventTypes';
import { useToast } from '../../composables/useToast';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const QUICK_EVENT_TYPES = ['birth', 'marriage', 'death'] as const;

interface SourceRow { id: string; title: string; }
interface CitationRow { id: string; sourceTitle: string; page: string | null; }
interface EventData {
  id?: string;
  event_type: string;
  date_type: string;
  date_value: string | null;
  date_value_end: string | null;
  date_original: string;
  place_id: string | null;
  cause: string | null;
  description: string;
}

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId?: string;
  relationshipId?: string;
  editingEvent?: EventData | null;
  defaultEventType?: string;
}>(), {
  mode: 'subpanel',
  editingEvent: null,
  defaultEventType: 'birth',
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [event: EventData];
}>();

const { t } = useI18n();
const toast = useToast();

const savedEventId = ref<string | null>(props.editingEvent?.id ?? null);

const form = reactive<EventData>({
  id: props.editingEvent?.id,
  event_type: props.editingEvent?.event_type ?? props.defaultEventType,
  date_type: props.editingEvent?.date_type ?? 'exact',
  date_value: props.editingEvent?.date_value ?? null,
  date_value_end: props.editingEvent?.date_value_end ?? null,
  date_original: props.editingEvent?.date_original ?? '',
  place_id: props.editingEvent?.place_id ?? null,
  cause: props.editingEvent?.cause ?? null,
  description: props.editingEvent?.description ?? '',
});

const eventTitle = computed(() =>
  form.event_type ? t('eventTypes.' + form.event_type) : t('events.newEvent')
);
const showTypeDropdown = ref(false);

// ── Source search ──
const sourceSearch = ref('');
const searchResults = ref<SourceRow[]>([]);
const showDropdown = ref(false);
const highlightedIdx = ref(0);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function runSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    if (!window.api) return;
    try {
      if (sourceSearch.value.trim()) {
        searchResults.value = (await window.api.sources.search(sourceSearch.value)) as SourceRow[];
      } else {
        searchResults.value = (await window.api.sources.list()) as SourceRow[];
      }
      showDropdown.value = true;
      highlightedIdx.value = 0;
    } catch { /* ignore */ }
  }, 150);
}

async function onSearchFocus() {
  if (!window.api) return;
  searchResults.value = (await window.api.sources.list()) as SourceRow[];
  showDropdown.value = true;
  highlightedIdx.value = 0;
}

function onSearchBlur() {
  // Delay so click on dropdown row fires first
  setTimeout(() => { showDropdown.value = false; }, 150);
}

function closeDropdown() {
  showDropdown.value = false;
}

function selectHighlighted() {
  if (!showDropdown.value) return;
  if (highlightedIdx.value < searchResults.value.length) {
    const src = searchResults.value[highlightedIdx.value];
    openCitationFor(src.id, src.title);
  } else {
    openCreateSource();
  }
}

// ── Sub-panel state ──
const subPanel = ref<'citation' | 'source' | null>(null);
const activeSrc = ref<SourceRow | null>(null);

function openCitationFor(sourceId: string, sourceTitle: string) {
  closeDropdown();
  sourceSearch.value = sourceTitle;
  activeSrc.value = { id: sourceId, title: sourceTitle };
  subPanel.value = 'citation';
}

function openCreateSource() {
  closeDropdown();
  subPanel.value = 'source';
}

function closeSubPanel() {
  subPanel.value = null;
  activeSrc.value = null;
  sourceSearch.value = '';
}

// Called when SourceModal saves a new source — opens CitationModal for it
function onSourceCreated(sourceId: string, sourceTitle: string) {
  subPanel.value = null;
  activeSrc.value = { id: sourceId, title: sourceTitle };
  subPanel.value = 'citation';
}

// ── Citations list ──
const citations = ref<CitationRow[]>([]);

async function loadCitations() {
  if (!savedEventId.value || !window.api) return;
  try {
    const raw = (await window.api.citations.forEvent(savedEventId.value)) as Array<{
      id: string; source_id: string; page: string | null;
    }>;
    // Fetch source titles
    const rows: CitationRow[] = [];
    for (const c of raw) {
      const src = (await window.api.sources.get(c.source_id)) as { title: string } | null;
      rows.push({ id: c.id, sourceTitle: src?.title ?? c.source_id, page: c.page });
    }
    citations.value = rows;
  } catch { /* ignore */ }
}

async function onCitationSaved() {
  closeSubPanel();
  await loadCitations();
}

async function deleteCitation(id: string) {
  if (!window.api) return;
  await window.api.citations.delete(id);
  await loadCitations();
}

onMounted(loadCitations);

// ── Save event ──
async function handleSave() {
  if (!window.api) return;
  try {
    let ev: EventData;
    if (savedEventId.value) {
      ev = (await window.api.events.update(savedEventId.value, {
        event_type: form.event_type,
        date_type: form.date_type,
        date_value: form.date_value || null,
        date_value_end: form.date_type === 'between' ? form.date_value_end || null : null,
        date_original: form.date_original,
        place_id: form.place_id,
        cause: form.event_type === 'death' ? form.cause : null,
        description: form.description,
      })) as EventData;
    } else {
      ev = (await window.api.events.create({
        event_type: form.event_type,
        date_type: form.date_type,
        date_value: form.date_value || null,
        date_value_end: form.date_type === 'between' ? form.date_value_end || null : null,
        date_original: form.date_original,
        place_id: form.place_id,
        cause: form.event_type === 'death' ? form.cause : null,
        description: form.description,
        relationship_id: props.relationshipId ?? null,
      })) as EventData;
      savedEventId.value = ev.id!;
      // Link event to person if personId provided
      if (props.personId) {
        await window.api.events.addParticipant({ event_id: ev.id, person_id: props.personId, role: 'primary' });
      }
    }
    emit('saved', ev);
  } catch (err) {
    console.error('[EventModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

function handleCancel() {
  emit('cancel');
}
</script>
```

- [ ] **Verify IPC: `events.addParticipant`** — run `grep "addParticipant\|events:addParticipant" src/main/ipc/events.ts src/preload/index.ts`. If missing, add:
  - In `src/main/ipc/events.ts`: `wrapHandler('events:addParticipant', (...args) => callWorker('events:addParticipant', ...args));`
  - In `src/main/db-worker.ts` handlers: `'events:addParticipant': (data) => api.addEventParticipant(getDb(), data),`
  - In `src/preload/index.ts`: `addParticipant: (...args) => ipcRenderer.invoke('events:addParticipant', ...args),`

- [ ] **Add i18n keys** — check and add to `en.ts` and `sv.ts` if missing:

Under `events:`:
```
entity: 'Event',
newEvent: 'New Event',
placePlaceholder: 'Search or add place…',
causePlaceholder: 'Cause of death…',
```

Under `sources:`:
```
searchOrAdd: 'Search or add source…',
createNew: 'Create new source',
newSource: 'New Source',
entity: 'Source',
titlePlaceholder: 'Source title…',
authorPlaceholder: 'Author…',
publicationInfoPlaceholder: 'Publication info…',
urlPlaceholder: 'URL…',
```

- [ ] **Run lint**

```bash
npm run lint
```

- [ ] **Commit**

```bash
git add src/renderer/components/modals/EventModal.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat: add EventModal with inline citation flow"
```

---

### Task 6: PersonModal.vue

**Files:**
- Create: `src/renderer/components/modals/PersonModal.vue`

Fields: given name + surname (side by side), sex (segmented). Sections: Events (opens EventModal sub-panel), Relationships (read-only list in MVP). Saves via `window.api.persons.create` or `window.api.persons.update`.

- [ ] **Create `src/renderer/components/modals/PersonModal.vue`**

```vue
<template>
  <BaseSubPanel
    entity-type="person"
    :label="$t('persons.entity')"
    :title="displayTitle"
    :mode="mode"
    :has-sub="subPanel !== null"
    @cancel="$emit('cancel')"
    @save="handleSave"
    @close="$emit('close')"
  >
    <!-- ── Fields ── -->
    <div class="ep-fields">
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('persons.name') }}</span>
        <div class="ep-name-row">
          <input
            ref="givenNameRef"
            class="ep-input ep-input--name"
            v-model="form.given_name"
            :placeholder="$t('persons.givenName')"
          />
          <input
            class="ep-input ep-input--name"
            v-model="form.surname"
            :placeholder="$t('persons.surname')"
          />
        </div>
      </div>
      <div class="ep-field">
        <span class="ep-field-label">{{ $t('persons.sex') }}</span>
        <div class="ep-seg">
          <button
            v-for="[val, key] in SEX_OPTIONS"
            :key="val"
            type="button"
            class="ep-seg-opt"
            :class="{ 'ep-seg-opt--on': form.sex === val }"
            :style="form.sex === val ? { background: ENTITY_COLORS.person.hd, color: ENTITY_COLORS.person.fg } : {}"
            @click="form.sex = val"
          >{{ $t(key) }}</button>
        </div>
      </div>
    </div>

    <!-- ── Events section ── -->
    <div
      class="ep-sec-header"
      :style="{ background: ENTITY_COLORS.event.hd, borderBottomColor: ENTITY_COLORS.event.border }"
    >
      <div class="ep-sec-left">
        <span class="ep-sec-title" :style="{ color: ENTITY_COLORS.event.fg }">
          📅 {{ $t('events.title') }}
        </span>
        <span class="ep-sec-count" :style="{ color: ENTITY_COLORS.event.fg }">{{ events.length }}</span>
      </div>
      <span class="ep-sec-open" :style="{ color: ENTITY_COLORS.event.fg }">Open ›</span>
    </div>
    <div class="ep-sec-content">
      <input
        class="ep-search-input"
        :placeholder="$t('events.searchOrAdd')"
        @click="openAddEvent"
        readonly
      />
      <div
        v-for="ev in events"
        :key="ev.id"
        class="ep-entity-row"
        @click="openEditEvent(ev)"
      >
        <div class="ep-entity-main">
          <div class="ep-entity-name">{{ $t('eventTypes.' + ev.event_type) }}</div>
          <div class="ep-entity-sub">
            {{ ev.date_value || '' }}{{ ev.place_name ? ' · ' + ev.place_name : '' }}
          </div>
        </div>
        <span class="ep-entity-arrow">›</span>
      </div>
    </div>

    <div class="ep-sec-gap"></div>

    <!-- ── Relationships section ── -->
    <div
      class="ep-sec-header"
      :style="{ background: ENTITY_COLORS.relationship.hd, borderBottomColor: ENTITY_COLORS.relationship.border }"
    >
      <div class="ep-sec-left">
        <span class="ep-sec-title" :style="{ color: ENTITY_COLORS.relationship.fg }">
          🔗 {{ $t('relationships.title') }}
        </span>
        <span class="ep-sec-count" :style="{ color: ENTITY_COLORS.relationship.fg }">
          {{ relationships.length }}
        </span>
      </div>
      <span class="ep-sec-open" :style="{ color: ENTITY_COLORS.relationship.fg }">Open ›</span>
    </div>
    <div class="ep-sec-content">
      <input class="ep-search-input" :placeholder="$t('relationships.searchOrAdd')" readonly />
      <div
        v-for="rel in relationships"
        :key="rel.id"
        class="ep-entity-row"
      >
        <div class="ep-entity-main">
          <div class="ep-entity-name">{{ rel.label }}</div>
          <div class="ep-entity-sub">{{ rel.sub }}</div>
        </div>
        <span class="ep-entity-arrow">›</span>
      </div>
    </div>
    <div style="height:8px"></div>

    <!-- ── Sub-panels ── -->
    <template #subpanels>
      <EventModal
        v-if="subPanel === 'event'"
        mode="subpanel"
        :person-id="savedPersonId || undefined"
        :editing-event="activeEvent || undefined"
        :default-event-type="defaultEventType"
        @cancel="subPanel = null"
        @close="subPanel = null"
        @saved="onEventSaved"
      />
    </template>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './BaseSubPanel.vue';
import EventModal from './EventModal.vue';
import { ENTITY_COLORS } from '../../constants/entityColors';
import { useToast } from '../../composables/useToast';
import { suggestNextEventType } from '../../utils/eventDefaults';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const SEX_OPTIONS: [string, string][] = [
  ['M', 'persons.male'],
  ['F', 'persons.female'],
  ['U', 'persons.sexUnknown'],
];

interface EventRow {
  id: string; event_type: string;
  date_value: string | null; place_name: string | null;
}
interface RelRow { id: string; label: string; sub: string; }
interface Person { id: string; sex: string; living: boolean; }

const props = withDefaults(defineProps<{
  mode?: 'standalone' | 'subpanel';
  personId?: string | null;
  prefillSurname?: string | null;
}>(), {
  mode: 'standalone',
  personId: null,
  prefillSurname: null,
});

const emit = defineEmits<{
  cancel: [];
  close: [];
  saved: [person: Person];
}>();

const { t } = useI18n();
const toast = useToast();
const givenNameRef = ref<HTMLInputElement | null>(null);

const savedPersonId = ref<string | null>(props.personId);

const form = reactive({
  given_name: '',
  surname: props.prefillSurname ?? '',
  sex: 'U' as 'M' | 'F' | 'U',
});

const displayTitle = computed(() =>
  [form.given_name, form.surname].filter(Boolean).join(' ') || t('persons.newPerson')
);

// ── Data ──
const events = ref<EventRow[]>([]);
const relationships = ref<RelRow[]>([]);

async function loadData() {
  if (!savedPersonId.value || !window.api) return;
  try {
    events.value = (await window.api.events.forPerson(savedPersonId.value)) as EventRow[];
    const rels = (await window.api.relationships.getForPerson(savedPersonId.value)) as Array<{
      id: string; type: string; subtype: string | null;
      person1_given_name?: string; person1_surname?: string;
      person2_given_name?: string; person2_surname?: string;
    }>;
    relationships.value = rels.map(r => ({
      id: r.id,
      label: t('relationshipTypes.' + r.type) + (r.subtype ? ' — ' + t('coupleSubtypes.' + r.subtype) : ''),
      sub: [r.person1_given_name, r.person1_surname, r.person2_given_name, r.person2_surname]
        .filter(Boolean).slice(0, 3).join(' '),
    }));
  } catch { /* ignore */ }
}

// ── Event sub-panel ──
const subPanel = ref<'event' | null>(null);
const activeEvent = ref<EventRow | null>(null);
const defaultEventType = ref('birth');

async function openAddEvent() {
  const existing = events.value.map(e => e.event_type);
  defaultEventType.value = suggestNextEventType(existing, true);
  activeEvent.value = null;
  subPanel.value = 'event';
}

function openEditEvent(ev: EventRow) {
  activeEvent.value = ev;
  subPanel.value = 'event';
}

async function onEventSaved() {
  subPanel.value = null;
  await loadData();
}

// ── Save person ──
async function handleSave() {
  if (!window.api) return;
  try {
    let person: Person;
    if (savedPersonId.value) {
      person = (await window.api.persons.update(savedPersonId.value, {
        sex: form.sex,
      })) as Person;
      if (form.given_name || form.surname) {
        await window.api.persons.addName(savedPersonId.value, {
          given_name: form.given_name,
          surname: form.surname,
          name_type: 'birth',
        });
      }
    } else {
      const result = (await window.api.persons.createWithEvent({
        given_name: form.given_name,
        surname: form.surname,
        sex: form.sex,
        living: true,
      })) as { person: Person };
      person = result.person;
      savedPersonId.value = person.id;
    }
    emit('saved', person);
  } catch (err) {
    console.error('[PersonModal] save failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

onMounted(async () => {
  await loadData();
  nextTick(() => givenNameRef.value?.focus());
});
</script>
```

- [ ] **Add i18n keys** — check and add to `en.ts` and `sv.ts`:

Under `persons:`:
```
entity: 'Person',
newPerson: 'New Person',
name: 'Name',
```

Under `events:`:
```
searchOrAdd: 'Search or add event…',
```

Under `relationships:`:
```
searchOrAdd: 'Search or add relationship…',
```

- [ ] **Run lint**

```bash
npm run lint
```

- [ ] **Commit**

```bash
git add src/renderer/components/modals/PersonModal.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat: add PersonModal with Events and Relationships sections"
```

---

### Task 7: Replace AddPersonModal with PersonModal in PersonsView

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`

- [ ] **In `PersonsView.vue`, swap import and usage**

Replace:
```typescript
import AddPersonModal from '../components/AddPersonModal.vue';
```
With:
```typescript
import PersonModal from '../components/modals/PersonModal.vue';
```

Replace in template:
```html
<AddPersonModal v-if="showAddForm" @close="showAddForm = false" @saved="onPersonAdded" />
```
With:
```html
<PersonModal v-if="showAddForm" mode="standalone" @cancel="showAddForm = false" @saved="onPersonAdded" />
```

- [ ] **Start the app and verify**

```bash
curl -s http://127.0.0.1:19241/status
```
If the dev server isn't running: `npm start` in a separate terminal.

Open the Persons view, click "+ Person", verify the new modal appears (indigo header, name fields side by side, sex segmented control, Events and Relationships sections). Create a person, confirm it appears in the list.

- [ ] **Run lint and tests**

```bash
npm run lint && npm test
```
Expected: 0 lint errors, all tests pass.

- [ ] **Commit**

```bash
git add src/renderer/views/PersonsView.vue
git commit -m "feat: replace AddPersonModal with PersonModal in PersonsView"
```

---

### Task 8: Replace EventForm with EventModal in EventList

**Files:**
- Modify: `src/renderer/components/EventList.vue`

EventList currently embeds `EventForm` as an inline modal for add/edit. Replace it with `EventModal`. The `CitationForm` "Cite" button is handled in the next task.

- [ ] **Update `src/renderer/components/EventList.vue`**

Replace the import:
```typescript
import EventForm from './EventForm.vue';
```
With:
```typescript
import EventModal from './modals/EventModal.vue';
```

In the template, replace:
```html
<EventForm
  v-if="showForm"
  :person-id="personId"
  :relationship-id="relationshipId"
  :editing-event="editingEvent"
  :default-event-type="defaultEventType"
  @close="closeForm"
  @saved="onSaved"
/>
```
With:
```html
<EventModal
  v-if="showForm"
  mode="standalone"
  :person-id="personId"
  :relationship-id="relationshipId"
  :editing-event="editingEvent || undefined"
  :default-event-type="defaultEventType"
  @cancel="closeForm"
  @close="closeForm"
  @saved="onSaved"
/>
```

The `@saved` handler receives the event object — `onSaved` currently calls `load()`. Keep existing `onSaved` logic; just ensure it still calls `load()` after the event is saved.

- [ ] **Start the app and verify**

Open a person's detail view. Edit an existing event — the new EventModal should appear with orange header, type segmented control, date, place, and Sources section. Add a new event. Confirm both flows work.

- [ ] **Run lint and tests**

```bash
npm run lint && npm test
```

- [ ] **Commit**

```bash
git add src/renderer/components/EventList.vue
git commit -m "feat: replace EventForm with EventModal in EventList"
```

---

### Task 9: Replace CitationForm "Cite" button with CitationModal in EventList

**Files:**
- Modify: `src/renderer/components/EventList.vue`

The "Cite" button currently opens `CitationForm` (a full modal with source picker). Replace it with `CitationModal` sub-panel. The user first picks a source via `SourcePicker` or inline search; for this task, use a simpler approach: the "Cite" button opens a one-step modal that still uses the existing `CitationForm` — the new search-bar citation flow lives inside `EventModal`'s Sources section (already built). So this task just removes the orphaned `CitationForm` from EventList since EventModal now handles citations inline.

- [ ] **Remove CitationForm from `EventList.vue`**

Remove the import:
```typescript
import CitationForm from './CitationForm.vue';
```

Remove from template:
```html
<CitationForm
  v-if="citingEventId"
  :event-id="citingEventId"
  @close="citingEventId = null"
  @saved="onCitationSaved"
/>
```

Remove the state variable:
```typescript
const citingEventId = ref<string | null>(null);
```

Remove the methods `openCiteModal` and `onCitationSaved`. Remove the "Cite" column from the table (the `<td>` with `btn-cite` and `cite-badge`), and the `<th>` `{{ $t('events.citeSources') }}`.

> **Note:** Citations are now added directly via the Sources section inside EventModal. Users open the event (click the row) and add citations from there.

- [ ] **Start the app and verify**

Open a person's events list. Confirm the "Cite" column is gone. Open an event by clicking its row. In the Sources section of EventModal, type a source name, select from dropdown — CitationModal should open with cursor on Page field. Save the citation and verify it appears in the sources list.

- [ ] **Run lint and tests**

```bash
npm run lint && npm test
```

- [ ] **Commit**

```bash
git add src/renderer/components/EventList.vue
git commit -m "feat: remove CitationForm from EventList; citations now via EventModal"
```

---

### Task 10: Replace CitationForm + CitationEditModal in SourceDetailView

**Files:**
- Modify: `src/renderer/views/SourceDetailView.vue`

SourceDetailView uses `CitationForm` (to add a citation linked to this source) and `CitationEditModal` (to edit an existing citation). Replace both with `CitationModal`.

- [ ] **Read the relevant section of SourceDetailView**

```bash
grep -n "CitationForm\|CitationEditModal\|showCitationForm\|editingCitation" \
  src/renderer/views/SourceDetailView.vue | head -30
```

- [ ] **Update imports in `SourceDetailView.vue`**

Replace:
```typescript
import CitationForm from '../components/CitationForm.vue';
import CitationEditModal from '../components/CitationEditModal.vue';
```
With:
```typescript
import CitationModal from '../components/modals/CitationModal.vue';
```

- [ ] **Replace CitationForm usage** — the "Add Citation" button flow

The existing `CitationForm` opened with a source pre-filled. In the new design, CitationModal requires `sourceId` and `sourceTitle`. Replace:
```html
<CitationForm
  v-if="showCitationForm"
  :source-id="source.id"
  @close="showCitationForm = false"
  @saved="onCitationSaved"
/>
```
With:
```html
<CitationModal
  v-if="showCitationForm"
  :source-id="source.id"
  :source-title="source.title"
  @close="showCitationForm = false"
  @cancel="showCitationForm = false"
  @saved="onCitationSaved"
/>
```

Wrap the `<CitationModal>` in a `<BaseModal @close="showCitationForm = false" title-id="citation-modal-title">` since CitationModal is always a sub-panel and doesn't have its own overlay:

```html
<BaseModal v-if="showCitationForm" @close="showCitationForm = false" title-id="citation-modal-title">
  <CitationModal
    :source-id="source.id"
    :source-title="source.title"
    @close="showCitationForm = false"
    @cancel="showCitationForm = false"
    @saved="onCitationSaved"
  />
</BaseModal>
```

Add `import BaseModal from '../components/BaseModal.vue';` if not already present.

- [ ] **Replace CitationEditModal usage**

`CitationEditModal` edited page/confidence/transcription/notes. CitationModal doesn't support edit mode in this iteration. For now, leave `CitationEditModal` in place for the edit flow in `SourceDetailView` — it's a narrow use case. Add a TODO comment:

```typescript
// TODO(modal-redesign): replace CitationEditModal with CitationModal edit mode
```

Remove only the `CitationForm` import and usage.

- [ ] **Start the app and verify**

Go to Sources → click a source → click "Add Citation". The CitationModal should appear inside a BaseModal overlay, with the source pre-filled, cursor on Page. Save and confirm the citation appears in the list.

- [ ] **Run lint and tests**

```bash
npm run lint && npm test
```

- [ ] **Commit**

```bash
git add src/renderer/views/SourceDetailView.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "feat: replace CitationForm with CitationModal in SourceDetailView"
```

---

### Task 11: Final cleanup and verify

**Files:**
- Delete: `src/renderer/components/AddPersonModal.vue` (replaced by PersonModal)
- Delete: `src/renderer/components/EventFormBody.vue` (body was part of EventForm, now absorbed into EventModal)
- Keep: `src/renderer/components/EventForm.vue` (still used in PersonTimeline and PlacePanel — leave for follow-on)
- Keep: `src/renderer/components/CitationForm.vue` (still used in CitationEditModal path — leave for follow-on)

- [ ] **Check all remaining references to AddPersonModal and EventFormBody**

```bash
grep -r "AddPersonModal\|EventFormBody" src/renderer --include="*.vue" --include="*.ts" -l
```

Expected: only `AddPersonModal.vue` and `EventFormBody.vue` themselves (not imported anywhere else after Task 7).

- [ ] **Delete the orphaned files**

```bash
rm src/renderer/components/AddPersonModal.vue
rm src/renderer/components/EventFormBody.vue
```

- [ ] **Run full test suite**

```bash
npm run lint && npm test
```
Expected: 0 errors, all tests pass.

- [ ] **Smoke test the app**

Verify these flows work end-to-end:
1. Add a person from PersonsView → EventModal and Relationships sections visible
2. Add an event from EventModal → EventModal opens in standalone mode
3. Add a source citation from EventModal → type in Sources search → CitationModal opens → save → citation appears
4. Create a new source from EventModal → SourceModal opens → save → CitationModal auto-opens for new source → save
5. Edit an existing event → EventModal pre-fills values

- [ ] **Commit**

```bash
git add -A
git commit -m "feat(v0.142.0): modal redesign — PersonModal, EventModal, CitationModal, SourceModal"
```

Version bump: this is a feature (multiple new components, old ones replaced) → minor bump. Update `package.json` version to next minor and add entry in `CHANGELOG.md` under `## Unreleased`:

```
- feat: modal redesign — PersonModal, EventModal, CitationModal, SourceModal replace AddPersonModal, EventForm, CitationForm for keyboard-first entity entry
```
