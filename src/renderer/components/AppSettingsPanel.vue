<template>
  <div class="settings-section">
    <button class="settings-toggle" :aria-expanded="isOpen" :aria-label="$t('a11y.settings')" @click.stop="isOpen = !isOpen">
      <span class="nav-icon" aria-hidden="true">🎨</span>
      <span class="nav-label">{{ $t('settings.appearance') }}</span>
      <span class="settings-arrow">{{ isOpen ? '▴' : '▾' }}</span>
    </button>
    <div v-if="isOpen" class="settings-panel">
      <template v-if="variant === 'renderer'">
        <div class="settings-group-label">{{ $t('settings.menuLayout') }}</div>
        <div class="settings-row" role="radiogroup" :aria-label="$t('settings.menuLayout')">
          <button :class="['settings-option', { active: navOrientation === 'vertical' }]" role="radio" :aria-checked="navOrientation === 'vertical'" @click="setNavOrientation('vertical')">{{ $t('settings.menuVertical') }}</button>
          <button :class="['settings-option', { active: navOrientation === 'horizontal' }]" role="radio" :aria-checked="navOrientation === 'horizontal'" @click="setNavOrientation('horizontal')">{{ $t('settings.menuHorizontal') }}</button>
        </div>
      </template>

      <div class="settings-group-label">{{ $t('settings.appearance') }}</div>
      <div class="settings-row" role="radiogroup" :aria-label="$t('settings.appearance')">
        <button :class="['settings-option', { active: appearance === 'light' }]" role="radio" :aria-checked="appearance === 'light'" @click="setAppearance('light')">☀</button>
        <button :class="['settings-option', { active: appearance === 'dark' }]" role="radio" :aria-checked="appearance === 'dark'" @click="setAppearance('dark')">🌙</button>
        <button :class="['settings-option', { active: appearance === 'contrast' }]" role="radio" :aria-checked="appearance === 'contrast'" @click="setAppearance('contrast')">👁</button>
      </div>

      <div class="settings-group-label">{{ $t('settings.theme') }}</div>
      <div class="settings-row" role="radiogroup" :aria-label="$t('settings.theme')">
        <button :class="['settings-option', { active: currentTheme === 'forest' }]" role="radio" :aria-checked="currentTheme === 'forest'" @click="setTheme('forest')">🌲</button>
        <button :class="['settings-option', { active: currentTheme === 'nordic' }]" role="radio" :aria-checked="currentTheme === 'nordic'" @click="setTheme('nordic')">❄️</button>
        <button :class="['settings-option', { active: currentTheme === 'twilight' }]" role="radio" :aria-checked="currentTheme === 'twilight'" @click="setTheme('twilight')">🌅</button>
      </div>

      <template v-if="variant === 'renderer'">
        <div class="settings-group-label">{{ $t('settings.addBtnStyle') }}</div>
        <div class="settings-row" role="radiogroup" :aria-label="$t('settings.addBtnStyle')">
          <button :class="['settings-option', { active: addBtnStyle === 'plus' }]" role="radio" :aria-checked="addBtnStyle === 'plus'" :title="$t('settings.addBtnPlus')" @click="setAddBtnStyle('plus')">＋</button>
          <button :class="['settings-option', { active: addBtnStyle === 'leaf' }]" role="radio" :aria-checked="addBtnStyle === 'leaf'" :title="$t('settings.addBtnLeaf')" @click="setAddBtnStyle('leaf')">🍃</button>
        </div>
      </template>

      <div class="settings-group-label">{{ $t('settings.textSize') }}</div>
      <div class="settings-row" role="radiogroup" :aria-label="$t('settings.textSize')">
        <button :class="['settings-option', { active: textSize === 'small' }]" role="radio" :aria-checked="textSize === 'small'" @click="setTextSize('small')">S</button>
        <button :class="['settings-option', { active: textSize === 'medium' }]" role="radio" :aria-checked="textSize === 'medium'" @click="setTextSize('medium')">M</button>
        <button :class="['settings-option', { active: textSize === 'large' }]" role="radio" :aria-checked="textSize === 'large'" @click="setTextSize('large')">L</button>
      </div>

      <div class="settings-group-label">{{ $t('settings.readAloud') }}</div>
      <div class="settings-row" role="radiogroup" :aria-label="$t('settings.readAloud')">
        <button :class="['settings-option', { active: screenReader.mode.value === 'off' }]" role="radio" :aria-checked="screenReader.mode.value === 'off'" :aria-label="$t('settings.off')" @click="screenReader.setMode('off')">🔇</button>
        <button :class="['settings-option', { active: screenReader.mode.value === 'narrate' }]" role="radio" :aria-checked="screenReader.mode.value === 'narrate'" :aria-label="$t('settings.narrate')" @click="screenReader.setMode('narrate')">🔊</button>
        <button :class="['settings-option', { active: screenReader.mode.value === 'screenReader' }]" role="radio" :aria-checked="screenReader.mode.value === 'screenReader'" :aria-label="$t('settings.screenReaderMode')" @click="screenReader.setMode('screenReader')">♿</button>
      </div>

      <div class="settings-group-label">{{ $t('settings.language') }}</div>
      <div class="settings-row" role="radiogroup" :aria-label="$t('settings.language')">
        <button :class="['settings-option', { active: locale === 'sv' }]" role="radio" :aria-checked="locale === 'sv'" @click="setLocale('sv')">Sv</button>
        <button :class="['settings-option', { active: locale === 'en' }]" role="radio" :aria-checked="locale === 'en'" @click="setLocale('en')">En</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { saveLocale } from '../i18n';
import type { SupportedLocale } from '../i18n';
import { useTTS } from '../composables/useTTS';
import { useScreenReaderMode } from '../composables/useScreenReaderMode';

