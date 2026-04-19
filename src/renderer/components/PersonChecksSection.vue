<template>
  <div>
    <div v-if="issues.length === 0" class="empty-hint">{{ $t('empty.qualityIssues') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th class="th-shrink">{{ $t('quality.colSeverity') }}</th>
          <th>{{ $t('quality.colIssue') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(r, i) in issues"
          :key="r.code + ':' + i"
          :class="[{ 'row-ignored': isIgnored(r) }, fixAction(r.code) && !isIgnored(r) ? 'clickable-row' : '']"
          :role="fixAction(r.code) && !isIgnored(r) ? 'button' : undefined"
          :tabindex="fixAction(r.code) && !isIgnored(r) ? 0 : undefined"
          @click="onRowClick(r)"
          @keydown.enter="onRowClick(r)"
          @keydown.space.prevent="onRowClick(r)"
        >
          <td class="td-shrink">
            <span :class="['severity-badge', 'badge-' + r.severity]">
              {{ $t('quality.severity.' + r.severity) }}
            </span>
          </td>
          <td :class="{ 'ignored-text': isIgnored(r) }">{{ checkMessage(r) }}</td>
          <td class="actions-cell">
            <button
              class="btn-sm btn-delete"
              :title="isIgnored(r) ? $t('quality.unignore') : $t('quality.ignore')"
              @click.stop="toggleIgnore(r)"
            >✕</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

export interface CheckResult {
  code: string;
  severity: 'error' | 'warning' | 'notice';
  message: string;
  messageParams?: Record<string, string | number>;
  personIds: string[];
}

export type FixAction =
  | 'add-birth-event'
  | 'add-death-event'
  | 'add-name'
  | 'add-father'
  | 'add-mother'
  | 'toggle-living'
  | 'add-event';

const FIX_ACTIONS: Record<string, FixAction> = {
  NO_BIRTH_EVENT: 'add-birth-event',
  UNSOURCED_BIRTH: 'add-birth-event',
  NO_PARENTS: 'add-father',
  NO_NAME: 'add-name',
  NOT_LIVING_WITHOUT_DEATH: 'add-death-event',
  UNSOURCED_DEATH: 'add-death-event',
  LIVING_WITH_DEATH_EVENT: 'toggle-living',
  DEATH_WITHOUT_BIRTH: 'add-birth-event',
  UNRELATED_PERSON: 'add-father',
};

const { t } = useI18n();
const props = defineProps<{ personId: string }>();
const emit = defineEmits<{
  fix: [action: FixAction];
}>();

const issues = ref<CheckResult[]>([]);

const STORAGE_KEY = 'quality:ignored';
const ignoredKeys = ref<Set<string>>(
  new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[])
);

function ignoreKey(r: CheckResult): string {
  return `${r.code}:${[...r.personIds].sort().join(',')}`;
}

function isIgnored(r: CheckResult): boolean {
  return ignoredKeys.value.has(ignoreKey(r));
}

function toggleIgnore(r: CheckResult) {
  const key = ignoreKey(r);
  if (ignoredKeys.value.has(key)) {
    ignoredKeys.value.delete(key);
  } else {
    ignoredKeys.value.add(key);
  }
  ignoredKeys.value = new Set(ignoredKeys.value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ignoredKeys.value]));
}

function checkMessage(r: CheckResult): string {
  const key = 'quality.checks.' + r.code;
  const translated = t(key, r.messageParams ?? {});
  return translated !== key ? translated : r.message;
}

function fixAction(code: string): FixAction | null {
  return FIX_ACTIONS[code] ?? null;
}

function onRowClick(r: CheckResult) {
  const action = fixAction(r.code);
  if (action && !isIgnored(r)) emit('fix', action);
}

async function load() {
  if (!window.api?.checks) return;
  issues.value = (await window.api.checks.forPerson(props.personId)) as CheckResult[];
}

defineExpose({ reload: load, count: computed(() => issues.value.length) });

watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.th-shrink, .td-shrink { width: 1%; white-space: nowrap; }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; vertical-align: middle; }
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
.btn-fix { background: #dbeafe; color: #1e40af; }
</style>
