<template>
  <div class="quality-table-wrapper">
    <SectionEmpty v-if="issues.length === 0" :message="$t('empty.qualityIssues')" />
    <table v-else class="data-table table-resizable">
      <thead>
        <tr>
          <th :style="{ width: widths.severity + 'px' }">
            {{ $t('quality.colSeverity') }}
            <span class="col-resize-handle" @mousedown.prevent="startResize($event, 'severity')" />
          </th>
          <th v-if="showEntity" :style="{ width: widths.entity + 'px' }" class="entity-col">
            {{ $t('quality.colEntity') }}
            <span class="col-resize-handle" @mousedown.prevent="startResize($event, 'entity')" />
          </th>
          <th :style="{ width: widths.issue + 'px' }">
            {{ $t('quality.colIssue') }}
            <span class="col-resize-handle" @mousedown.prevent="startResize($event, 'issue')" />
          </th>
          <th v-if="!props.readonly" :style="{ width: widths.actions + 'px' }" class="actions-cell">
            {{ $t('common.actions') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(r, i) in issues"
          :key="r.code + ':' + i"
          :class="[{ 'row-ignored': isIgnored(r) }, clickable(r) ? 'clickable-row' : '']"
          :role="clickable(r) ? 'button' : undefined"
          :tabindex="clickable(r) ? 0 : undefined"
          @click="onRowClick(r)"
          @keydown.enter="onRowClick(r)"
          @keydown.space.prevent="onRowClick(r)"
        >
          <td class="td-shrink">
            <span :class="['severity-badge', 'badge-' + r.severity]">
              {{ $t('quality.severity.' + r.severity) }}
            </span>
          </td>
          <td v-if="showEntity" :class="['entity-col', { 'ignored-text': isIgnored(r) }]">
            <span v-if="entityType(r)" class="entity-type-badge" :data-entity="entityType(r)">
              {{ $t('quality.entityType.' + entityType(r)) }}
            </span>
            <template v-if="isDuplicateCode(r.code)">
              <router-link
                v-for="(id, idx) in primaryIds(r)"
                :key="id"
                class="entity-name entity-link"
                :to="entityRoute(r, id)"
                @click.stop
              >{{ primaryLabel(r, idx) }}</router-link>
            </template>
            <span v-else class="entity-name">{{ entityLabel(r) }}</span>
          </td>
          <td class="message-cell" :class="{ 'ignored-text': isIgnored(r) }" :title="checkMessage(r)">{{ checkMessage(r) }}</td>
          <td v-if="!props.readonly" class="actions-cell">
            <button
              class="btn-sm btn-delete"
              :title="isIgnored(r) ? $t('quality.unignore') : $t('quality.ignore')"
              :aria-label="isIgnored(r) ? $t('quality.unignore') : $t('quality.ignore')"
              @click.stop="toggleIgnore(r)"
            >✕</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { isIgnored, toggleIgnore, type IgnorableIssue } from '../utils/qualityIgnore';
import SectionEmpty from './ui/SectionEmpty.vue';
import { useResizableColumns } from '../composables/useResizableColumns';

const { widths, startResize } = useResizableColumns({
  tableId: 'quality-issues',
  columns: [
    { key: 'severity', defaultWidth: 90,  minWidth: 60 },
    { key: 'entity',   defaultWidth: 320, minWidth: 100 },
    { key: 'issue',    defaultWidth: 480, minWidth: 120 },
    { key: 'actions',  defaultWidth: 70,  minWidth: 50, maxWidth: 120 },
  ],
});

export interface QualityIssue extends IgnorableIssue {
  severity: 'error' | 'warning' | 'notice';
  message: string;
  messageParams?: Record<string, string | number>;
  personNames?: string[];
  placeNames?: string[];
  mediaTitles?: string[];
  sourceTitles?: string[];
}

const props = defineProps<{
  issues: QualityIssue[];
  clickableWhen?: (issue: QualityIssue) => boolean;
  showEntity?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  rowClick: [issue: QualityIssue];
}>();

const { t } = useI18n();

function clickable(r: QualityIssue): boolean {
  if (isIgnored(r)) return false;
  return props.clickableWhen ? props.clickableWhen(r) : true;
}

function checkMessage(r: QualityIssue): string {
  const key = 'quality.checks.' + r.code;
  const params = { ...r.messageParams };
  if (params.eventType) {
    const etKey = 'eventTypes.' + params.eventType;
    const etTranslated = t(etKey);
    params.eventType = etTranslated !== etKey ? etTranslated : params.eventType as string;
  }
  const translated = t(key, params);
  return translated !== key ? translated : r.message;
}

function onRowClick(r: QualityIssue) {
  if (clickable(r)) emit('rowClick', r);
}

function entityType(r: QualityIssue): 'place' | 'media' | 'source' | 'person' | null {
  if ((r.placeIds?.length ?? 0) > 0) return 'place';
  if ((r.mediaIds?.length ?? 0) > 0) return 'media';
  if ((r.sourceIds?.length ?? 0) > 0) return 'source';
  if (r.personIds.length > 0) return 'person';
  return null;
}

function entityLabel(r: QualityIssue): string {
  // Pick the primary entity for this issue: place/media/source checks are
  // primarily about that entity, not persons incidentally linked to it.
  const placeNames = (r.placeNames ?? []).filter(Boolean);
  const mediaTitles = (r.mediaTitles ?? []).filter(Boolean);
  const sourceTitles = (r.sourceTitles ?? []).filter(Boolean);
  const personNames = (r.personNames ?? []).filter(Boolean);
  const names =
    placeNames.length > 0 ? placeNames :
    mediaTitles.length > 0 ? mediaTitles :
    sourceTitles.length > 0 ? sourceTitles :
    personNames;
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

function isDuplicateCode(code: string): boolean {
  return code === 'POSSIBLE_DUPLICATE_PERSON' || code.startsWith('DUPLICATE_');
}

function primaryIds(r: QualityIssue): string[] {
  const t = entityType(r);
  if (t === 'place') return r.placeIds ?? [];
  if (t === 'media') return r.mediaIds ?? [];
  if (t === 'source') return r.sourceIds ?? [];
  if (t === 'person') return r.personIds ?? [];
  return [];
}

function primaryLabel(r: QualityIssue, idx: number): string {
  const t = entityType(r);
  const arr =
    t === 'place' ? r.placeNames :
    t === 'media' ? r.mediaTitles :
    t === 'source' ? r.sourceTitles :
    r.personNames;
  const name = arr?.[idx];
  return name && name.trim() !== '' ? name : `#${idx + 1}`;
}

function entityRoute(r: QualityIssue, id: string): { path: string; query?: Record<string, string> } {
  const t = entityType(r);
  if (t === 'place') return { path: '/places/' + id };
  if (t === 'media') return { path: '/media', query: { open: id } };
  if (t === 'source') return { path: '/sources/' + id };
  return { path: '/persons/' + id };
}
</script>

<style scoped>
/* Wrapper around the resizable table — allows horizontal scrolling when
   the user drags any column wider than the viewport. Without this, the
   table-resizable rule in shared.css makes the table grow to its column
   widths but the parent clips, hiding the right-most columns. */
.quality-table-wrapper {
  overflow-x: auto;
  width: 100%;
}
.th-shrink, .td-shrink { width: 1%; max-width: none; white-space: nowrap; }
.actions-cell { width: 1px; max-width: none; text-align: right; white-space: nowrap; vertical-align: middle; }
.message-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}
.severity-badge {
  font-size: var(--font-xs);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 8px;
  text-transform: uppercase;
  white-space: nowrap;
}
.badge-error   { background: #feb2b2; color: #742a2a; }
.badge-warning { background: #fef3c7; color: #78350f; }
.badge-notice  { background: #bfdbfe; color: #1e3a8a; }
.row-ignored { opacity: 0.5; }
.ignored-text { color: #9ca3af; }
.entity-col { font-size: var(--font-sm); max-width: 26ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entity-name { margin-left: var(--space-xs); }
.entity-link { color: var(--accent); text-decoration: underline; }
.entity-link + .entity-link { margin-left: var(--space-sm); }
.entity-type-badge {
  display: inline-block;
  font-size: var(--font-xs);
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  vertical-align: middle;
  background: var(--entity-bg);
  color: var(--entity-text);
  border: 1px solid var(--entity-border);
}
</style>
