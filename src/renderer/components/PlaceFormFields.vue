<!--
  Shared editable form fields for a Place: Type, Parent, Coordinates, and the
  "Resolved via" line. Used by both PlacePanel (side panel) and PlaceModal
  (add/edit dialog) so the gazetteer-aware preview chips stay consistent.

  The chips show what the gazetteer WOULD say if a field is left blank — those
  values are NEVER persisted (Prime Directive). The form passes through only
  what the user actually typed.

  - The Name and Notes fields stay per-surface because their behaviors diverge
    (panel: PlacePicker-as-merge, mono-toggle, height persistence; modal: text
    input, plain textarea).
  - The optional `pick-coords` slot lets the panel inject its 📍 map-pick button.
-->
<template>
  <div class="pff">
    <!-- Type -->
    <div class="pff-field">
      <label class="pff-label">{{ $t('places.type') }}</label>
      <div class="field-resolved-wrap" :class="{ 'has-resolved': !form.place_type && resolvedTypeLabel }">
        <select
          class="pff-control"
          :value="form.place_type ?? ''"
          @change="emit('update:field', 'place_type', ($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">{{ !form.place_type && resolvedTypeLabel ? resolvedTypeLabel : '—' }}</option>
          <option v-for="pt in PLACE_TYPE_VALUES" :key="pt" :value="pt">{{ $t('placeTypes.' + pt) }}</option>
        </select>
        <span v-if="!form.place_type && resolvedTypeLabel" class="resolved-chip-inline resolved-chip-select">
          {{ $t('places.resolvedBadge') }}
        </span>
      </div>
    </div>

    <!-- Parent place -->
    <div class="pff-field">
      <label class="pff-label">{{ $t('places.parentPlace') }}</label>
      <div class="field-resolved-wrap" :class="{ 'has-resolved': !form.parent_place_id && resolvedParentPath }">
        <PlacePicker
          :model-value="form.parent_place_id ?? null"
          :placeholder="!form.parent_place_id && resolvedParentPath ? resolvedParentPath : $t('places.searchPlaceholder')"
          @update:model-value="emit('update:field', 'parent_place_id', $event)"
        />
        <span v-if="!form.parent_place_id && resolvedParentPath" class="resolved-chip-inline resolved-chip-picker">
          {{ $t('places.resolvedBadge') }}
        </span>
      </div>
    </div>

    <!-- Coordinates -->
    <div class="pff-field">
      <label class="pff-label">{{ $t('places.coordinates') }}</label>
      <div class="coord-row">
        <div class="field-resolved-wrap coord-wrap" :class="{ 'has-resolved': form.latitude == null && resolvedMatch }">
          <input
            class="pff-control coord-input"
            type="number"
            step="any"
            :placeholder="form.latitude == null && resolvedMatch ? formatCoord(resolvedMatch.lat) : $t('places.latitude')"
            :aria-label="$t('places.latitude')"
            :value="form.latitude ?? ''"
            @blur="onCoordBlur('latitude', $event)"
          />
          <span v-if="form.latitude == null && resolvedMatch" class="resolved-chip-inline">
            {{ $t('places.resolvedBadge') }}
          </span>
        </div>
        <div class="field-resolved-wrap coord-wrap" :class="{ 'has-resolved': form.longitude == null && resolvedMatch }">
          <input
            class="pff-control coord-input"
            type="number"
            step="any"
            :placeholder="form.longitude == null && resolvedMatch ? formatCoord(resolvedMatch.lon) : $t('places.longitude')"
            :aria-label="$t('places.longitude')"
            :value="form.longitude ?? ''"
            @blur="onCoordBlur('longitude', $event)"
          />
          <span v-if="form.longitude == null && resolvedMatch" class="resolved-chip-inline">
            {{ $t('places.resolvedBadge') }}
          </span>
        </div>
        <slot name="coord-extras" />
      </div>
    </div>

    <!-- Resolved-via line: match quality + source provenance + matched path -->
    <div v-if="resolvedMatch" class="pff-field resolved-field">
      <span class="pff-label">{{ $t('gazetteers.resolvedVia') }}</span>
      <span class="resolved-value">
        <span :class="'resolved-quality match-' + resolvedMatch.matchQuality">
          {{ $t('gazetteers.match.' + resolvedMatch.matchQuality) }}
        </span>
        <code v-if="resolvedSource" class="resolved-gaz">{{ resolvedSource }}</code>
        <span class="resolved-path">{{ resolvedMatch.matchedPath.join(' › ') }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PlacePicker from './PlacePicker.vue';
import { PLACE_TYPE_VALUES } from '../constants/eventTypes';
import type { PlaceResolveResult } from '../../api/place-gazetteers/types';

export interface PlaceFormShape {
  place_type: string | null;
  parent_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

const props = defineProps<{
  form: PlaceFormShape;
  resolvedMatch: PlaceResolveResult | null;
  resolvedTypeLabel: string | null;
  resolvedParentPath: string | null;
}>();

// Source provenance for the resolved-via line. The merge engine collapses
// every source into one synthetic gazetteer (`__merged__`), so the useful
// "where did this come from?" data lives on the matched node's
// `__contributors`. Show the contributor IDs; suppress the synthetic id.
const resolvedSource = computed<string | null>(() => {
  if (!props.resolvedMatch) return null;
  const node = props.resolvedMatch.matchedNode as { __contributors?: string[] };
  const contributors = node.__contributors ?? [];
  if (contributors.length === 0) return null;
  if (contributors.length === 1) return contributors[0];
  return contributors.join(', ');
});

const emit = defineEmits<{
  'update:field': [field: keyof PlaceFormShape, value: unknown];
}>();

function formatCoord(n: number): string {
  return n.toFixed(4);
}

function onCoordBlur(field: 'latitude' | 'longitude', e: FocusEvent) {
  const raw = (e.target as HTMLInputElement).value;
  const value = raw === '' ? null : Number(raw);
  emit('update:field', field, Number.isNaN(value as number) ? null : value);
}
</script>

<style scoped>
.pff {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.pff-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pff-label {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.4px;
}
.pff-control {
  font-size: var(--font-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
}
.pff-control:focus {
  outline: none;
  border-color: var(--accent);
}

/* Coordinates row: lat + long inputs side-by-side, with optional pick slot */
.coord-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: stretch;
}
.coord-wrap {
  flex: 1 1 100px;
  min-width: 100px;
}
.coord-input {
  width: 100%;
}
/* Hide native number-input spinners — they crowd the resolved chip and aren't
   useful for free-form coordinate entry */
.coord-input::-webkit-inner-spin-button,
.coord-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.coord-input { -moz-appearance: textfield; }

/* Inline-in-field resolved fallback: ghost the placeholder text and pin a
   small "Resolved" chip inside the field's right edge. Communicates "if you
   leave this blank, the gazetteer says X" without persisting X. */
.field-resolved-wrap {
  position: relative;
  display: block;
  width: 100%;
}
.field-resolved-wrap.has-resolved .pff-control::placeholder {
  color: var(--text-secondary);
  font-style: italic;
  opacity: 1;
}
.field-resolved-wrap.has-resolved :deep(.place-picker input) {
  padding-right: 92px;
}
.field-resolved-wrap.has-resolved > input.pff-control {
  padding-right: 78px;
}
.field-resolved-wrap.has-resolved > select.pff-control {
  padding-right: 96px;
}
.resolved-chip-inline {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  background: var(--info-bg, var(--surface-hover));
  color: var(--info-text, var(--text-secondary));
  border-radius: var(--radius-full);
  padding: 1px 6px;
  line-height: 1.4;
  pointer-events: none;
  z-index: 1;
}
.resolved-chip-picker { right: 36px; }
.resolved-chip-select { right: 28px; }

.resolved-field {
  margin-top: var(--space-xs);
}
.resolved-value {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-xs);
  padding: var(--space-xs) 0;
  min-width: 0;
}
.resolved-quality, .resolved-gaz { flex-shrink: 0; }
.resolved-quality {
  display: inline-block;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  line-height: 1.4;
}
.resolved-quality.match-exact {
  background: var(--success-bg);
  color: var(--success-text);
}
.resolved-quality.match-partial {
  background: var(--warning-bg);
  color: var(--warning-text);
}
.resolved-quality.match-ambiguous {
  background: var(--error-bg);
  color: var(--error-text);
}
.resolved-gaz {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.95em;
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
  padding: 0 4px;
  color: var(--text-secondary);
}
.resolved-path {
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
</style>