const props = defineProps<{ variant: 'renderer' | 'static' }>();

const { locale, t } = useI18n();
// Inject the App-provided TTS / screen-reader singletons when available; fall
// back to a fresh composable instance so this component is mountable in
// isolated component tests (no provide chain set up).
const tts = inject<ReturnType<typeof useTTS>>('tts', null as never) ?? useTTS();
const screenReader = inject<ReturnType<typeof useScreenReaderMode>>('screenReader', null as never) ?? useScreenReaderMode();

const isOpen = ref(false);

// Appearance: light | dark | contrast — persisted in localStorage, applied as
// classes on <html>. Key name 'slaktforskning-appearance' is the canonical
// STORAGE_KEYS.appearance value; intentionally hard-coded here so static SPA
// (which doesn't import the typed registry) keeps reading the same key.
type Appearance = 'light' | 'dark' | 'contrast';
const appearance = ref<Appearance>(
  (localStorage.getItem('slaktforskning-appearance') as Appearance) ||
  (localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light')
);
const APPEARANCE_I18N = { light: 'settings.lightMode', dark: 'settings.darkMode', contrast: 'settings.contrastMode' } as const;
function setAppearance(v: Appearance) {
  appearance.value = v;
  localStorage.setItem('slaktforskning-appearance', v);
  document.documentElement.classList.remove('dark', 'high-contrast');
  if (v === 'dark') document.documentElement.classList.add('dark');
  if (v === 'contrast') document.documentElement.classList.add('high-contrast');
  if (screenReader.isTtsEnabled.value) tts.speak(t(APPEARANCE_I18N[v]), locale.value);
}

const THEME_CLASSES = ['theme-forest', 'theme-nordic', 'theme-twilight'] as const;
type Theme = 'forest' | 'nordic' | 'twilight';
const currentTheme = ref<Theme>((localStorage.getItem('slaktforskning-theme') as Theme) || 'forest');
function setTheme(theme: Theme) {
  currentTheme.value = theme;
  document.documentElement.classList.remove(...THEME_CLASSES);
  document.documentElement.classList.add(`theme-${theme}`);
  localStorage.setItem('slaktforskning-theme', theme);
}

const RAW_TEXT_SIZE = localStorage.getItem('textSize');
const textSize = ref<'small' | 'medium' | 'large'>(
  RAW_TEXT_SIZE === 'medium' || RAW_TEXT_SIZE === 'large' ? RAW_TEXT_SIZE : 'small'
);
const TEXT_SIZE_I18N = { small: 'settings.textSizeSmall', medium: 'settings.textSizeMedium', large: 'settings.textSizeLarge' } as const;
function applyTextSize() {
  document.documentElement.classList.remove('text-medium', 'text-large');
  if (textSize.value === 'medium') document.documentElement.classList.add('text-medium');
  if (textSize.value === 'large') document.documentElement.classList.add('text-large');
}
function setTextSize(s: 'small' | 'medium' | 'large') {
  textSize.value = s;
  localStorage.setItem('textSize', s);
  applyTextSize();
  if (screenReader.isTtsEnabled.value) tts.speak(t(TEXT_SIZE_I18N[s]), locale.value);
}

const navOrientation = ref<'vertical' | 'horizontal'>(
  (localStorage.getItem('slaktforskning-nav-orientation') as 'vertical' | 'horizontal') || 'vertical'
);
function setNavOrientation(v: 'vertical' | 'horizontal') {
  navOrientation.value = v;
  localStorage.setItem('slaktforskning-nav-orientation', v);
  // Renderer-only setting; App.vue reads from the same key and re-renders.
  window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'navOrientation', value: v } }));
}

const addBtnStyle = ref<'plus' | 'leaf'>(
  (localStorage.getItem('slaktforskning-add-btn-style') as 'plus' | 'leaf') || 'plus'
);
function setAddBtnStyle(v: 'plus' | 'leaf') {
  addBtnStyle.value = v;
  localStorage.setItem('slaktforskning-add-btn-style', v);
  document.documentElement.classList.toggle('add-btn-leaf', v === 'leaf');
  window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'addBtnStyle', value: v } }));
}

function setLocale(v: SupportedLocale) {
  locale.value = v;
  saveLocale(v);
}

onMounted(() => {
  setTheme(currentTheme.value);
  setAppearance(appearance.value);
  applyTextSize();
  if (props.variant === 'renderer') {
    document.documentElement.classList.toggle('add-btn-leaf', addBtnStyle.value === 'leaf');
  }
});
</script>

<style scoped>
/* Self-contained styling — App.vue's matching .settings-* rules will be deleted in Waves 2 and 3 once the markup is removed from there. */
.settings-section {
  margin-top: 4px;
  border-top: 1px solid var(--sidebar-border);
  padding-top: 6px;
}
.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: none;
  border: none;
  color: var(--sidebar-text);
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: var(--font-sm);
  font-family: inherit;
  text-align: left;
}
.settings-toggle:hover {
  background: var(--sidebar-active-bg);
}
.settings-arrow {
  margin-left: auto;
  font-size: var(--font-xs);
  color: var(--sidebar-text-muted);
}
.settings-panel {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.settings-group-label {
  font-size: var(--font-xs);
  color: var(--sidebar-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 4px;
}
.settings-row {
  display: flex;
  gap: 3px;
}
.settings-option {
  flex: 1;
  background: var(--sidebar-active-bg);
  border: none;
  color: var(--sidebar-text);
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--font-xs);
  font-family: inherit;
  text-align: center;
  transition: all 0.15s;
}
.settings-option:hover {
  color: var(--sidebar-active-text);
}
.settings-option.active {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}
</style>
