# Shared `<AppSidebar>` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Use the project-local `subagent-handoff` skill for dispatch (centers user goals over spec compliance). Steps use checkbox (`- [x]`) syntax for tracking.

## User goal

The sidebar that frames every view — in the real Tauri app **and** in the static HTML site exported from it — looks identical, behaves identically, and stays in sync automatically when nav items, badges, or appearance/theme/text-size controls change. The user (a genealogist) opens their exported family-tree site and the chrome they see is the same chrome they edited with — no "the search box looks different in the export", no "settings appearance is missing from the website", no drift caused by someone updating one App.vue and forgetting the other.

## Scope

Both consumers of the sidebar chrome pattern in the codebase, plus their shared settings panel:

- **`src/renderer/App.vue`** — the Tauri app shell. Vertical-sidebar mode (the default; `navOrientation === 'vertical'`). Currently 1091 LOC; the vertical sidebar block is roughly lines 4–138 and includes a settings panel (~lines 90–137) duplicated again inside the horizontal topbar block (~lines 214–266).
- **`src/static/App.vue`** — the static SPA shell shipped inside the website export. 389 LOC; the entire sidebar is roughly lines 4–68 plus a settings panel (~lines 36–67).

The extracted shared component covers:

- Sidebar visual chrome (`<nav class="sidebar">`, `.sidebar-header`, scroll behavior, `.sidebar-spacer`)
- Nav-section rendering (section-label headings + router-link items + badges) driven by a structured `:sections` prop, mirroring the existing `navSections` data in renderer App.vue:511–554
- A shared `<AppSettingsPanel>` covering appearance / theme / text-size / read-aloud / language (the rows both apps already have today)
- A `#bottom` slot in `<AppSidebar>` for renderer-only chrome (undo row, import-export link, settings link) — static fills it with nothing

### Scope deviations

- **Renderer horizontal topbar mode** (`<header v-else class="topbar">`, App.vue:141–267) is **out of scope** for this plan. Reason: static SPA does not ship a horizontal topbar, so it isn't part of the "stays in sync between renderer and static" user goal. The topbar's settings-panel duplication inside renderer/App.vue (the SAME settings rows appear in both vertical and horizontal blocks) **is** addressed because Task 2 below replaces *both* renderer settings-panel sites with the shared `<AppSettingsPanel>`. The topbar's nav rendering stays inline; extracting it would not serve the user goal and adds risk. The horizontal-topbar nav rendering is a follow-up plan candidate if/when the renderer-internal duplication becomes painful again.
- **Static's current `<form class="sidebar-search">` with an always-visible input** (static/App.vue:8–16) is **removed** as part of Task 6. Replacement: a `/search` nav-item in `navSections`, matching the renderer's `🔍 Sök` router-link pattern (renderer/App.vue:21–24, 522). Reason: the user goal is "identical between renderer and static" and the renderer has no such input — keeping it would re-introduce the divergence we're fixing. The `submitSearch` script logic (static/App.vue:189–194) and the `Cmd/Ctrl+F` keyboard handler that focuses it (static/App.vue:169–175) are removed in the same task.
- **No new feature is in scope.** This plan moves existing markup behind a shared component. We do not redesign the sidebar, do not change navigation, do not add new settings groups, do not change i18n keys, do not change persisted localStorage keys. A user with the old static export refreshing the new one should see no behavioral change beyond the sidebar visually matching the real app.

## Verification

The plan is done when **all** of the following are demonstrated with output evidence in the close-out commit:

1. **User-observable identity (the falsifiable check):** open `npm start` and `npm run dev:static` side by side at the same viewport size. Vertical sidebar in both renders the same width (220px), same header band, same nav-item type style (icon + label + active state), same settings panel chrome and rows (appearance / theme / text-size / read-aloud / language). The only structural difference is which nav-items are listed (static has fewer) and what the renderer's `#bottom` slot contributes (undo row + import-export + settings link — absent in static). If the same `theme-twilight + high-contrast + textSize=large` combination is applied in both, both render identically.
2. **Mechanical structural check:** `tests/components/app-sidebar-shape.test.ts` mounts `<AppSidebar>` with renderer-style `:sections` and static-style `:sections`, asserts that the root structure, class names, and settings panel contents match a snapshot. **The test fails if someone touches one App.vue and forgets the shared component** — which is the long-term drift this plan exists to prevent.
3. **Settings persistence regression:** `tests/components/app-settings-panel.test.ts` mounts `<AppSettingsPanel>` with each `variant`, toggles every option, asserts that the right `STORAGE_KEYS.*` write fires and the right `document.documentElement` class is applied/removed. Catches the case where the extraction breaks one of the side-effecting handlers.
4. **`npm test`** → `N passed (Xs)` (paste the summary line into the close-out commit). The new component tests are included in N.
5. **`npm run build`** → `built in Xs`, exit 0 (paste the tail).
6. **`npm run test:e2e:full`** → `M passed (Ys)` across all 7 projects. This plan changes the panel/sidebar chrome of every paneled view (PANELED_ROUTES in App.vue:469) — `[panels]` and `[reactivity]` are non-negotiable, not optional.
7. **`npx vue-tsc --noEmit --ignoreDeprecations 6.0`** completes with no NEW errors in touched files (pre-existing errors documented in `.claude/rules/build.md` are tolerated).

