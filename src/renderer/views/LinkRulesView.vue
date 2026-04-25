<template>
  <div>
    <div class="header">
      <h2>{{ $t('linkRules.title') }}</h2>
      <div class="header-actions">
        <AppButton variant="soft" @click="showAddModal = true">+ {{ $t('linkRules.addRule') }}</AppButton>
      </div>
    </div>

    <!-- Locale toggles -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('linkRules.defaultRuleSets') }}</h4>
      </div>
      <div class="locale-toggles">
        <label class="locale-toggle">
          <input
            type="checkbox"
            :checked="config.enabledLocales.includes('sv')"
            @change="toggleLocale('sv', ($event.target as HTMLInputElement).checked)"
          />
          {{ $t('linkRules.swedish') }}
        </label>
        <label class="locale-toggle">
          <input
            type="checkbox"
            :checked="config.enabledLocales.includes('en')"
            @change="toggleLocale('en', ($event.target as HTMLInputElement).checked)"
          />
          {{ $t('linkRules.english') }}
        </label>
        <label class="locale-toggle">
          <input
            type="checkbox"
            :checked="config.enabledLocales.includes('de')"
            @change="toggleLocale('de', ($event.target as HTMLInputElement).checked)"
          />
          {{ $t('linkRules.german') }}
        </label>
        <label class="locale-toggle">
          <input
            type="checkbox"
            :checked="config.enabledLocales.includes('da')"
            @change="toggleLocale('da', ($event.target as HTMLInputElement).checked)"
          />
          {{ $t('linkRules.danish') }}
        </label>
        <label class="locale-toggle">
          <input
            type="checkbox"
            :checked="config.enabledLocales.includes('no')"
            @change="toggleLocale('no', ($event.target as HTMLInputElement).checked)"
          />
          {{ $t('linkRules.norwegian') }}
        </label>
      </div>
    </div>

    <!-- Active rules table -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('linkRules.activeRules') }}</h4>
      </div>
      <table v-if="resolvedRules.length > 0" class="data-table">
        <thead>
          <tr>
            <th>{{ $t('linkRules.name') }}</th>
            <th>{{ $t('linkRules.example') }}</th>
            <th>{{ $t('linkRules.pattern') }}</th>
            <th>{{ $t('linkRules.priority') }}</th>
            <th>{{ $t('linkRules.enabled') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rule in resolvedRules" :key="rule.id" :class="{ 'clickable-row': !isCustomRule(rule.id) }" @click="!isCustomRule(rule.id) && viewRule(rule)">
            <td>{{ rule.name }}</td>
            <td><span v-if="rule.example" class="example-cell">{{ rule.example }}</span><span v-else class="muted">—</span></td>
            <td><span class="pattern-cell">{{ truncate(rule.pattern, 40) }}</span></td>
            <td>{{ rule.priority }}</td>
            <td>
              <input
                type="checkbox"
                :checked="rule.enabled"
                @click.stop
                @change="toggleRule(rule.id, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td>
              <button
                v-if="isCustomRule(rule.id)"
                class="btn-delete btn-sm"
                @click.stop="deleteRule(rule.id)"
              >{{ $t('common.delete') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <SectionEmpty v-else :message="$t('empty.linkRules')" />
    </div>

    <!-- Test field -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('linkRules.testField') }}</h4>
      </div>
      <textarea
        ref="testRef"
        v-model="testText"
        class="test-textarea"
        :placeholder="$t('linkRules.testPlaceholder')"
        rows="4"
        :style="testStoredHeight ? { height: testStoredHeight + 'px' } : undefined"
        @mouseup="persistTestHeight"
      ></textarea>
      <div v-if="testText" class="test-results">
        <span v-for="(seg, i) in testSegments" :key="i" class="test-segment">
          <a v-if="seg.url" :href="seg.url" target="_blank" rel="noopener" class="test-link">{{ seg.text }}<span class="rule-badge">{{ seg.ruleName }}</span></a>
          <span v-else>{{ seg.text }}</span>
        </span>
      </div>
    </div>

    <LinkRuleModal
      v-if="showAddModal"
      mode="add"
      @cancel="showAddModal = false"
      @close="showAddModal = false"
      @saved="onRuleSaved"
    />
    <LinkRuleModal
      v-if="viewingRule"
      mode="view"
      :editing-rule="viewingRule"
      @cancel="viewingRule = null"
      @close="viewingRule = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppButton from '../components/ui/AppButton.vue';
import SectionEmpty from '../components/ui/SectionEmpty.vue';
import LinkRuleModal from '../components/modals/LinkRuleModal.vue';
import { useTextareaHeight } from '../composables/useTextareaHeight';
import { linkify, resolveRules, type LinkRule, type LinkRuleOverrides } from '../../api/source-linker';

const { textareaRef: testRef, storedHeight: testStoredHeight, persistHeight: persistTestHeight } = useTextareaHeight('link-rules-test');
import { svRules } from '../../api/link-rules/sv';
import { enRules } from '../../api/link-rules/en';
import { deRules } from '../../api/link-rules/de';
import { daRules } from '../../api/link-rules/da';
import { noRules } from '../../api/link-rules/no';
import { universalRules } from '../../api/link-rules/universal';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const allDefaults: LinkRule[] = [...universalRules, ...svRules, ...enRules, ...deRules, ...daRules, ...noRules];
const defaultIds = new Set(allDefaults.map((r) => r.id));

const config = ref<LinkRuleOverrides>({ enabledLocales: ['sv'], overrides: {} });

const resolvedRules = computed(() => resolveRules(allDefaults, config.value));

const testText = ref('');
const testSegments = computed(() => linkify(testText.value, resolvedRules.value));

const viewingRule = ref<LinkRule | null>(null);
const showAddModal = ref(false);

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '\u2026' : str;
}

function viewRule(rule: LinkRule) {
  viewingRule.value = rule;
}

function isCustomRule(id: string): boolean {
  return !defaultIds.has(id);
}

async function saveConfig() {
  await window.api.db.setSetting('link_rules_config', JSON.stringify(config.value));
}

async function loadConfig() {
  const raw = await window.api.db.getSetting('link_rules_config') as string | null;
  if (raw) {
    try {
      config.value = JSON.parse(raw) as LinkRuleOverrides;
    } catch {
      // keep default
    }
  }
}

function toggleLocale(locale: string, checked: boolean) {
  if (checked) {
    if (!config.value.enabledLocales.includes(locale)) {
      config.value = { ...config.value, enabledLocales: [...config.value.enabledLocales, locale] };
    }
  } else {
    config.value = { ...config.value, enabledLocales: config.value.enabledLocales.filter((l) => l !== locale) };
  }
  saveConfig();
}

function toggleRule(id: string, enabled: boolean) {
  const overrides = { ...config.value.overrides, [id]: { ...config.value.overrides[id], enabled } };
  config.value = { ...config.value, overrides };
  saveConfig();
}

function deleteRule(id: string) {
  const overrides = { ...config.value.overrides };
  delete overrides[id];
  config.value = { ...config.value, overrides };
  saveConfig();
}

function onRuleSaved(rule: LinkRule) {
  const overrides = {
    ...config.value.overrides,
    [rule.id]: {
      name: rule.name,
      pattern: rule.pattern,
      urlTemplate: rule.urlTemplate,
      priority: rule.priority,
      locale: rule.locale,
      enabled: rule.enabled,
      ...(rule.example ? { example: rule.example } : {}),
    },
  };
  config.value = { ...config.value, overrides };
  saveConfig();
  showAddModal.value = false;
}

onMounted(loadConfig);
</script>

<style scoped>
.locale-toggles {
  display: flex;
  gap: 20px;
  padding: 8px 0;
}

.locale-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-sm);
  cursor: pointer;
}

.pattern-cell {
  font-family: monospace;
  font-size: var(--font-xs);
}

.test-textarea {
  width: 100%;
  font-family: inherit;
  font-size: var(--font-sm);
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: vertical;
  box-sizing: border-box;
}

.test-results {
  margin-top: 10px;
  padding: 10px;
  background: #f8f8f8;
  border-radius: 4px;
  font-size: var(--font-sm);
  line-height: 1.7;
  word-break: break-all;
}

.test-link {
  color: #2563eb;
  text-decoration: underline;
}

.rule-badge {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 5px;
  background: #e0edff;
  color: #1d4ed8;
  border-radius: 3px;
  font-size: var(--font-xs);
  vertical-align: middle;
}

.example-cell {
  font-size: var(--font-xs);
  color: #888;
}

</style>
