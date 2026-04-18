<template>
  <div>
    <div class="header">
      <h2>{{ $t('settings.title') }}</h2>
    </div>

    <FilterChips :options="tabOptions" :model-value="activeTab" @update:model-value="activeTab = $event" />

    <div class="settings-content">
      <div v-if="activeTab === 'appearance'" class="appearance-tab">
        <div class="settings-group">
          <div class="settings-group-label">{{ $t('settings.theme') }}</div>
          <div class="theme-dots">
            <button
              v-for="theme in themes"
              :key="theme.id"
              :class="['theme-dot', { active: currentTheme === theme.id }]"
              :style="{ background: theme.gradient }"
              :title="theme.label"
              @click="setTheme(theme.id)"
            />
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-label">{{ $t('settings.appearance') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.appearance')">
            <button :class="['settings-option', { active: appearance === 'light' }]" role="radio" :aria-checked="String(appearance === 'light')" @click="setAppearance('light')">{{ $t('settings.light') }}</button>
            <button :class="['settings-option', { active: appearance === 'dark' }]" role="radio" :aria-checked="String(appearance === 'dark')" @click="setAppearance('dark')">{{ $t('settings.dark') }}</button>
            <button :class="['settings-option', { active: appearance === 'contrast' }]" role="radio" :aria-checked="String(appearance === 'contrast')" @click="setAppearance('contrast')">{{ $t('settings.contrast') }}</button>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-label">{{ $t('settings.textSize') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.textSize')">
            <button :class="['settings-option', { active: textSize === 'small' }]" role="radio" :aria-checked="String(textSize === 'small')" @click="setTextSize('small')">S</button>
            <button :class="['settings-option', { active: textSize === 'medium' }]" role="radio" :aria-checked="String(textSize === 'medium')" @click="setTextSize('medium')">M</button>
            <button :class="['settings-option', { active: textSize === 'large' }]" role="radio" :aria-checked="String(textSize === 'large')" @click="setTextSize('large')">L</button>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-label">{{ $t('settings.language') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('settings.language')">
            <button :class="['settings-option', { active: locale === 'sv' }]" role="radio" :aria-checked="String(locale === 'sv')" @click="setLocale('sv')">Svenska</button>
            <button :class="['settings-option', { active: locale === 'en' }]" role="radio" :aria-checked="String(locale === 'en')" @click="setLocale('en')">English</button>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-label">{{ $t('a11y.readAloud') }}</div>
          <div class="settings-row" role="radiogroup" :aria-label="$t('a11y.readAloud')">
            <button :class="['settings-option', { active: screenReaderMode === 'off' }]" role="radio" :aria-checked="String(screenReaderMode === 'off')" @click="setScreenReaderMode('off')">{{ $t('settings.off') }}</button>
            <button :class="['settings-option', { active: screenReaderMode === 'narrate' }]" role="radio" :aria-checked="String(screenReaderMode === 'narrate')" @click="setScreenReaderMode('narrate')">{{ $t('settings.narrate') }}</button>
            <button :class="['settings-option', { active: screenReaderMode === 'screenReader' }]" role="radio" :aria-checked="String(screenReaderMode === 'screenReader')" @click="setScreenReaderMode('screenReader')">{{ $t('settings.screenReaderMode') }}</button>
          </div>
        </div>
      </div>

      <DatabaseView v-else-if="activeTab === 'database'" />
      <ImportExportView v-else-if="activeTab === 'import-export'" />
      <LinkRulesView v-else-if="activeTab === 'link-rules'" />
      <GazetteersView v-else-if="activeTab === 'gazetteers'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { saveLocale } from '../i18n';
import type { SupportedLocale } from '../i18n';
import FilterChips from '../components/ui/FilterChips.vue';
import DatabaseView from './DatabaseView.vue';
import ImportExportView from './ImportExportView.vue';
import LinkRulesView from './LinkRulesView.vue';
import GazetteersView from './GazetteersView.vue';

const { t, locale } = useI18n();

const screenReader = inject<{ mode: { value: string }; setMode: (m: string) => void }>('screenReader');
const tts = inject<{ speak: (text: string, lang: string) => void }>('tts');
const ttsEnabled = inject<{ value: boolean }>('ttsEnabled');

const activeTab = ref('appearance');