Per `.claude/rules/plans.md`: "if every one of these passes, can the user goal still be unmet?" — the answer must be no. Item #2 is the falsifiability gate.

## Failure modes / RCA reference

- **Past failure: panel-composables refactor (v0.190.0–v0.190.2).** Half-consistent migration because the plan's scope was implicit. That plan's RCA produced `.claude/rules/plans.md` which this plan is following. The mitigation here: explicit scope (2 enumerated consumers, 1 explicit deviation for horizontal topbar with reason), structural test that fails on drift (item #2 above).
- **Past failure: `<EntityPanel>` introduced a `.entity-panel` class that silently collided with `BaseSubPanel`'s existing `.entity-panel` in `shared.css:1253`.** Mitigation: Task 4 below runs the class-name collision check (`grep -RIn '\.app-sidebar\b' src/renderer/styles/`) before settling on the component's root class name. If it hits, rename.
- **Past failure: `preview-protocol.ts` silently no-op'd on a `.replace()` against an HTML artifact (v0.227.5).** Not the same shape, but the meta-rule applies: tests must assert the *effect*, not just *presence*. Item #2 above tests structural identity, not just "the component renders without throwing."
- **The 2026-05-12 Tauri full-port RCA finding** ("e2e is load-bearing verification"): item #6 above mandates `test:e2e:full`. Skipping it because "it's just a refactor" is the failure mode.

## Tech Stack

- Vue 3 Composition API with `<script setup lang="ts">`
- Vue Router (router-link nav-items)
- vue-i18n (`useI18n()` for `$t(key)`)
- `localStorage` via `STORAGE_KEYS` typed registry (`src/renderer/utils/storage-keys.ts`)
- TTS / screen-reader integration: `useTTS`, `useScreenReaderMode` (composables from `src/renderer/composables/`)
- Vitest + happy-dom for component tests (per `tests/components/` convention)

## File Structure

**Create:**

- `src/renderer/components/AppSettingsPanel.vue` — appearance / theme / text-size / read-aloud / language controls. Self-contained: owns localStorage IO, applies `document.documentElement` classes, calls TTS for spoken feedback. Takes a `:variant: 'renderer' | 'static'` prop that gates the renderer-only rows (menu-layout toggle, add-button-style toggle).
- `src/renderer/components/AppSidebar.vue` — sidebar visual chrome. Renders `<nav class="sidebar">`, `.sidebar-header`, the nav-section list driven by `:sections`, `.sidebar-spacer`, the `#bottom` slot, and the `<AppSettingsPanel>` block. Pure presentation + structured-data prop; no IPC, no localStorage of its own beyond what AppSettingsPanel handles.
- `src/renderer/components/AppSidebarTypes.ts` — `NavItemDef`, `NavSectionDef` exported here so both Apps can import the same types without circular references. Mirrors the inline types currently at renderer/App.vue:512–513.
- `tests/components/app-sidebar-shape.test.ts` — structural identity test (Verification item #2).
- `tests/components/app-settings-panel.test.ts` — settings persistence test (Verification item #3).

**Modify:**

- `src/renderer/App.vue` — vertical-sidebar block (~lines 4–138) replaced by `<AppSidebar :sections="navSections">` + `#bottom` slot filled with the undo row + import-export router-link + settings router-link. Horizontal topbar block's settings panel (~lines 224–264) replaced by `<AppSettingsPanel variant="renderer">`. The `<script setup>` block deletes the settings-state refs and handlers that move into the new component (appearance/theme/textSize/locale/screenReader handlers).
- `src/static/App.vue` — entire `<nav class="sidebar">` block (~lines 4–68) replaced by `<AppSidebar :sections="navSections">`. The settings-state refs/handlers and the search-input form + its keyboard handler are removed. A new top-of-file `navSections = computed(...)` defines the 3 existing items (persons, places, media) plus a 4th `/search` router-link.

**Leave untouched:**

- `src/renderer/styles/shared.css` and `src/renderer/styles/tokens.css` — the `.sidebar`, `.sidebar-header`, `.nav-item`, `.settings-*` rules already live here and are the canonical source. The new components rely on these existing global classes; no class names are renamed.
- `src/static/router.ts` — `/search` route already exists.
- `src/renderer/composables/useTTS.ts`, `useScreenReaderMode.ts` — no API changes; AppSettingsPanel uses them the same way both Apps do today.
- `src/renderer/i18n/sv.ts`, `en.ts` — every key referenced by the extracted markup already exists in both locale files (used by either App.vue today).

---

### Task 1: Component-shape test for `<AppSettingsPanel>` (TDD: write the failing test first)

**Files:**
- Create: `tests/components/app-settings-panel.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import AppSettingsPanel from '../../src/renderer/components/AppSettingsPanel.vue';

function makeI18n() {
  return createI18n({
    legacy: false,
    locale: 'sv',
    messages: {
      sv: {
        settings: {
          appearance: 'Utseende', theme: 'Tema', textSize: 'Textstorlek',
          readAloud: 'Läs upp', language: 'Språk', menuLayout: 'Menyläge',
          addBtnStyle: 'Lägg till-knapp', menuVertical: 'Vertikal', menuHorizontal: 'Horisontell',
          textSizeSmall: 'Liten', textSizeMedium: 'Medel', textSizeLarge: 'Stor',
          off: 'Av', narrate: 'Berätta', screenReaderMode: 'Skärmläsarläge',
          lightMode: 'Ljus', darkMode: 'Mörk', contrastMode: 'Hög kontrast',
          addBtnPlus: 'Plus', addBtnLeaf: 'Löv',
        },
        a11y: { settings: 'Inställningar' },
      },
      en: { settings: {}, a11y: {} },
    },
  });
}

describe('AppSettingsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('renders the shared rows for both variants', () => {
    for (const variant of ['renderer', 'static'] as const) {
      const w = mount(AppSettingsPanel, {
        props: { variant },
        global: { plugins: [makeI18n()] },
      });
      const labels = w.findAll('.settings-group-label').map(n => n.text());
      expect(labels).toContain('Utseende');
      expect(labels).toContain('Tema');
      expect(labels).toContain('Textstorlek');
      expect(labels).toContain('Läs upp');
      expect(labels).toContain('Språk');
      w.unmount();
    }
  });

  it('renderer variant includes menu-layout + add-button-style rows; static variant does not', () => {
    const wR = mount(AppSettingsPanel, { props: { variant: 'renderer' }, global: { plugins: [makeI18n()] } });
    const wS = mount(AppSettingsPanel, { props: { variant: 'static' }, global: { plugins: [makeI18n()] } });
    const rLabels = wR.findAll('.settings-group-label').map(n => n.text());
    const sLabels = wS.findAll('.settings-group-label').map(n => n.text());
    expect(rLabels).toContain('Menyläge');
    expect(rLabels).toContain('Lägg till-knapp');
    expect(sLabels).not.toContain('Menyläge');
    expect(sLabels).not.toContain('Lägg till-knapp');
  });

  it('clicking the dark appearance button persists to localStorage and adds the .dark class', async () => {
    const w = mount(AppSettingsPanel, { props: { variant: 'renderer' }, global: { plugins: [makeI18n()] } });
    const buttons = w.findAll('.settings-option');
    // Find by emoji content rather than position to survive markup tweaks
    const dark = buttons.find(b => b.text() === '🌙');
    expect(dark).toBeDefined();
    await dark!.trigger('click');
    expect(localStorage.getItem('slaktforskning-appearance')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    w.unmount();
  });

  it('clicking the forest theme button persists and applies theme-forest class', async () => {
    const w = mount(AppSettingsPanel, { props: { variant: 'renderer' }, global: { plugins: [makeI18n()] } });
    const forest = w.findAll('.settings-option').find(b => b.text() === '🌲');
    expect(forest).toBeDefined();
    await forest!.trigger('click');
    expect(localStorage.getItem('slaktforskning-theme')).toBe('forest');
    expect(document.documentElement.classList.contains('theme-forest')).toBe(true);
    w.unmount();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/app-settings-panel.test.ts`
Expected: FAIL with `Cannot find module '.../AppSettingsPanel.vue'` (component doesn't exist yet)

- [x] **Step 3: Commit the failing test**

```bash
git add tests/components/app-settings-panel.test.ts
git commit -m "test(components): component-shape spec for AppSettingsPanel"
```

---

### Task 2: Build `<AppSettingsPanel>` to pass the test

**Files:**
- Create: `src/renderer/components/AppSettingsPanel.vue`

- [x] **Step 1: Class-name collision check**

```bash
grep -RIn '\.app-settings-panel\b' src/renderer/styles/ src/renderer/components/ src/renderer/views/ | grep -v ':// '
```
Expected: no hits in `shared.css` or `tokens.css`. If a hit appears, choose a different root class. The `.settings-panel`, `.settings-toggle`, `.settings-row`, `.settings-option`, `.settings-group-label` classes referenced INSIDE the component already exist in `shared.css` — the component reuses them, doesn't redefine.

- [x] **Step 2: Write the component**

```vue
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
          <button :class="['settings-option', { active: navOrientation === 'vertical' }]" role="radio" :aria-checked="String(navOrientation === 'vertical')" @click="setNavOrientation('vertical')">{{ $t('settings.menuVertical') }}</button>
          <button :class="['settings-option', { active: navOrientation === 'horizontal' }]" role="radio" :aria-checked="String(navOrientation === 'horizontal')" @click="setNavOrientation('horizontal')">{{ $t('settings.menuHorizontal') }}</button>
        </div>
      </template>

      <div class="settings-group-label">{{ $t('settings.appearance') }}</div>
      <div class="settings-row" role="radiogroup" :aria-label="$t('settings.appearance')">
        <button :class="['settings-option', { active: appearance === 'light' }]" role="radio" :aria-checked="String(appearance === 'light')" @click="setAppearance('light')">☀</button>
        <button :class="['settings-option', { active: appearance === 'dark' }]" role="radio" :aria-checked="String(appearance === 'dark')" @click="setAppearance('dark')">🌙</button>
        <button :class="['settings-option', { active: appearance === 'contrast' }]" role="radio" :aria-checked="String(appearance === 'contrast')" @click="setAppearance('contrast')">👁</button>
      </div>

      <div class="settings-group-label">{{ $t('settings.theme') }}</div>
      <div class="settings-row" role="radiogroup" :aria-label="$t('settings.theme')">
        <button :class="['settings-option', { active: currentTheme === 'forest' }]" role="radio" :aria-checked="String(currentTheme === 'forest')" @click="setTheme('forest')">🌲</button>
        <button :class="['settings-option', { active: currentTheme === 'nordic' }]" role="radio" :aria-checked="String(currentTheme === 'nordic')" @click="setTheme('nordic')">❄️</button>
        <button :class="['settings-option', { active: currentTheme === 'twilight' }]" role="radio" :aria-checked="String(currentTheme === 'twilight')" @click="setTheme('twilight')">🌅</button>
      </div>

      <template v-if="variant === 'renderer'">
        <div class="settings-group-label">{{ $t('settings.addBtnStyle') }}</div>
        <div class="settings-row" role="radiogroup" :aria-label="$t('settings.addBtnStyle')">
          <button :class="['settings-option', { active: addBtnStyle === 'plus' }]" role="radio" :aria-checked="String(addBtnStyle === 'plus')" :title="$t('settings.addBtnPlus')" @click="setAddBtnStyle('plus')">＋</button>
          <button :class="['settings-option', { active: addBtnStyle === 'leaf' }]" role="radio" :aria-checked="String(addBtnStyle === 'leaf')" :title="$t('settings.addBtnLeaf')" @click="setAddBtnStyle('leaf')">🍃</button>
        </div>
      </template>

      <div class="settings-group-label">{{ $t('settings.textSize') }}</div>
      <div class="settings-row" role="radiogroup" :aria-label="$t('settings.textSize')">
        <button :class="['settings-option', { active: textSize === 'small' }]" role="radio" :aria-checked="String(textSize === 'small')" @click="setTextSize('small')">S</button>
        <button :class="['settings-option', { active: textSize === 'medium' }]" role="radio" :aria-checked="String(textSize === 'medium')" @click="setTextSize('medium')">M</button>
        <button :class="['settings-option', { active: textSize === 'large' }]" role="radio" :aria-checked="String(textSize === 'large')" @click="setTextSize('large')">L</button>
      </div>

      <div class="settings-group-label">{{ $t('settings.readAloud') }}</div>
      <div class="settings-row" role="radiogroup" :aria-label="$t('settings.readAloud')">
        <button :class="['settings-option', { active: screenReader.mode.value === 'off' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'off')" :aria-label="$t('settings.off')" @click="screenReader.setMode('off')">🔇</button>
        <button :class="['settings-option', { active: screenReader.mode.value === 'narrate' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'narrate')" :aria-label="$t('settings.narrate')" @click="screenReader.setMode('narrate')">🔊</button>
        <button :class="['settings-option', { active: screenReader.mode.value === 'screenReader' }]" role="radio" :aria-checked="String(screenReader.mode.value === 'screenReader')" :aria-label="$t('settings.screenReaderMode')" @click="screenReader.setMode('screenReader')">♿</button>
      </div>

      <div class="settings-group-label">{{ $t('settings.language') }}</div>
      <div class="settings-row" role="radiogroup" :aria-label="$t('settings.language')">
        <button :class="['settings-option', { active: locale === 'sv' }]" role="radio" :aria-checked="String(locale === 'sv')" @click="setLocale('sv')">Sv</button>
        <button :class="['settings-option', { active: locale === 'en' }]" role="radio" :aria-checked="String(locale === 'en')" @click="setLocale('en')">En</button>
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
function setTheme(t: Theme) {
  currentTheme.value = t;
  document.documentElement.classList.remove(...THEME_CLASSES);
  document.documentElement.classList.add(`theme-${t}`);
  localStorage.setItem('slaktforskning-theme', t);
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
```

- [x] **Step 3: Run the test and verify it passes**

Run: `npm test -- tests/components/app-settings-panel.test.ts`
Expected: PASS (4 tests).

- [x] **Step 4: Commit**

```bash
git add src/renderer/components/AppSettingsPanel.vue
git commit -m "feat(components): extract AppSettingsPanel shared between renderer + static"
```

---

### Task 3: Adopt `<AppSettingsPanel>` in renderer/App.vue (both vertical and horizontal blocks)

**Files:**
- Modify: `src/renderer/App.vue` — replace BOTH settings-panel sites (vertical sidebar block at ~lines 90–137, horizontal topbar block at ~lines 214–266) with `<AppSettingsPanel variant="renderer">`. Also delete the now-unused state refs and handlers (`appearance`, `currentTheme`, `textSize`, `navOrientation`, `addBtnStyle`, `setAppearance`, `setTheme`, `setTextSize`, `setNavOrientation`, `setAddBtnStyle`, `applyTextSize`, `APPEARANCE_I18N`, `TEXT_SIZE_I18N`, `THEME_CLASSES`, plus the `setLocale` helper that the component now owns) from the `<script setup>` block.

- [x] **Step 1: Identify what the rest of App.vue still needs from these refs**

Search for usage of each ref outside the soon-to-be-removed settings-panel markup:

```bash
grep -n "navOrientation\|appearance\|currentTheme\|textSize\|addBtnStyle" src/renderer/App.vue
```

Expected hits in App.vue OUTSIDE the deleted blocks: `:class="['app', 'app--' + navOrientation]"` on `<div class="app">` (line ~2), `v-if="navOrientation === 'vertical'"` on the nav element (line ~4), `v-else` on the topbar header (line ~141). Those usages stay; we need to keep a reactive `navOrientation` in App.vue. The simplest bridge: App.vue reads `localStorage.getItem('slaktforskning-nav-orientation')` into a local ref, and the `app-settings-changed` CustomEvent dispatched by AppSettingsPanel updates that ref. Add the listener in `onMounted` and clean up in `onUnmounted`.

- [x] **Step 2: Add the bridge ref in App.vue script**

Insert near the top of `<script setup>` (replacing the deleted `navOrientation` definition):

```ts
const navOrientation = ref<'vertical' | 'horizontal'>(
  (localStorage.getItem('slaktforskning-nav-orientation') as 'vertical' | 'horizontal') || 'vertical'
);
function onSettingsChanged(e: Event) {
  const ev = e as CustomEvent<{ key: string; value: string }>;
  if (ev.detail?.key === 'navOrientation') navOrientation.value = ev.detail.value as 'vertical' | 'horizontal';
}
onMounted(() => window.addEventListener('app-settings-changed', onSettingsChanged));
onUnmounted(() => window.removeEventListener('app-settings-changed', onSettingsChanged));
```

Delete the corresponding old `navOrientation` ref, `setNavOrientation()` function, the inline localStorage setup that lived in `onMounted`, and the `setTheme/setAppearance/setTextSize/setAddBtnStyle/applyTextSize` definitions plus their `onMounted` calls — the component now owns all of those.

- [x] **Step 3: Replace the vertical-sidebar settings block**

In the template, find the block starting around line 90 (`<div class="settings-section">`) and ending around line 137 (`</div>` matching that section). Replace with:

```vue
<AppSettingsPanel variant="renderer" />
```

Add the import at the top of `<script setup>`:

```ts
import AppSettingsPanel from './components/AppSettingsPanel.vue';
```

- [x] **Step 4: Replace the horizontal-topbar settings block**

In the template, find the block at ~lines 214–266 (`<div class="topbar-settings">` containing a settings-panel). Replace the inner `<div v-if="isSettingsOpen" class="settings-panel topbar-settings-panel">...</div>` content with `<AppSettingsPanel variant="renderer" />` — leaving the surrounding `<div class="topbar-settings">` wrapper that positions it. The component renders its own `.settings-toggle` button; remove the `<button class="topbar-settings-toggle">` wrapper and its `isSettingsOpen` toggling. (The component owns `isOpen` internally.)

After this edit, the only remaining usage of `isSettingsOpen` in App.vue should be zero — delete the `const isSettingsOpen = ref(false)` declaration too.

- [x] **Step 5: Run unit tests**

Run: `npm test -- tests/components`
Expected: all green. Existing tests must not regress; the new AppSettingsPanel test still passes.

- [x] **Step 6: Smoke the running app**

Run: `npm start`. Open the app, click 🎨 in vertical sidebar — settings panel opens, every row works (toggle dark mode, switch theme, change text size). Switch nav orientation to horizontal — same panel works in the topbar. Restart app — settings persisted. Close.

- [x] **Step 7: Commit**

```bash
git add src/renderer/App.vue
git commit -m "refactor(renderer): adopt AppSettingsPanel in vertical sidebar + horizontal topbar"
```

---

### Task 4: Adopt `<AppSettingsPanel>` in static/App.vue

**Files:**
- Modify: `src/static/App.vue` — settings block (~lines 36–67) replaced by `<AppSettingsPanel variant="static">`. Delete the corresponding refs/handlers (`appearance`, `currentTheme`, `textSize`, `setAppearance`, `setTheme`, `setTextSize`, `applyTextSize`, `APPEARANCE_I18N`, `TEXT_SIZE_I18N`, `THEME_CLASSES`, `setLocale`, `isSettingsOpen`) from `<script setup>`.

- [x] **Step 1: Import + replace the block**

In `<script setup>` add:

```ts
import AppSettingsPanel from '../renderer/components/AppSettingsPanel.vue';
```

In template, replace `<div class="settings-section">…</div>` with `<AppSettingsPanel variant="static" />`. Delete the deprecated script state listed above.

- [x] **Step 2: Run static SPA in dev**

Run: `npm run dev:static`. Open http://localhost:5174 — confirm settings panel works (light/dark, theme, text size, read aloud, language). Renderer-only rows (menu layout, add-button style) are NOT shown. Refresh — settings persist. Close.

- [x] **Step 3: Run the existing unit/component test suite**

Run: `npm test`
Expected: green.

- [x] **Step 4: Commit**

```bash
git add src/static/App.vue
git commit -m "refactor(static): adopt AppSettingsPanel"
```

---

### Task 5: Structural test for `<AppSidebar>` (TDD)

**Files:**
- Create: `tests/components/app-sidebar-shape.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import AppSidebar from '../../src/renderer/components/AppSidebar.vue';
import type { NavSectionDef } from '../../src/renderer/components/AppSidebarTypes';

function makeI18n() {
  return createI18n({
    legacy: false,
    locale: 'sv',
    messages: {
      sv: {
        app: { title: 'Släktforskning' },
        a11y: { skipToMain: 'Hoppa till huvudinnehåll', settings: 'Inställningar' },
        nav: { research: 'Forska', people: 'Personer', search: 'Sök' },
        places: { title: 'Platser' }, media: { nav: 'Media' },
        settings: { appearance: 'Utseende', theme: 'Tema', textSize: 'Textstorlek', readAloud: 'Läs upp', language: 'Språk', menuLayout: 'Menyläge', addBtnStyle: 'Lägg till-knapp', menuVertical: 'V', menuHorizontal: 'H', textSizeSmall: 'S', textSizeMedium: 'M', textSizeLarge: 'L', off: 'Av', narrate: 'B', screenReaderMode: 'SR', lightMode: 'L', darkMode: 'D', contrastMode: 'HK', addBtnPlus: 'P', addBtnLeaf: 'L' },
      },
      en: {},
    },
  });
}

function makeRouter() {
  return createRouter({ history: createWebHashHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }] });
}

const STATIC_SECTIONS: NavSectionDef[] = [{
  key: 'main',
  items: [
    { to: '/', icon: '👤', labelKey: 'nav.people' },
    { to: '/places', icon: '📍', labelKey: 'places.title' },
    { to: '/media', icon: '📷', labelKey: 'media.nav' },
    { to: '/search', icon: '🔍', labelKey: 'nav.search' },
  ],
}];

const RENDERER_SECTIONS: NavSectionDef[] = [{
  key: 'research',
  labelKey: 'nav.research',
  items: [
    { to: '/', icon: '👤', labelKey: 'nav.people' },
    { to: '/places', icon: '📍', labelKey: 'places.title' },
    { to: '/media', icon: '📷', labelKey: 'media.nav' },
    { to: '/search', icon: '🔍', labelKey: 'nav.search' },
  ],
}];

describe('AppSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('renders the same outer chrome for renderer and static section sets', async () => {
    const router = makeRouter();
    await router.isReady();
    const w = mount(AppSidebar, {
      props: { sections: STATIC_SECTIONS, variant: 'static' },
      global: { plugins: [makeI18n(), router] },
    });
    expect(w.find('nav.sidebar').exists()).toBe(true);
    expect(w.find('.sidebar-header').exists()).toBe(true);
    expect(w.find('.sidebar-title').text()).toContain('Släktforskning');
    expect(w.find('.sidebar-spacer').exists()).toBe(true);
    expect(w.findAll('.nav-item').length).toBe(4);
    expect(w.findComponent({ name: 'AppSettingsPanel' }).exists()).toBe(true);
    w.unmount();
  });

  it('renders section labels when a section has labelKey', async () => {
    const router = makeRouter();
    await router.isReady();
    const w = mount(AppSidebar, {
      props: { sections: RENDERER_SECTIONS, variant: 'renderer' },
      global: { plugins: [makeI18n(), router] },
    });
    expect(w.findAll('.nav-section-label').map(n => n.text())).toEqual(['Forska']);
    w.unmount();
  });

  it('renders a #bottom slot consumer above the settings panel', async () => {
    const router = makeRouter();
    await router.isReady();
    const w = mount(AppSidebar, {
      props: { sections: STATIC_SECTIONS, variant: 'renderer' },
      slots: { bottom: '<div class="test-bottom-slot">undo</div>' },
      global: { plugins: [makeI18n(), router] },
    });
    expect(w.find('.test-bottom-slot').exists()).toBe(true);
    // settings panel must come AFTER the slot in DOM order
    const html = w.html();
    expect(html.indexOf('test-bottom-slot')).toBeLessThan(html.indexOf('settings-section'));
    w.unmount();
  });
});
```

- [x] **Step 2: Run, verify fail**

Run: `npm test -- tests/components/app-sidebar-shape.test.ts`
Expected: FAIL — `Cannot find module '.../AppSidebar.vue'`.

- [x] **Step 3: Commit failing test**

```bash
git add tests/components/app-sidebar-shape.test.ts
git commit -m "test(components): structural spec for AppSidebar"
```

---

### Task 6: Build `<AppSidebar>` to pass the test

**Files:**
- Create: `src/renderer/components/AppSidebarTypes.ts`
- Create: `src/renderer/components/AppSidebar.vue`

- [x] **Step 1: Class-name collision check**

```bash
grep -RIn '\.app-sidebar\b' src/renderer/styles/ src/renderer/components/ src/renderer/views/ | grep -v ':// '
```
Expected: no hits.

- [x] **Step 2: Create the types file**

`src/renderer/components/AppSidebarTypes.ts`:

```ts
import type { Ref } from 'vue';

export interface NavItemDef {
  to: string;
  icon: string;
  labelKey: string;
  badge?: Ref<number> | { value: number };
  ariaLabel?: string;
}

export interface NavSectionDef {
  key: string;
  labelKey?: string;
  items: NavItemDef[];
}
```

- [x] **Step 3: Create the component**

`src/renderer/components/AppSidebar.vue`:

```vue
<template>
  <nav class="sidebar" aria-label="Main navigation">
    <a href="#main-content" class="skip-link">{{ $t('a11y.skipToMain') }}</a>
    <div class="sidebar-header">
      <span class="sidebar-title">🌿 {{ $t('app.title') }}</span>
    </div>

    <template v-for="sec in sections" :key="sec.key">
      <h2 v-if="sec.labelKey" class="nav-section-label">{{ $t(sec.labelKey) }}</h2>
      <router-link
        v-for="item in sec.items"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :aria-label="item.ariaLabel ?? $t(item.labelKey)"
      >
        <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
        <span class="nav-label">{{ $t(item.labelKey) }}</span>
        <span v-if="badgeValue(item) > 0" class="error-badge">{{ badgeValue(item) }}</span>
      </router-link>
    </template>

    <div class="sidebar-spacer"></div>

    <slot name="bottom" />

    <AppSettingsPanel :variant="variant" />
  </nav>
</template>

<script setup lang="ts">
import AppSettingsPanel from './AppSettingsPanel.vue';
import type { NavItemDef, NavSectionDef } from './AppSidebarTypes';

defineProps<{
  sections: NavSectionDef[];
  variant: 'renderer' | 'static';
}>();

function badgeValue(item: NavItemDef): number {
  if (!item.badge) return 0;
  return typeof item.badge === 'object' && 'value' in item.badge ? item.badge.value : 0;
}
</script>
```

The skip-link inside `<nav>` is a structural change from the current layout (today the skip-link sits as a sibling of `<nav>` in App.vue:3). Confirm in the next task that the skip-link still works at the App level — if a screen-reader test breaks, move the skip-link back out of `<nav>` and into a `#skip` slot.

- [x] **Step 4: Run the test**

Run: `npm test -- tests/components/app-sidebar-shape.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add src/renderer/components/AppSidebar.vue src/renderer/components/AppSidebarTypes.ts
git commit -m "feat(components): AppSidebar shared chrome for renderer + static"
```

---

### Task 7: Adopt `<AppSidebar>` in renderer/App.vue (vertical mode only)

**Files:**
- Modify: `src/renderer/App.vue` — replace the entire `<nav v-if="navOrientation === 'vertical'" class="sidebar">…</nav>` block (~lines 4–138) with `<AppSidebar :sections="navSections" variant="renderer">` + `#bottom` slot containing the undo row + the import-export router-link + the settings router-link.

- [x] **Step 1: Make `navSections` cover ALL items including the bottom-bar links**

Today the `navSections` computed (App.vue:514–554) covers only the 4 grouped sections (research/organize/review/present). The import-export + settings links live as separate `<router-link class="nav-bottom-item">` after the undo row (App.vue:82–89). For the vertical-sidebar use we keep that structure: top sections come from `:sections`, bottom-link-cluster goes into the `#bottom` slot.

If `navSections`'s shape currently includes badges as `Ref<number>` (e.g. `badge: openTaskCount`), the `NavItemDef.badge` shape in `AppSidebarTypes.ts` already supports this — no migration needed.

- [x] **Step 2: Replace the vertical-sidebar block**

In the template, replace the entire `<nav v-if="navOrientation === 'vertical'" class="sidebar">…</nav>` (everything from line ~4 up to and including the `</nav>` that closes it at ~line 138, but BEFORE the `<header v-else class="topbar">` at line 141) with:

```vue
<AppSidebar v-if="navOrientation === 'vertical'" :sections="navSections" variant="renderer">
  <template #bottom>
    <div class="undo-row" role="group" :aria-label="$t('undo.toolbar')">
      <button type="button" class="undo-btn" :disabled="!undoState.canUndo" :aria-label="undoTooltip" :title="undoTooltip" @click="doUndo">↶</button>
      <button type="button" class="undo-btn" :disabled="!undoState.canRedo" :aria-label="redoTooltip" :title="redoTooltip" @click="doRedo">↷</button>
    </div>
    <router-link to="/import-export" class="nav-item nav-bottom-item" :aria-label="$t('nav.importExport')">
      <span class="nav-icon" aria-hidden="true">📦</span>
      <span class="nav-label">{{ $t('nav.importExport') }}</span>
    </router-link>
    <router-link to="/settings" class="nav-item nav-bottom-item" :aria-label="$t('nav.settings')">
      <span class="nav-icon" aria-hidden="true">⚙️</span>
      <span class="nav-label">{{ $t('nav.settings') }}</span>
    </router-link>
  </template>
</AppSidebar>
```

The skip-link at line 3 (`<a href="#main-content" class="skip-link">`) is now rendered INSIDE `<AppSidebar>` (Task 6 Step 3). Delete the line 3 copy in App.vue.

- [x] **Step 3: Run all renderer-relevant tests**

```bash
npm test
```
Expected: pre-existing tests still pass; new AppSidebar/AppSettingsPanel tests pass; no regressions.

- [x] **Step 4: Manual smoke in `npm start`**

Verify: vertical sidebar still renders correctly with all nav items, badges (Quality count, Tasks count, Duplicates count) appear and update after a known-mutating action, undo/redo buttons work, settings panel toggles, both keyboard shortcuts work (skip-link via Tab, Cmd+F still focuses search if used elsewhere), router-link active state shows on the current route. Switch to horizontal nav orientation in settings — the topbar still works because we deliberately left it inline.

- [x] **Step 5: Commit**

```bash
git add src/renderer/App.vue
git commit -m "refactor(renderer): adopt AppSidebar for vertical mode"
```

---

### Task 8: Adopt `<AppSidebar>` in static/App.vue

**Files:**
- Modify: `src/static/App.vue` — replace the entire `<nav class="sidebar">…</nav>` block (~lines 4–68) with `<AppSidebar :sections="navSections" variant="static" />`. Define `navSections` in `<script setup>`. Delete the `<form class="sidebar-search">` input form, `searchQuery`, `searchInputRef`, `submitSearch`, `handleGlobalKey`, and the Cmd/Ctrl+F mount/unmount listeners.

- [x] **Step 1: Define `navSections` for static**

In `<script setup>` add (replacing deleted search state):

```ts
import AppSidebar from '../renderer/components/AppSidebar.vue';
import type { NavSectionDef } from '../renderer/components/AppSidebarTypes';

const navSections: NavSectionDef[] = [{
  key: 'main',
  items: [
    { to: '/', icon: '👤', labelKey: 'nav.people' },
    { to: '/places', icon: '📍', labelKey: 'places.title' },
    { to: '/media', icon: '📷', labelKey: 'media.nav' },
    { to: '/search', icon: '🔍', labelKey: 'nav.search' },
  ],
}];
```

- [x] **Step 2: Replace template**

```vue
<template>
  <div class="app">
    <AppSidebar :sections="navSections" variant="static" />
    <main id="main-content" :class="['content', { 'content-paneled': isPaneledView }]">
      <router-view v-slot="{ Component, route }">
        <keep-alive :include="CACHED_VIEWS">
          <component :is="Component" :key="CACHED_VIEWS.includes(route.name as string) ? (route.name as string) : route.fullPath" />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>
```

Delete: the `<a href="#main-content" class="skip-link">` line (now rendered inside AppSidebar) and the entire previous `<nav class="sidebar">…</nav>` block.

- [x] **Step 3: Delete from `<script setup>`**

Remove: `searchQuery`, `searchInputRef`, `submitSearch`, `handleGlobalKey`, the `window.addEventListener('keydown', handleGlobalKey)` and matching removeEventListener. Also remove the `useTTS`/`useScreenReaderMode` calls if they're now only used by `provide` calls that no view consumes — but keep them if other static views still use them via `inject`. Run `grep -rn "inject\\('tts'\\|inject\\('screenReader'" src/static src/renderer/views` to check.

- [x] **Step 4: Verify static SPA still works**

Run: `npm run dev:static`. Open http://localhost:5174. Sidebar renders with 4 items including the 🔍 Sök router-link. Clicking Sök routes to `/search` (which the existing SearchView handles). Settings panel works. Theme + dark mode + text size persist + apply.

- [x] **Step 5: Run the unit + component test suite**

```bash
npm test
```
Expected: green.

- [x] **Step 6: Commit**

```bash
git add src/static/App.vue
git commit -m "refactor(static): adopt AppSidebar and drop bespoke search input"
```

---

### Task 9: Verification + close-out

- [x] **Step 1: Run `npm test` and capture summary**

```bash
npm test 2>&1 | tail -20
```
Capture the `Test Files  N passed` and `Tests  N passed` lines.

- [x] **Step 2: Run `npm run build` and capture tail**

```bash
npm run build 2>&1 | tail -20
```
Capture the `built in Xs` line and exit code (`echo $?`).

- [x] **Step 3: Run `npm run test:e2e:full` and capture summary**

```bash
npm run test:e2e:full 2>&1 | tail -20
```
Capture the `N passed (Xs)` line across all 7 projects. Both `[panels]` and `[reactivity]` must pass — the sidebar change touches the App-level chrome that hosts every paneled route in `PANELED_ROUTES`.

If any project goes red, fix the cause before continuing. "It was red before this plan" is not acceptable per `.claude/rules/plans.md` L7.

- [x] **Step 4: Type-check the touched files**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "(App|AppSidebar|AppSettingsPanel)\.vue" || echo "no new TS errors in touched files"
```
Expected: "no new TS errors in touched files" or only pre-existing errors documented in `.claude/rules/build.md`.

- [x] **Step 5: Side-by-side visual check**

Open `npm start` and `npm run dev:static` simultaneously. Set both to the same Forest theme + light mode + medium text. Compare the vertical sidebars:
- Header band identical
- Nav items: identical typography, identical spacing, identical hover/active states
- Settings panel: identical chrome (and identical content modulo the 2 renderer-extra rows)
- Width identical (220px)
- Scroll behavior identical when sections overflow

Mark this in the close-out commit message: "visually verified: renderer + static sidebars match in vertical mode, all themes."

- [x] **Step 6: Mark every checkbox in this plan file `[x]`**

```bash
# Open this file in editor, replace every "- [x]" with "- [x]"
```

- [x] **Step 7: Archive the plan**

```bash
git mv docs/plans/2026-05-15-shared-app-sidebar.md docs/plans/archive/
```

- [x] **Step 8: Update PLAN.md and CHANGELOG.md**

- Remove any reference to this plan from `docs/PLAN.md`'s active list (it wasn't in there, but check).
- Append a one-paragraph entry under the appropriate section in `docs/plans/archive/PLAN.md`.
- Bump `package.json` version: feature (minor bump per project rule).
- Add a line to `CHANGELOG.md` under `## Unreleased`: `Refactor: share <AppSidebar> and <AppSettingsPanel> between the Tauri app and the static export SPA so they stay in visual + behavioural sync automatically.`

- [x] **Step 9: Close-out commit with evidence**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: archive shared-app-sidebar plan (v0.X.Y)

Verification evidence:
- npm test: <paste line>
- npm run build: <paste line, exit 0>
- npm run test:e2e:full: <paste line across 7 projects>
- vue-tsc: no new errors in touched files
- Side-by-side: renderer + static sidebars match in vertical mode (all themes)

EOF
)"
```

- [x] **Step 10: Push to main**

Per `.claude/rules/plans.md` L6: direct push to `origin/main` requires local-green-before-push (we've captured the evidence above). Either merge the worktree branch to `main` and push `main` itself (NOT the feature branch as `origin/main`), or push a PR — both are fine; the rule is the verification, not the path.

```bash
git push origin main
```
