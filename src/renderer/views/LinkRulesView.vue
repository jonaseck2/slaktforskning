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
      <p v-else class="empty-hint">{{ $t('linkRules.noRules') }}</p>
    </div>

    <!-- Test field -->
    <div class="detail-section">
      <div class="section-header">
        <h4>{{ $t('linkRules.testField') }}</h4>
      </div>
      <textarea
        v-model="testText"
        class="test-textarea"
        :placeholder="$t('linkRules.testPlaceholder')"
        rows="4"
      ></textarea>
      <div v-if="testText" class="test-results">
        <span v-for="(seg, i) in testSegments" :key="i" class="test-segment">
          <a v-if="seg.url" :href="seg.url" target="_blank" rel="noopener" class="test-link">{{ seg.text }}<span class="rule-badge">{{ seg.ruleName }}</span></a>
          <span v-else>{{ seg.text }}</span>
        </span>
      </div>
    </div>

    <!-- Add custom rule modal -->
    <div v-if="showAddModal" class="modal-overlay">
      <div class="modal">
        <h3>{{ $t('linkRules.addRule') }}</h3>
        <form @submit.prevent="submitAddRule">
          <label>
            {{ $t('linkRules.name') }}
            <input v-model="newRule.name" type="text" required />
          </label>
          <label>
            {{ $t('linkRules.pattern') }}
            <input v-model="newRule.pattern" type="text" required :class="{ 'input-error': patternError }" />
            <span v-if="patternError" class="field-error">{{ patternError }}</span>
          </label>
          <label>
            {{ $t('linkRules.urlTemplate') }}
            <input v-model="newRule.urlTemplate" type="text" required />
          </label>
          <label>
            {{ $t('linkRules.example') }}
            <input v-model="newRule.example" type="text" :placeholder="$t('linkRules.examplePlaceholder')" />
          </label>
          <div v-if="newRule.example && newRule.pattern" class="example-test">
            <span v-if="exampleMatchResult === 'valid'" class="match-ok">&#x2713; {{ $t('linkRules.exampleMatches') }}</span>
            <span v-else-if="exampleMatchResult === 'no-match'" class="match-fail">&#x2717; {{ $t('linkRules.exampleNoMatch') }}</span>
            <span v-else-if="exampleMatchResult === 'bad-regex'" class="match-fail">&#x2717; {{ patternError }}</span>
            <div v-if="exampleMatchUrl" class="match-url">→ {{ exampleMatchUrl }}</div>
          </div>
          <label>
            {{ $t('linkRules.priority') }}
            <input v-model.number="newRule.priority" type="number" min="0" max="999" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="closeAddModal">{{ $t('common.cancel') }}</button>
            <button type="submit">{{ $t('common.save') }}</button>
          </div>
        </form>
      </div>
    </div>
    <!-- View rule modal (read-only) -->
    <div v-if="viewingRule" class="modal-overlay">
      <div class="modal">
        <h3>{{ viewingRule.name }}</h3>
        <form @submit.prevent>
          <label>
            {{ $t('linkRules.name') }}
            <input :value="viewingRule.name" type="text" readonly />
          </label>
          <label>
            {{ $t('linkRules.pattern') }}
            <input :value="viewingRule.pattern" type="text" readonly class="mono" />
          </label>
          <label>
            {{ $t('linkRules.urlTemplate') }}
            <input :value="viewingRule.urlTemplate" type="text" readonly class="mono" />
          </label>
          <label v-if="viewingRule.example">
            {{ $t('linkRules.example') }}
            <input :value="viewingRule.example" type="text" readonly />
          </label>
          <label>
            {{ $t('linkRules.priority') }}
            <input :value="viewingRule.priority" type="text" readonly />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="viewingRule = null">{{ $t('common.cancel') }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppButton from '../components/ui/AppButton.vue';
import { linkify, resolveRules, type LinkRule, type LinkRuleOverrides } from '../../api/source-linker';
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
const newRule = ref({ name: '', pattern: '', urlTemplate: '', example: '', priority: 50 });
const patternError = ref('');

const exampleMatchResult = computed<'valid' | 'no-match' | 'bad-regex' | null>(() => {
  if (!newRule.value.example || !newRule.value.pattern) return null;
  try {
    const regex = new RegExp(newRule.value.pattern);
    return regex.test(newRule.value.example) ? 'valid' : 'no-match';
  } catch {
    return 'bad-regex';
  }
});

const exampleMatchUrl = computed<string | null>(() => {
  if (exampleMatchResult.value !== 'valid' || !newRule.value.urlTemplate) return null;
  const segments = linkify(newRule.value.example, [{
    id: 'preview',
    name: 'Preview',
    pattern: newRule.value.pattern,
    urlTemplate: newRule.value.urlTemplate,
    locale: '*',
    enabled: true,
    priority: 0,
  }]);
  const linked = segments.find((s) => s.url);
  return linked?.url ?? null;
});

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

function closeAddModal() {
  showAddModal.value = false;
  newRule.value = { name: '', pattern: '', urlTemplate: '', example: '', priority: 50 };
  patternError.value = '';
}

function submitAddRule() {
  patternError.value = '';
  try {
    new RegExp(newRule.value.pattern);
  } catch (e) {
    patternError.value = String(e);
    return;
  }
  const id = 'custom-' + Date.now();
  const ruleData: Partial<LinkRule> & { enabled: boolean } = {
    name: newRule.value.name,
    pattern: newRule.value.pattern,
    urlTemplate: newRule.value.urlTemplate,
    priority: newRule.value.priority,
    locale: '*',
    enabled: true,
  };
  if (newRule.value.example) {
    ruleData.example = newRule.value.example;
  }
  const overrides = {
    ...config.value.overrides,
    [id]: ruleData,
  };
  config.value = { ...config.value, overrides };
  saveConfig();
  closeAddModal();
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

.example-test {
  padding: 6px 0;
  font-size: var(--font-sm);
}

.match-ok {
  color: #22c55e;
}

.match-fail {
  color: #e53e3e;
}

.match-url {
  font-family: monospace;
  font-size: var(--font-xs);
  color: #888;
  margin-top: 2px;
  word-break: break-all;
}

.input-error {
  border-color: #e53e3e !important;
}

.field-error {
  display: block;
  color: #e53e3e;
  font-size: var(--font-xs);
  margin-top: 2px;
}

.view-rule-fields input[readonly] {
  background: #f5f5f5;
  cursor: default;
}

.mono {
  font-family: monospace;
  font-size: var(--font-xs);
}
</style>