const tabOptions = computed(() => [
  { value: 'appearance', label: t('settings.tabs.appearance') },
  { value: 'database', label: t('settings.tabs.database') },
  { value: 'import-export', label: t('settings.tabs.importExport') },
  { value: 'link-rules', label: t('settings.tabs.linkRules') },
  { value: 'gazetteers', label: t('settings.tabs.gazetteers') },
]);

// --- Theme ---
const THEME_CLASSES = ['theme-forest', 'theme-nordic', 'theme-twilight'] as const;
type Theme = 'forest' | 'nordic' | 'twilight';
const currentTheme = ref<Theme>(
  (localStorage.getItem('slaktforskning-theme') as Theme) || 'forest'
);

const themes = computed(() => [
  { id: 'forest' as Theme, label: t('settings.themes.forest'), gradient: 'linear-gradient(135deg, #1a2e1a, #2d5a27)' },
  { id: 'nordic' as Theme, label: t('settings.themes.nordic'), gradient: 'linear-gradient(135deg, #0f1a2e, #1d4ed8)' },
  { id: 'twilight' as Theme, label: t('settings.themes.twilight'), gradient: 'linear-gradient(135deg, #1e1b2e, #6c5ce7)' },
]);

function setTheme(theme: Theme) {
  currentTheme.value = theme;
  document.documentElement.classList.remove(...THEME_CLASSES);
  document.documentElement.classList.add(`theme-${theme}`);
  localStorage.setItem('slaktforskning-theme', theme);
}

// --- Appearance (light/dark/contrast) ---
type Appearance = 'light' | 'dark' | 'contrast';
const APPEARANCE_I18N = { light: 'settings.lightMode', dark: 'settings.darkMode', contrast: 'settings.contrastMode' } as const;
const appearance = ref<Appearance>(
  (localStorage.getItem('slaktforskning-appearance') as Appearance) ||
  (localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light')
);

function setAppearance(value: Appearance) {
  appearance.value = value;
  localStorage.setItem('slaktforskning-appearance', value);
  document.documentElement.classList.remove('dark', 'high-contrast');
  if (value === 'dark') document.documentElement.classList.add('dark');
  if (value === 'contrast') document.documentElement.classList.add('high-contrast');
  if (ttsEnabled?.value) {
    tts?.speak(t(APPEARANCE_I18N[value]), locale.value);
  }
}

// --- Text size ---
const RAW_TEXT_SIZE = localStorage.getItem('textSize');
const textSize = ref<'small' | 'medium' | 'large'>(
  (RAW_TEXT_SIZE === 'medium' || RAW_TEXT_SIZE === 'large') ? RAW_TEXT_SIZE : 'small'
);
const TEXT_SIZE_I18N = { small: 'settings.textSizeSmall', medium: 'settings.textSizeMedium', large: 'settings.textSizeLarge' } as const;

function setTextSize(size: 'small' | 'medium' | 'large') {
  textSize.value = size;
  localStorage.setItem('textSize', size);
  document.documentElement.classList.remove('text-medium', 'text-large');
  if (size === 'medium') document.documentElement.classList.add('text-medium');
  if (size === 'large') document.documentElement.classList.add('text-large');
  if (ttsEnabled?.value) {
    tts?.speak(t(TEXT_SIZE_I18N[size]), locale.value);
  }
}

// --- Locale ---
function setLocale(val: SupportedLocale) {
  locale.value = val;
  saveLocale(val);
}

// --- Screen reader mode ---
const screenReaderMode = computed(() => screenReader?.mode.value ?? 'off');

function setScreenReaderMode(mode: string) {
  screenReader?.setMode(mode);
}
</script>

<style scoped>
.settings-content {
  margin-top: 16px;
}

.appearance-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 480px;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-group-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.theme-dots {
  display: flex;
  gap: 12px;
}

.theme-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s;
}

.theme-dot:hover {
  border-color: var(--text-muted);
}

.theme-dot.active {
  border-color: var(--accent);
}

.settings-row {
  display: flex;
  gap: 4px;
}

.settings-option {
  flex: 1;
  background: var(--surface-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--font-sm);
  font-family: inherit;
  text-align: center;
  transition: all 0.15s;
}

.settings-option:hover {
  background: var(--surface);
  color: var(--text-primary);
}

.settings-option.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
  font-weight: 600;
}
</style>
