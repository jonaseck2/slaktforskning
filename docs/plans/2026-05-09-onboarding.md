# First-time Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use `subagent-handoff` for dispatch.

**Goal:** Every panel section shows a Purpose-stated empty state on a fresh DB, and four enumerated coachmarks (Hourglass focus, media reorder, face tagging, first media attach) self-explain on first encounter — fixing the discovery gaps Bengt's beta feedback exposed.

**Architecture:** A new `useFirstEncounter(key)` composable reads/writes per-installation seen-state in `settings.json` (NOT per-DB — Bengt switches DBs). The existing `SectionEmpty` component grows a `purposeKey` mode that pulls Purpose copy already curated in `docs/UX_INVENTORY.md`. A new `Coachmark` component anchors to a real DOM element, auto-dismisses on the gestured action, and shows once per installation. Coverage is enforced by `panel-empty-state-coverage.test.ts` so future sections cannot ship without empty-state copy.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest, Playwright. Settings persistence via the existing `src/main/settings.ts` (JSON file in `userData`). IPC via the typed channel registry in `src/shared/channels/`. i18n via `src/renderer/i18n/{sv,en}.ts`.

**Spec:** [docs/plans/2026-05-09-onboarding-design.md](2026-05-09-onboarding-design.md) — read this first.

---

## Self-review checklist

- [ ] Every step in this plan checked off.
- [ ] Every Purpose-keyed empty-state copy exists in BOTH `sv.ts` and `en.ts`.
- [ ] `panel-empty-state-coverage.test.ts` is green and asserts every section component carries an empty-state (or a documented `<!-- Empty-state coaching N/A: ... -->` deviation).
- [ ] All 4 coachmarks verified manually by the user against a fresh `settings.json`.
- [ ] `npm run lint` and `npm test` are green.
- [ ] WCAG contrast tests still green (`tests/unit/wcagContrast.test.ts`).
- [ ] No new component class names collide with `shared.css` (mandatory check from `renderer.md`).
- [ ] `docs/UX_INVENTORY.md` Purpose statements are filled for every section that received empty-state copy in this plan; no `Purpose: TBD` rows remain in surfaces touched here.
- [ ] Plan archived to `docs/plans/archive/`, `docs/PLAN.md` updated, version bumped, `CHANGELOG.md` updated.

---

## Phase 1 — Foundation

### Task 1: Extend `AppSettings` with onboarding slice

**Files:**
- Modify: `src/main/settings.ts`
- Test: `tests/unit/settings.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/settings.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/sf-test-settings' },
}));

import { loadSettings, saveSettings, type AppSettings } from '../../src/main/settings';

const dir = '/tmp/sf-test-settings';

beforeEach(() => {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
});

describe('AppSettings onboarding', () => {
  it('returns empty onboarding.seen on first load', () => {
    const s = loadSettings();
    expect(s.onboarding).toEqual({ seen: {} });
  });

  it('round-trips onboarding.seen via save + load', () => {
    const original: AppSettings = {
      recentDatabases: [],
      onboarding: { seen: { 'coach.hourglass.focus': true } },
    };
    saveSettings(original);
    const loaded = loadSettings();
    expect(loaded.onboarding.seen['coach.hourglass.focus']).toBe(true);
  });

  it('tolerates a settings file with no onboarding key (forward-compat)', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ recentDatabases: [] }));
    const s = loadSettings();
    expect(s.onboarding).toEqual({ seen: {} });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npx vitest run tests/unit/settings.test.ts
```
Expected: FAIL — `s.onboarding` is `undefined`.

- [ ] **Step 3: Update `AppSettings`**

Replace `src/main/settings.ts` contents with:

```ts
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

export interface OnboardingState {
  seen: Record<string, true>;
}

export interface AppSettings {
  lastDatabase?: string;
  recentDatabases: string[];
  onboarding: OnboardingState;
}

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

const defaultOnboarding = (): OnboardingState => ({ seen: {} });

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const onboarding = parsed.onboarding && typeof parsed.onboarding === 'object'
      ? { seen: { ...((parsed.onboarding as OnboardingState).seen ?? {}) } }
      : defaultOnboarding();
    return {
      lastDatabase: parsed.lastDatabase,
      recentDatabases: Array.isArray(parsed.recentDatabases) ? parsed.recentDatabases : [],
      onboarding,
    };
  } catch {
    return { recentDatabases: [], onboarding: defaultOnboarding() };
  }
}

export function saveSettings(s: AppSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf-8');
}
```

- [ ] **Step 4: Run the test, verify pass**

```bash
npx vitest run tests/unit/settings.test.ts
```
Expected: PASS.

- [ ] **Step 5: Run the full unit suite to catch downstream consumers**

```bash
npm test -- --run
```
Expected: PASS. If any consumer of `AppSettings` breaks because the old type didn't have `onboarding`, fix the consumer to pass `onboarding: { seen: {} }` or call `defaultOnboarding()`.

- [ ] **Step 6: Commit**

```bash
git add src/main/settings.ts tests/unit/settings.test.ts
git commit -m "feat(settings): add onboarding.seen slice"
```

---

### Task 2: IPC channels for onboarding

**Files:**
- Create: `src/shared/channels/onboarding.ts`
- Modify: `src/shared/channels/index.ts` (export new channels)
- Create: `src/main/ipc/onboarding.ts` (handler)
- Modify: `src/main/ipc/index.ts` or wherever channels are registered (search for an existing channel registration to see the pattern)
- Test: `tests/unit/ipc/onboarding.test.ts`

- [ ] **Step 1: Inspect an existing channel file to learn the pattern**

```bash
ls src/shared/channels/
cat src/shared/channels/database.ts || cat src/shared/channels/settings.ts || ls src/shared/channels/ | head -1 | xargs -I {} cat src/shared/channels/{}
```

Use the same `defineChannel(...)` shape that the rest of the codebase uses.

- [ ] **Step 2: Write the channel definitions**

Create `src/shared/channels/onboarding.ts`:

```ts
import { defineChannel } from './_define'; // adjust import to match the project's existing helper

export const onboardingGetSeen = defineChannel<void, Record<string, true>>('onboarding:getSeen');
export const onboardingMarkSeen = defineChannel<{ key: string }, void>('onboarding:markSeen');
export const onboardingReset = defineChannel<void, void>('onboarding:reset');
```

(If the helper signature differs, mirror exactly what e.g. `database.ts` or `settings.ts` does — same import path, same generic ordering.)

- [ ] **Step 3: Register the new channels in the index**

Add the three exports to `src/shared/channels/index.ts` mirroring whatever the existing per-domain re-exports look like.

- [ ] **Step 4: Write the failing handler test**

```ts
// tests/unit/ipc/onboarding.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/sf-test-onboarding-ipc' } }));

import { handleOnboardingGetSeen, handleOnboardingMarkSeen, handleOnboardingReset } from '../../../src/main/ipc/onboarding';

beforeEach(() => {
  if (fs.existsSync('/tmp/sf-test-onboarding-ipc')) {
    fs.rmSync('/tmp/sf-test-onboarding-ipc', { recursive: true });
  }
});

describe('onboarding IPC handlers', () => {
  it('getSeen returns {} on empty', () => {
    expect(handleOnboardingGetSeen()).toEqual({});
  });

  it('markSeen persists a key, getSeen returns it', () => {
    handleOnboardingMarkSeen({ key: 'coach.hourglass.focus' });
    expect(handleOnboardingGetSeen()).toEqual({ 'coach.hourglass.focus': true });
  });

  it('reset clears all keys', () => {
    handleOnboardingMarkSeen({ key: 'a' });
    handleOnboardingMarkSeen({ key: 'b' });
    handleOnboardingReset();
    expect(handleOnboardingGetSeen()).toEqual({});
  });
});
```

- [ ] **Step 5: Run the test, verify it fails**

```bash
npx vitest run tests/unit/ipc/onboarding.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 6: Implement the handler**

```ts
// src/main/ipc/onboarding.ts
import { loadSettings, saveSettings } from '../settings';

export function handleOnboardingGetSeen(): Record<string, true> {
  return loadSettings().onboarding.seen;
}

export function handleOnboardingMarkSeen({ key }: { key: string }): void {
  const s = loadSettings();
  s.onboarding.seen[key] = true;
  saveSettings(s);
}

export function handleOnboardingReset(): void {
  const s = loadSettings();
  s.onboarding.seen = {};
  saveSettings(s);
}
```

- [ ] **Step 7: Wire the handlers into the channel registration site**

Find the existing IPC registration site (search for a sibling handler — e.g. `grep -rn "ipcMain.handle" src/main/`) and register the three channels there following the same pattern.

- [ ] **Step 8: Run the test, verify pass**

```bash
npx vitest run tests/unit/ipc/onboarding.test.ts
```
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/shared/channels/onboarding.ts src/shared/channels/index.ts src/main/ipc/onboarding.ts src/main/ipc/index.ts tests/unit/ipc/onboarding.test.ts
git commit -m "feat(ipc): onboarding getSeen / markSeen / reset channels"
```

---

### Task 3: Preload bridge

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/api.d.ts`
- Test: rerun `tests/unit/preload-coverage.test.ts` to confirm parity

- [ ] **Step 1: Add the API surface to the preload contextBridge**

In `src/preload/index.ts`, find the existing `window.api` map (it's a hand-maintained `contextBridge.exposeInMainWorld` block per CLAUDE.md). Add:

```ts
onboarding: {
  getSeen: () => ipcRenderer.invoke('onboarding:getSeen') as Promise<Record<string, true>>,
  markSeen: (key: string) => ipcRenderer.invoke('onboarding:markSeen', { key }) as Promise<void>,
  reset: () => ipcRenderer.invoke('onboarding:reset') as Promise<void>,
},
```

- [ ] **Step 2: Update the renderer typing**

In `src/renderer/api.d.ts`, find the `interface SläktforskningApi` (or similarly-named) declaration and add:

```ts
onboarding: {
  getSeen(): Promise<Record<string, true>>;
  markSeen(key: string): Promise<void>;
  reset(): Promise<void>;
};
```

- [ ] **Step 3: Run preload-coverage test**

```bash
npx vitest run tests/unit/preload-coverage.test.ts
```
Expected: PASS. (This test asserts every channel in `src/shared/channels/` has a corresponding `window.api.*` entry in preload.)

If it fails, adjust the preload mapping until the test passes — that's the parity contract.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/api.d.ts
git commit -m "feat(preload): expose window.api.onboarding"
```

---

### Task 4: `useFirstEncounter` composable

**Files:**
- Create: `src/renderer/composables/useFirstEncounter.ts`
- Test: `tests/components/useFirstEncounter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/components/useFirstEncounter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { useFirstEncounter } from '../../src/renderer/composables/useFirstEncounter';

const seenStore: Record<string, true> = {};
const apiMock = {
  onboarding: {
    getSeen: vi.fn(async () => ({ ...seenStore })),
    markSeen: vi.fn(async (key: string) => {
      seenStore[key] = true;
    }),
    reset: vi.fn(async () => {
      for (const k of Object.keys(seenStore)) delete seenStore[k];
    }),
  },
};

beforeEach(() => {
  for (const k of Object.keys(seenStore)) delete seenStore[k];
  apiMock.onboarding.getSeen.mockClear();
  apiMock.onboarding.markSeen.mockClear();
  (globalThis as { window: { api: typeof apiMock } }).window = { api: apiMock };
});

const Probe = defineComponent({
  props: ['k'],
  setup(props) {
    const enc = useFirstEncounter(props.k as string);
    return () => h('div', {}, [
      h('span', { 'data-test': 'seen' }, String(enc.seen.value)),
      h('button', { 'data-test': 'mark', onClick: enc.markSeen }, 'mark'),
    ]);
  },
});

describe('useFirstEncounter', () => {
  it('starts unseen, transitions to seen after markSeen()', async () => {
    const w = mount(Probe, { props: { k: 'coach.test.alpha' } });
    await flushPromises();
    expect(w.get('[data-test="seen"]').text()).toBe('false');
    await w.get('[data-test="mark"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-test="seen"]').text()).toBe('true');
    expect(apiMock.onboarding.markSeen).toHaveBeenCalledWith('coach.test.alpha');
  });

  it('reflects already-seen state from settings', async () => {
    seenStore['coach.test.beta'] = true;
    const w = mount(Probe, { props: { k: 'coach.test.beta' } });
    await flushPromises();
    expect(w.get('[data-test="seen"]').text()).toBe('true');
  });

  it('two instances of the same key share state', async () => {
    const w1 = mount(Probe, { props: { k: 'coach.test.gamma' } });
    const w2 = mount(Probe, { props: { k: 'coach.test.gamma' } });
    await flushPromises();
    await w1.get('[data-test="mark"]').trigger('click');
    await flushPromises();
    expect(w2.get('[data-test="seen"]').text()).toBe('true');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npx vitest run tests/components/useFirstEncounter.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the composable**

```ts
// src/renderer/composables/useFirstEncounter.ts
import { ref, type Ref, onMounted } from 'vue';

const cache = new Map<string, Ref<boolean>>();
let snapshotPromise: Promise<Record<string, true>> | null = null;

function loadSnapshot(): Promise<Record<string, true>> {
  if (!snapshotPromise) {
    snapshotPromise = window.api?.onboarding?.getSeen?.() ?? Promise.resolve({});
  }
  return snapshotPromise;
}

export function useFirstEncounter(key: string) {
  let seenRef = cache.get(key);
  if (!seenRef) {
    seenRef = ref(false);
    cache.set(key, seenRef);
  }

  onMounted(async () => {
    const snap = await loadSnapshot();
    if (snap[key]) seenRef!.value = true;
  });

  async function markSeen(): Promise<void> {
    if (seenRef!.value) return;
    seenRef!.value = true;
    try {
      await window.api?.onboarding?.markSeen?.(key);
    } catch (err) {
      console.error('[useFirstEncounter] markSeen failed:', err);
    }
  }

  return { seen: seenRef as Ref<boolean>, markSeen };
}

/** Test-only — clears the in-memory cache. Not exposed in production code paths. */
export function __resetForTests(): void {
  cache.clear();
  snapshotPromise = null;
}
```

- [ ] **Step 4: Run the test, verify pass**

```bash
npx vitest run tests/components/useFirstEncounter.test.ts
```
Expected: PASS.

- [ ] **Step 5: Add the test reset hook to beforeEach**

Update the test file's `beforeEach` to call `__resetForTests()` so the per-key cache doesn't leak between tests:

```ts
import { useFirstEncounter, __resetForTests } from '../../src/renderer/composables/useFirstEncounter';
// ...
beforeEach(() => {
  __resetForTests();
  // ...rest unchanged
});
```

Re-run; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/composables/useFirstEncounter.ts tests/components/useFirstEncounter.test.ts
git commit -m "feat(renderer): useFirstEncounter composable"
```

---

## Phase 2 — Components

### Task 5: Upgrade `SectionEmpty` with `purposeKey` mode

**Files:**
- Modify: `src/renderer/components/ui/SectionEmpty.vue`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts` (add the `onboarding` namespace)
- Test: `tests/components/SectionEmpty.test.ts`

- [ ] **Step 1: Class-name collision check**

```bash
grep -RIn '\.section-empty\b' src/renderer/styles/ src/renderer/components/ src/renderer/views/ | grep -v ':// '
```

The existing component already owns `.section-empty`. New additions in this task use BEM modifiers: `.section-empty--coaching`, `.section-empty__purpose`, `.section-empty__hint`. Re-run the grep with each new class name; rename if anything outside this component's `<style scoped>` claims them.

- [ ] **Step 2: Write the failing test**

```ts
// tests/components/SectionEmpty.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import SectionEmpty from '../../src/renderer/components/ui/SectionEmpty.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'sv',
  messages: {
    sv: {
      onboarding: {
        empty: {
          test: { purpose: 'Här ser du saker. Klicka för att lägga till.', cta: 'Lägg till' },
        },
      },
    },
  },
});

const opts = { global: { plugins: [i18n] } };

describe('SectionEmpty', () => {
  it('legacy message-only mode renders as before', () => {
    const w = mount(SectionEmpty, { props: { message: 'Inga poster.' }, ...opts });
    expect(w.text()).toContain('Inga poster.');
    expect(w.find('.section-empty--coaching').exists()).toBe(false);
  });

  it('purposeKey mode renders Purpose sentence + CTA button and emits action', async () => {
    const w = mount(SectionEmpty, {
      props: { purposeKey: 'onboarding.empty.test.purpose', actionLabelKey: 'onboarding.empty.test.cta' },
      ...opts,
    });
    expect(w.text()).toContain('Här ser du saker.');
    expect(w.find('.section-empty--coaching').exists()).toBe(true);
    await w.get('button.section-empty__action').trigger('click');
    expect(w.emitted('action')).toBeTruthy();
  });

  it('renders cta slot when provided (overrides actionLabelKey button)', () => {
    const w = mount(SectionEmpty, {
      props: { purposeKey: 'onboarding.empty.test.purpose' },
      slots: { cta: '<input data-test="picker" />' },
      ...opts,
    });
    expect(w.find('[data-test="picker"]').exists()).toBe(true);
    expect(w.find('button.section-empty__action').exists()).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
npx vitest run tests/components/SectionEmpty.test.ts
```
Expected: FAIL on the purposeKey-mode assertions.

- [ ] **Step 4: Update `SectionEmpty.vue`**

```vue
<template>
  <div :class="['section-empty', { 'section-empty--coaching': isCoachingMode }]">
    <template v-if="isCoachingMode">
      <p class="section-empty__purpose">{{ t(purposeKey!) }}</p>
      <p v-if="secondaryHintKey" class="section-empty__hint">{{ t(secondaryHintKey) }}</p>
      <slot name="cta">
        <button
          v-if="actionLabelKey"
          class="section-empty__action section-empty__action--primary"
          @click="$emit('action')"
        >
          {{ t(actionLabelKey) }}
        </button>
      </slot>
    </template>
    <template v-else>
      <span class="section-empty__text">{{ message }}</span>
      <button v-if="actionLabel" class="section-empty__action" @click="$emit('action')">
        {{ actionLabel }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  message?: string;
  actionLabel?: string;
  purposeKey?: string;
  actionLabelKey?: string;
  secondaryHintKey?: string;
}>();

defineEmits<{ action: [] }>();

const { t } = useI18n();
const isCoachingMode = computed(() => Boolean(props.purposeKey));
</script>

<style scoped>
.section-empty {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.section-empty--coaching {
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-md);
  text-align: center;
}

.section-empty__text {
  flex: 1;
}

.section-empty__purpose {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-base);
  line-height: 1.5;
  max-width: 48ch;
}

.section-empty__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
  max-width: 48ch;
}

.section-empty__action {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--accent);
  font-size: var(--font-sm);
  font-family: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  line-height: inherit;
}

.section-empty__action:hover {
  color: var(--accent-hover);
}

.section-empty__action--primary {
  padding: var(--space-sm) var(--space-md);
  background: var(--accent);
  color: var(--accent-text);
  border-radius: var(--radius-md);
  text-decoration: none;
}

.section-empty__action--primary:hover {
  background: var(--accent-hover);
  color: var(--accent-text);
}
</style>
```

- [ ] **Step 5: Add the `onboarding` i18n root in both locales**

In `src/renderer/i18n/sv.ts`, add (top-level next to other namespaces):
```ts
onboarding: {
  empty: { /* per-section keys land here in the per-panel tasks */ },
  coach: { /* coachmark keys land here in the coachmark tasks */ },
  toast: { /* toast keys land here */ },
  settings: {
    resetTitle: 'Återställ introduktionshjälpen',
    resetDescription: 'Visa instruktionsmeddelanden och vinjetter på nytt — som första gången du öppnade appen.',
    resetButton: 'Återställ',
    resetDoneToast: 'Introduktionen är återställd.',
  },
},
```

Same shape in `src/renderer/i18n/en.ts`:
```ts
onboarding: {
  empty: {},
  coach: {},
  toast: {},
  settings: {
    resetTitle: 'Reset onboarding hints',
    resetDescription: 'Show empty-state coaching and coachmarks again — like the first time you opened the app.',
    resetButton: 'Reset',
    resetDoneToast: 'Onboarding has been reset.',
  },
},
```

- [ ] **Step 6: Run the test, verify pass**

```bash
npx vitest run tests/components/SectionEmpty.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/ui/SectionEmpty.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts tests/components/SectionEmpty.test.ts
git commit -m "feat(ui): SectionEmpty purposeKey coaching mode"
```

---

### Task 6: New `Coachmark` component

**Files:**
- Create: `src/renderer/components/ui/Coachmark.vue`
- Modify: `src/renderer/styles/tokens.css` (add `--z-coachmark`)
- Test: `tests/components/Coachmark.test.ts`

- [ ] **Step 1: Class-name collision check**

```bash
grep -RIn '\.coachmark\b' src/renderer/styles/ src/renderer/components/ src/renderer/views/ | grep -v ':// '
```

Expected: no hits. If anything claims `.coachmark`, prefix the new classes with `sf-` (e.g. `.sf-coachmark`).

- [ ] **Step 2: Add z-index token**

In `src/renderer/styles/tokens.css`, add (next to other shape/shadow tokens):

```css
--z-coachmark: 950;  /* above panel content (~100), below modals (1000) */
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/components/Coachmark.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import Coachmark from '../../src/renderer/components/ui/Coachmark.vue';
import { __resetForTests } from '../../src/renderer/composables/useFirstEncounter';

const seenStore: Record<string, true> = {};
const apiMock = {
  onboarding: {
    getSeen: vi.fn(async () => ({ ...seenStore })),
    markSeen: vi.fn(async (key: string) => { seenStore[key] = true; }),
    reset: vi.fn(),
  },
};

const i18n = createI18n({
  legacy: false,
  locale: 'sv',
  messages: {
    sv: { onboarding: { coach: { test: { tip: 'Klicka för att titta. Dubbelklicka för att flytta fokus.', dismiss: 'Förstått' } } } },
  },
});

beforeEach(() => {
  for (const k of Object.keys(seenStore)) delete seenStore[k];
  __resetForTests();
  (globalThis as { window: { api: typeof apiMock } }).window = { api: apiMock };
});

const Host = defineComponent({
  components: { Coachmark },
  setup() {
    const anchor = ref<HTMLElement | null>(null);
    return { anchor };
  },
  template: `
    <div>
      <div ref="anchor" data-test="anchor" style="position: absolute; top: 100px; left: 100px; width: 50px; height: 50px;"></div>
      <Coachmark seen-key="coach.test.alpha" :anchor-el="anchor" tip-key="onboarding.coach.test.tip" dismiss-key="onboarding.coach.test.dismiss" />
    </div>
  `,
});

describe('Coachmark', () => {
  it('renders when unseen, hides when seen', async () => {
    const w = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    expect(w.find('.coachmark').exists()).toBe(true);
    expect(w.text()).toContain('Klicka för att titta');
  });

  it('hides if seen-key already in onboarding.seen', async () => {
    seenStore['coach.test.alpha'] = true;
    const w = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    expect(w.find('.coachmark').exists()).toBe(false);
  });

  it('clicking the dismiss button marks seen and hides', async () => {
    const w = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    await w.get('button.coachmark__dismiss').trigger('click');
    await flushPromises();
    expect(apiMock.onboarding.markSeen).toHaveBeenCalledWith('coach.test.alpha');
    expect(w.find('.coachmark').exists()).toBe(false);
  });

  it('has role=status and aria-live=polite', async () => {
    const w = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body });
    await flushPromises();
    const el = w.get('.coachmark').element;
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });
});
```

- [ ] **Step 4: Run the test, verify it fails**

```bash
npx vitest run tests/components/Coachmark.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the component**

```vue
<!-- src/renderer/components/ui/Coachmark.vue -->
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="root"
      class="coachmark"
      role="status"
      aria-live="polite"
      :style="positionStyle"
    >
      <p class="coachmark__tip">{{ t(tipKey) }}</p>
      <div class="coachmark__actions">
        <button class="coachmark__dismiss" type="button" @click="dismiss">
          {{ t(dismissKey) }}
        </button>
      </div>
      <span class="coachmark__arrow" :class="`coachmark__arrow--${placement}`" aria-hidden="true" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFirstEncounter } from '../../composables/useFirstEncounter';

const props = withDefaults(defineProps<{
  seenKey: string;
  anchorEl: HTMLElement | null;
  tipKey: string;
  dismissKey?: string;
  placement?: 'below' | 'above' | 'right' | 'left';
  autoDismissOn?: () => boolean;
}>(), {
  dismissKey: 'common.gotIt',
  placement: 'below',
});

const emit = defineEmits<{ dismissed: [] }>();

const { t } = useI18n();
const { seen, markSeen } = useFirstEncounter(props.seenKey);
const root = ref<HTMLElement | null>(null);
const positionStyle = ref<CSSProperties>({});

const visible = computed(() => !seen.value && props.anchorEl != null);

async function dismiss() {
  await markSeen();
  emit('dismissed');
}

function reposition() {
  if (!props.anchorEl) return;
  const rect = props.anchorEl.getBoundingClientRect();
  const off = 10;
  const style: CSSProperties = { position: 'fixed', zIndex: 'var(--z-coachmark)' };
  if (props.placement === 'below') {
    style.top = `${rect.bottom + off}px`;
    style.left = `${rect.left + rect.width / 2}px`;
    style.transform = 'translateX(-50%)';
  } else if (props.placement === 'above') {
    style.bottom = `${window.innerHeight - rect.top + off}px`;
    style.left = `${rect.left + rect.width / 2}px`;
    style.transform = 'translateX(-50%)';
  } else if (props.placement === 'right') {
    style.top = `${rect.top + rect.height / 2}px`;
    style.left = `${rect.right + off}px`;
    style.transform = 'translateY(-50%)';
  } else {
    style.top = `${rect.top + rect.height / 2}px`;
    style.right = `${window.innerWidth - rect.left + off}px`;
    style.transform = 'translateY(-50%)';
  }
  positionStyle.value = style;
}

let raf = 0;
function tick() {
  if (props.autoDismissOn?.() && !seen.value) {
    dismiss();
  }
  reposition();
  raf = requestAnimationFrame(tick);
}

onMounted(() => {
  reposition();
  raf = requestAnimationFrame(tick);
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', reposition);
  window.removeEventListener('scroll', reposition, true);
});

watch(() => props.anchorEl, reposition);
</script>

<style scoped>
.coachmark {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--space-md);
  max-width: 320px;
  color: var(--text-primary);
  font-size: var(--font-sm);
  line-height: 1.4;
}

.coachmark__tip {
  margin: 0 0 var(--space-sm) 0;
}

.coachmark__actions {
  display: flex;
  justify-content: flex-end;
}

.coachmark__dismiss {
  background: var(--accent);
  color: var(--accent-text);
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-xs) var(--space-md);
  font: inherit;
  cursor: pointer;
}

.coachmark__dismiss:hover {
  background: var(--accent-hover);
}

.coachmark__arrow {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  transform: rotate(45deg);
}

.coachmark__arrow--below {
  top: -7px;
  left: 50%;
  margin-left: -6px;
  border-right: none;
  border-bottom: none;
}

.coachmark__arrow--above {
  bottom: -7px;
  left: 50%;
  margin-left: -6px;
  border-left: none;
  border-top: none;
}

.coachmark__arrow--right {
  left: -7px;
  top: 50%;
  margin-top: -6px;
  border-right: none;
  border-top: none;
}

.coachmark__arrow--left {
  right: -7px;
  top: 50%;
  margin-top: -6px;
  border-left: none;
  border-bottom: none;
}
</style>
```

- [ ] **Step 6: Add `common.gotIt` i18n key**

`sv.ts` → `common: { gotIt: 'Förstått' }` (add if missing). `en.ts` → `common: { gotIt: 'Got it' }`.

- [ ] **Step 7: Run the test, verify pass**

```bash
npx vitest run tests/components/Coachmark.test.ts
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/ui/Coachmark.vue src/renderer/styles/tokens.css src/renderer/i18n/sv.ts src/renderer/i18n/en.ts tests/components/Coachmark.test.ts
git commit -m "feat(ui): Coachmark anchored hint component"
```

---

## Phase 3 — Mechanical empty-state coverage

### Task 7: Coverage test (mechanical guard)

**Files:**
- Create: `tests/components/panel-empty-state-coverage.test.ts`

This test fails for any `*Section.vue` or `*Panel.vue` containing a list-shaped section without a `SectionEmpty` (or a documented N/A comment). It is **expected to fail at the end of this task** and turn green only as Tasks 8–16 complete. The test's job is to enforce coverage from this point forward.

- [ ] **Step 1: Audit current coverage**

```bash
grep -rln "v-for" src/renderer/components/*Section.vue src/renderer/components/*Panel.vue | sort -u
grep -L "SectionEmpty\|Empty-state coaching N/A" $(grep -rln "v-for" src/renderer/components/*Section.vue src/renderer/components/*Panel.vue)
```

The second command lists files that have a `v-for` (i.e. a list) but neither a `SectionEmpty` nor an N/A comment. These are the targets for Tasks 8–16.

- [ ] **Step 2: Write the coverage test**

```ts
// tests/components/panel-empty-state-coverage.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as glob from 'glob';

const files = glob.sync('src/renderer/components/{*Section,*Panel}.vue', { cwd: process.cwd(), absolute: true });

const NA_MARKER = /Empty-state coaching N\/A:/;
const HAS_LIST = /v-for=/;
const HAS_EMPTY = /SectionEmpty|<AppEmptyState/;

describe('panel empty-state coverage', () => {
  it.each(files.map((f) => [path.basename(f), f]))(
    '%s has empty-state coaching for every list (or a documented N/A)',
    (_name, file) => {
      const src = fs.readFileSync(file, 'utf-8');
      if (!HAS_LIST.test(src)) return; // no list → no coverage requirement
      if (HAS_EMPTY.test(src) || NA_MARKER.test(src)) return;
      throw new Error(
        `${path.basename(file)}: contains v-for but no SectionEmpty/AppEmptyState/N\\A comment.\n` +
        `Add <SectionEmpty :purpose-key="..." :action-label-key="..." @action="..." /> next to the list, ` +
        `or add a comment <!-- Empty-state coaching N/A: <reason> --> with a specific reason.`
      );
    }
  );
});
```

- [ ] **Step 3: Run the test, observe failures**

```bash
npx vitest run tests/components/panel-empty-state-coverage.test.ts
```
Expected: FAIL on every component listed by Step 1's audit.

- [ ] **Step 4: Commit (RED state — green-up follows in Tasks 8–16)**

```bash
git add tests/components/panel-empty-state-coverage.test.ts
git commit -m "test(panels): empty-state coverage guard (RED — green-up in 8–16)"
```

---

### Tasks 8–14: Per-panel empty-state coverage

For each panel below, the work is identical in shape:
1. Find each `v-for` list inside the panel/section file (or sibling section components it hosts).
2. For each, ensure there is a `<SectionEmpty>` adjacent that renders when the list is empty, with `purpose-key` pointing at a Purpose copy from `docs/UX_INVENTORY.md` (or a deviation comment).
3. Add the corresponding i18n keys in `sv.ts` and `en.ts` under `onboarding.empty.<surfaceKey>.{purpose,cta,hint?}`.
4. If the section's UX_INVENTORY entry currently says `Purpose: TBD`, write the Purpose first (per the `ux-intent-mapping` skill — Purpose comes from a one-sentence user-facing statement, NOT inferred from code reading), then translate to Swedish for `sv.ts`.
5. Wire the `@action` to the section's primary CTA handler. **Apply the 5-step CTA fulfillment check** from `.claude/rules/renderer.md` on every wiring — promise / wiring / context lift / lifecycle parity / reactivity.
6. Run the coverage test for the panel — must turn green for that file.
7. Commit.

The pattern, every section:

```vue
<SectionEmpty
  v-if="rows.length === 0"
  purpose-key="onboarding.empty.<surfaceKey>.purpose"
  action-label-key="onboarding.empty.<surfaceKey>.cta"
  @action="openAddModal()"
/>
```

i18n shape:

```ts
// sv.ts
onboarding: {
  empty: {
    personEvents: {
      purpose: 'Här samlar du livshändelser för personen — födelse, dop, vigsel, flytt, död. Lägg till den du vet.',
      cta: 'Lägg till händelse',
    },
    // ...one block per surface
  },
},
```

(English translations mirror in `en.ts`. Use the UX_INVENTORY Purpose sentence verbatim — translated — as the `purpose` value.)

#### Task 8: PersonPanel sections

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`
- Modify: `src/renderer/components/Person*Section.vue` (every per-person section component listed in the spec)
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`
- Modify: `docs/UX_INVENTORY.md` (fill any TBD Purpose sentences for sections touched here)

**Surfaces:** Names, Identifiers, Relationships, Events, Timeline, Life Map, Media, Sources (citations cross-link section if present), Notes, Groups, Research Tasks, Quality Checks, Header (the panel-header strip is **out of scope** for empty-state coaching — see deviation in spec; document with `<!-- Empty-state coaching N/A: header is not a list-shaped section --> ` comment).

- [ ] **Step 1: List the v-for sites and their CTA handlers**

```bash
grep -nE "v-for|@action|openAdd|@click=\"open" src/renderer/components/PersonPanel.vue src/renderer/components/Person*Section.vue
```

For each `v-for`, identify the existing primary CTA handler (the function the section's `+ Add` button calls) and reuse it for `@action`.

- [ ] **Step 2: Add i18n keys for every PersonPanel surface**

Append the `onboarding.empty.person*` block to both `sv.ts` and `en.ts`. Use the UX_INVENTORY Purpose statement verbatim (translated) for each `purpose`. Example for Events:

```ts
// en.ts
personEvents: {
  purpose: 'A user would use this section to view events that happened to this person — type, date, place — and to add, open, or delete one.',
  cta: 'Add event',
},
// sv.ts
personEvents: {
  purpose: 'Här samlar du livshändelser — typ, datum, plats — och lägger till, redigerar eller tar bort dem.',
  cta: 'Lägg till händelse',
},
```

Repeat for: `personNames`, `personIdentifiers`, `personRelationships`, `personTimeline`, `personLifeMap`, `personMedia`, `personSources`, `personNotes`, `personGroups`, `personResearchTasks`, `personQualityChecks`. (Twelve total; Header is N/A.)

- [ ] **Step 3: For each section, replace any inline empty markup or add new `SectionEmpty`**

Using the pattern shown above. Existing `SectionEmpty` usages with bare `:message="$t('empty.names')"` get migrated to the `purpose-key` form. The legacy `empty.*` keys can be removed once all sites migrate (do this in the final cleanup step of this task).

- [ ] **Step 4: Apply the 5-step CTA fulfillment check on every `@action` wiring**

For each section's `@action` handler:
1. Promise: does the CTA label name the actual primitive being added?
2. Wiring: does the handler create that primitive (not a no-op, not a sibling section's handler)?
3. Context lift: does the host person ID flow into the modal?
4. Lifecycle parity: can the user also edit/remove via the section?
5. Reactivity: does the section refresh after save (it should, via `useEntityData`)?

Document any failures in the panel file with a code comment and fix in this task.

- [ ] **Step 5: Run the coverage test for PersonPanel**

```bash
npx vitest run tests/components/panel-empty-state-coverage.test.ts -t "PersonPanel"
npx vitest run tests/components/panel-empty-state-coverage.test.ts -t "Person.*Section"
```
Expected: every PersonPanel-related row turns green.

- [ ] **Step 6: Update UX_INVENTORY for any TBD Purposes filled in this task**

For each section whose UX_INVENTORY row was `Purpose: TBD — needs user-stated intent`, replace the TBD line with the Purpose sentence used in `en.ts` and bump `Verified: 2026-05-09`.

- [ ] **Step 7: Run lint + relevant tests**

```bash
npm run lint
npx vitest run tests/components/panel-empty-state-coverage.test.ts tests/components/SectionEmpty.test.ts
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/PersonPanel.vue src/renderer/components/Person*Section.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts docs/UX_INVENTORY.md
git commit -m "feat(persons): Purpose-stated empty states across PersonPanel sections"
```

#### Task 9: PlacePanel sections

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`, `PlacePersonsSection.vue`, `PlaceChecksSection.vue`, `EntityMediaSection.vue` (when hosted on a place)
- Modify: `sv.ts`, `en.ts`, `docs/UX_INVENTORY.md`

**Surfaces:** Persons (derived — no Add CTA), Events (derived from events at place), Place History, Children Places, Media, Quality Checks. **Persons section** has no Add CTA per UX_INVENTORY; its empty-state copy must explicitly say "no Add here — add an event instead." Use `secondaryHintKey` to point at the Events section.

Repeat the per-section work pattern from Task 8, with all per-section i18n keys under `onboarding.empty.place*`. Use the Purpose sentences from UX_INVENTORY entries §3.x.

For the **derived Persons section**, the empty state has no `@action` button — render only the Purpose + a hint pointing to "+ Event":

```vue
<SectionEmpty
  v-if="persons.length === 0"
  purpose-key="onboarding.empty.placePersons.purpose"
  secondary-hint-key="onboarding.empty.placePersons.hint"
/>
```

- [ ] Step 1–8 (same shape as Task 8)
- [ ] Commit: `git commit -m "feat(places): Purpose-stated empty states across PlacePanel sections"`

#### Task 10: SourcePanel sections

**Files:**
- Modify: `src/renderer/components/SourcePanel.vue`, related `*Section.vue` files
- Modify: `sv.ts`, `en.ts`, `docs/UX_INVENTORY.md`

**Surfaces:** Citations (derived — read-only), Repositories, Media, Notes, Quality Checks. Migrate the existing `:message="$t('sourcePanel.noChecks')"` legacy usage at line 177 to the new `purpose-key` form.

- [ ] Step 1–8 same shape as Task 8
- [ ] Commit: `git commit -m "feat(sources): Purpose-stated empty states across SourcePanel"`

#### Task 11: GroupPanel sections

**Files:**
- Modify: `src/renderer/components/GroupPanel.vue` and any group-section components
- Modify: `sv.ts`, `en.ts`, `docs/UX_INVENTORY.md`

**Surfaces:** Members, Linked Persons, Linked Sources, Notes.

- [ ] Step 1–8 same shape as Task 8
- [ ] Commit: `git commit -m "feat(groups): Purpose-stated empty states across GroupPanel"`

#### Task 12: ResearchTaskPanel sections

**Files:**
- Modify: `src/renderer/components/ResearchTaskPanel.vue` + sections
- Modify: `sv.ts`, `en.ts`, `docs/UX_INVENTORY.md`

**Surfaces:** Linked Persons, Notes.

- [ ] Step 1–8 same shape as Task 8
- [ ] Commit: `git commit -m "feat(research-tasks): Purpose-stated empty states across ResearchTaskPanel"`

#### Task 13: MediaPanel sections

**Files:**
- Modify: `src/renderer/components/MediaPanel.vue`
- Modify: `sv.ts`, `en.ts`, `docs/UX_INVENTORY.md`

**Surfaces:** Linked Persons, Linked Places, Linked Events, Face Tags, Notes. The current file already uses `SectionEmpty` extensively — migrate every `:message="$t('empty.*')"` usage to `purpose-key` form.

- [ ] Step 1–8 same shape as Task 8
- [ ] Commit: `git commit -m "feat(media): Purpose-stated empty states across MediaPanel"`

#### Task 14: RelationshipPanel sections

**Files:**
- Modify: `src/renderer/components/RelationshipPanel.vue`
- Modify: `sv.ts`, `en.ts`, `docs/UX_INVENTORY.md`

**Surfaces:** Events, Notes.

- [ ] Step 1–8 same shape as Task 8
- [ ] Commit: `git commit -m "feat(relationships): Purpose-stated empty states across RelationshipPanel"`

---

### Task 15: List-view empty states

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`, `PlacesView.vue`, `SourcesView.vue`, `MediaView.vue`, `GroupsView.vue`, `ResearchTasksView.vue`, `QualityView.vue`, `DuplicatesView.vue` (or current name), `SearchView.vue`
- Modify: `sv.ts`, `en.ts`

For each list view, the empty-state replaces the empty table area when `total === 0` (probe via `usePagedList`). Per `renderer.md`: maps must NOT replace the surface — they get a floating pill overlay; align that overlay's copy with the new `onboarding.empty.placesView.*` keys.

- [ ] **Step 1: For each list view, find the empty render path**

```bash
grep -nE "total === 0|items\\.length === 0" src/renderer/views/*.vue
```

- [ ] **Step 2: Replace with `SectionEmpty` in `purposeKey` mode**

For each view:

```vue
<SectionEmpty
  v-if="total === 0 && !isLoading"
  purpose-key="onboarding.empty.<viewKey>.purpose"
  action-label-key="onboarding.empty.<viewKey>.cta"
  @action="openCreate()"
/>
```

For PlacesView (places are derived from events): no CTA, secondary hint pointing to Persons.

- [ ] **Step 3: i18n for all list views**

Add `onboarding.empty.{personsView,placesView,sourcesView,mediaView,groupsView,researchTasksView,qualityView,duplicatesView,searchView}.{purpose,cta,hint?}` to `sv.ts` and `en.ts`.

For QualityView "no issues" and DuplicatesView "no duplicates" — frame as success ("Inga problem hittade — bra jobbat!" / "No duplicates found — nice."). For SearchView with empty query — hint copy explains the search box.

- [ ] **Step 4: Run lint + tests**

```bash
npm run lint && npx vitest run tests/components/panel-empty-state-coverage.test.ts
```
Expected: PASS (note coverage test only scopes panels; list views are checked manually).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/ src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(views): Purpose-stated empty states for every list view"
```

---

### Task 16: Picker empty states

**Files:**
- Modify: `src/renderer/components/PersonPicker.vue`, `PlacePicker.vue`, `SourcePicker.vue`, `GroupPicker.vue` (and any other picker that lists DB rows)
- Modify: `sv.ts`, `en.ts`

When the underlying entity table has zero rows (genuinely-empty fresh DB), the picker dropdown shows a `SectionEmpty` directing to "Skriv ett namn och välj 'Skapa ny'" / "Type a name and choose 'Create new'" — calling out that the typed-create flow IS the path on a fresh DB.

- [ ] **Step 1: For each picker, find the dropdown render path and the "no results" state**

- [ ] **Step 2: Replace with `SectionEmpty` purposeKey form** when total = 0 (distinct from filtered "no matches" — only zero-rows-in-DB triggers coaching).

- [ ] **Step 3: i18n keys** under `onboarding.empty.{personPicker,placePicker,sourcePicker,groupPicker}.purpose`.

- [ ] **Step 4: Lint + tests; commit**

```bash
git add src/renderer/components/*Picker.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(pickers): empty-state coaching for fresh-DB pickers"
```

---

## Phase 4 — Coachmarks

### Task 17: Hourglass focus-switch coachmark

**Files:**
- Modify: `src/renderer/components/HourglassChart.vue` (or current name; find via `grep -rln Hourglass src/renderer/views/ src/renderer/components/`)
- Modify: `sv.ts`, `en.ts`
- Test: `tests/components/coachmark-hourglass.test.ts`

- [ ] **Step 1: Locate the chart's focus box element**

The Hourglass chart renders a "focus person" box. Find its template node (likely a specific `<g>` or `<div>` with a class like `.focus-box` or `.hourglass-focus`). Add a `ref="focusBoxEl"` so we can pass it to the `Coachmark` as `:anchor-el`.

- [ ] **Step 2: Add the i18n keys**

```ts
// sv.ts
onboarding.coach.hourglassFocus = {
  tip: 'Klicka på en person för att titta på den. Dubbelklicka för att flytta fokus dit.',
  dismiss: 'Förstått',
};
// en.ts
onboarding.coach.hourglassFocus = {
  tip: 'Click any person to view them. Double-click to set focus there.',
  dismiss: 'Got it',
};
```

- [ ] **Step 3: Add the Coachmark to the chart template**

```vue
<Coachmark
  seen-key="coach.hourglass.focus"
  :anchor-el="focusBoxEl"
  tip-key="onboarding.coach.hourglassFocus.tip"
  dismiss-key="onboarding.coach.hourglassFocus.dismiss"
  placement="below"
  :auto-dismiss-on="() => focusChangedOnce"
/>
```

Maintain a `focusChangedOnce` ref that flips to `true` the first time the user double-clicks any person:

```ts
const focusChangedOnce = ref(false);
function onPersonDblClick(personId: string) {
  // existing focus-switch logic
  focusChangedOnce.value = true;
}
```

- [ ] **Step 4: Write the integration test**

```ts
// tests/components/coachmark-hourglass.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import HourglassChart from '../../src/renderer/components/HourglassChart.vue'; // adjust path
import { __resetForTests } from '../../src/renderer/composables/useFirstEncounter';
// + i18n setup, props mock with a small tree

beforeEach(() => __resetForTests());

describe('Hourglass focus coachmark', () => {
  it('appears on first render, dismisses after a focus-change double-click', async () => {
    // mount with seen={}, assert .coachmark visible
    // dispatch dblclick on a person node
    // await flushPromises
    // assert .coachmark gone, markSeen called with 'coach.hourglass.focus'
  });
});
```

- [ ] **Step 5: Run the test, verify pass**

```bash
npx vitest run tests/components/coachmark-hourglass.test.ts
```

- [ ] **Step 6: Manual smoke**

Reset `settings.json` (or the `onboarding.seen` block); launch app; open a person; switch to Hourglass tab. Coachmark should anchor on the focus person box. Double-click any person — focus moves AND coachmark vanishes. Restart app; coachmark stays gone.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/HourglassChart.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts tests/components/coachmark-hourglass.test.ts
git commit -m "feat(charts): Hourglass focus-switch coachmark"
```

---

### Task 18: MediaSection drag-handle coachmark

**Files:**
- Modify: `src/renderer/components/PersonMediaSection.vue` (and `EntityMediaSection.vue` if it owns its own drag handle render)
- Modify: `sv.ts`, `en.ts`
- Test: `tests/components/coachmark-media-reorder.test.ts`

- [ ] **Step 1: Find the drag-handle column ref**

Add `ref="dragHandleEl"` to the first row's drag-handle `<td>` (or wrapper) when `media.length >= 2`.

- [ ] **Step 2: i18n keys**

```ts
// sv.ts
onboarding.coach.mediaReorder = {
  tip: 'Dra rader för att sortera om — t.ex. barnbilder först, äldre sist.',
  dismiss: 'Förstått',
};
// en.ts
onboarding.coach.mediaReorder = {
  tip: 'Drag rows to reorder — e.g. childhood photos first, later ones last.',
  dismiss: 'Got it',
};
```

- [ ] **Step 3: Wire Coachmark**

```vue
<Coachmark
  v-if="media.length >= 2"
  seen-key="coach.media.reorder"
  :anchor-el="dragHandleEl"
  tip-key="onboarding.coach.mediaReorder.tip"
  dismiss-key="onboarding.coach.mediaReorder.dismiss"
  placement="right"
  :auto-dismiss-on="() => reorderedOnce"
/>
```

Set `reorderedOnce.value = true` in the existing reorder handler.

- [ ] **Step 4: Test + manual smoke + commit**

Same shape as Task 17.

---

### Task 19: MediaModal face-tag coachmark

**Files:**
- Modify: `src/renderer/components/MediaModal.vue` (or wherever the face-tag canvas lives)
- Modify: `sv.ts`, `en.ts`
- Test: `tests/components/coachmark-face-tagging.test.ts`

- [ ] **Step 1: Find the image-canvas element ref**

Add `ref="canvasEl"` to the `<canvas>` or `<img>` overlay used for face-region drawing.

- [ ] **Step 2: i18n keys**

```ts
// sv.ts
onboarding.coach.faceTagging = {
  tip: 'Klicka och dra på bilden för att markera ett ansikte. Knyt sedan markeringen till en person.',
  dismiss: 'Förstått',
};
// en.ts: equivalent.
```

- [ ] **Step 3: Wire Coachmark only when face-tag mode is active**

```vue
<Coachmark
  v-if="faceTagModeActive"
  seen-key="coach.media.faceTagging"
  :anchor-el="canvasEl"
  tip-key="onboarding.coach.faceTagging.tip"
  dismiss-key="onboarding.coach.faceTagging.dismiss"
  placement="below"
  :auto-dismiss-on="() => regions.length > 0"
/>
```

- [ ] **Step 4: Test + manual smoke + commit**

---

### Task 20: First-media-attach toast

**Files:**
- Modify: wherever `media:attach` success is handled in the renderer (likely `PersonMediaSection.vue` or a shared composable — find via `grep -rln "media:attach\|attachMedia\|window.api.media.attach" src/renderer/`)
- Modify: `sv.ts`, `en.ts`
- Test: `tests/components/onboarding-toast-media-attach.test.ts`

- [ ] **Step 1: Identify the attach success path**

```bash
grep -rln "media\.attach\|attachMedia" src/renderer/
```

- [ ] **Step 2: Wire `useFirstEncounter`**

```ts
import { useFirstEncounter } from '../composables/useFirstEncounter';
import { useToast } from '../composables/useToast'; // verify path

const firstAttach = useFirstEncounter('toast.media.firstAttach');
const toast = useToast();

async function onAttachSuccess() {
  if (!firstAttach.seen.value) {
    toast.info(t('onboarding.toast.mediaFirstAttach.body'));
    await firstAttach.markSeen();
  }
}
```

- [ ] **Step 3: i18n key**

```ts
// sv.ts
onboarding.toast.mediaFirstAttach = {
  body: 'Filen kopieras in i mappen <dbnamn>-media/ så att den följer med när du flyttar databasen.',
};
// en.ts
onboarding.toast.mediaFirstAttach = {
  body: 'Your file is copied into the <dbname>-media/ folder so it travels with the database.',
};
```

- [ ] **Step 4: Test + manual smoke + commit**

---

## Phase 5 — Settings UX

### Task 21: Reset onboarding button in SettingsView

**Files:**
- Modify: `src/renderer/views/SettingsView.vue`
- Test: `tests/components/settings-reset-onboarding.test.ts`

- [ ] **Step 1: Add a small "Reset onboarding" section in SettingsView**

```vue
<section class="settings-section">
  <h3>{{ $t('onboarding.settings.resetTitle') }}</h3>
  <p class="settings-section__description">{{ $t('onboarding.settings.resetDescription') }}</p>
  <button class="btn-cancel" @click="resetOnboarding">{{ $t('onboarding.settings.resetButton') }}</button>
</section>
```

```ts
async function resetOnboarding() {
  await window.api.onboarding.reset();
  __resetForTests(); // clears in-memory cache so live components re-evaluate
  toast.success(t('onboarding.settings.resetDoneToast'));
}
```

(Import `__resetForTests` is a code smell here — instead, expose a public `resetCache()` from `useFirstEncounter.ts` that does the same thing under a non-test name. Update the composable to export both. Use `resetCache()` from SettingsView.)

- [ ] **Step 2: Update `useFirstEncounter.ts` to export `resetCache`**

Replace `__resetForTests` with `resetCache` (keep `__resetForTests` as an alias for the test file).

- [ ] **Step 3: Test the wiring**

Mount SettingsView with the api mock; click reset; assert `window.api.onboarding.reset` called and toast shown.

- [ ] **Step 4: Manual smoke**

Set some coachmarks; click Reset; reopen Hourglass — coachmark reappears.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/SettingsView.vue src/renderer/composables/useFirstEncounter.ts tests/components/settings-reset-onboarding.test.ts
git commit -m "feat(settings): reset onboarding button"
```

---

## Phase 6 — Verification

### Task 22: Manual user-observable verification

This is the §Verification section of the spec. Spec compliance ≠ user goal compliance. Run this in the live app, not in tests.

- [ ] **Step 1: Fresh-state test**

```bash
# Quit the app. Back up your settings.
mv "$HOME/Library/Application Support/Slaktforskning/settings.json" /tmp/settings.bak.json
# Launch the dev build against an empty test DB (use the dev-debug script if present, else `npm start`).
npm start
```

Walk every paneled view and every list view. For each surface:
- An empty section shows Purpose + primary CTA in Swedish.
- The CTA opens the right modal/picker.
- The host entity flows in (a place picker opened from a place panel ought to default to that place's gazetteer hint, etc.).
- Add an item; the empty-state disappears.
- Delete the last item; the empty-state returns.

Take screenshots of any surface where the copy reads awkwardly or the CTA misfires; fix in this task before continuing.

- [ ] **Step 2: Coachmark walkthrough**

With a fresh `settings.json`:
1. Open a person; switch to Hourglass — coachmark anchored on focus box. Double-click any person — coachmark dismisses; focus moves.
2. Open a person with ≥2 media — coachmark anchored on first row's drag handle. Drag a row — coachmark dismisses.
3. Open a media row in MediaModal; activate face-tag mode — coachmark anchored on image canvas. Draw a region — coachmark dismisses.
4. Attach a media file for the first time — toast shows the `<dbname>-media/` explanation. Attach a second media — no toast.

Restart the app. None of the four reappear.

- [ ] **Step 3: Settings reset round-trip**

Open Settings → Reset onboarding. Restart. All four coachmarks reappear; empty-states reappear (well, the empties were always data-driven — they reappear only if the data is also empty).

- [ ] **Step 4: Restore your real settings**

```bash
mv /tmp/settings.bak.json "$HOME/Library/Application Support/Slaktforskning/settings.json"
```

- [ ] **Step 5: Commit any fixes from Step 1's pass**

```bash
git add -A
git commit -m "fix(onboarding): copy and CTA fixes from manual verification"
```

(If no fixes, skip.)

---

## Phase 7 — Plan close-out (per CLAUDE.md)

### Task 23: Plan close-out

- [ ] **Step 1: Tick every checkbox in this plan**

Including the Self-review checklist at the top.

- [ ] **Step 2: Move plan + spec to archive**

```bash
git mv docs/plans/2026-05-09-onboarding-design.md docs/plans/archive/
git mv docs/plans/2026-05-09-onboarding.md docs/plans/archive/
```

- [ ] **Step 3: Bump version (minor — feature)**

Update `package.json` version: minor bump (e.g. `0.211.0` → `0.212.0`).

- [ ] **Step 4: Update `CHANGELOG.md`**

Add a `## Unreleased` (or next-version) section with:

```
- feat: first-time onboarding — Purpose-stated empty states across every panel section, plus four coachmarks (Hourglass focus, media reorder, face tagging, first media attach) addressing the discovery gaps Bengt's beta feedback exposed.
```

- [ ] **Step 5: Update `docs/PLAN.md` and `docs/plans/archive/PLAN.md`**

Remove the `[in-progress]` (or add-and-remove) onboarding row from `docs/PLAN.md`. Append a one-paragraph entry to `docs/plans/archive/PLAN.md` matching the existing format:

```
### First-time onboarding (2026-05-09)
Empty-state coaching across every panel section + four enumerated coachmarks (Hourglass focus, media reorder, face tagging, first media attach), targeting the confusion patterns Bengt Sareld surfaced in beta. Spec: [archive/2026-05-09-onboarding-design.md]. Plan: [archive/2026-05-09-onboarding.md].
```

`docs/PLAN.md` must contain zero `[done]` entries when committed.

- [ ] **Step 6: Commit the archive + bump**

```bash
git add docs/plans/ docs/PLAN.md package.json CHANGELOG.md
git commit -m "chore: archive completed 2026-05-09-onboarding"
```

- [ ] **Step 7: Merge to main per `superpowers:finishing-a-development-branch`**

If working in a worktree, follow Option 1 (merge → main, delete branch, remove worktree).

---

## Cross-task tooling references

- **Section CTA fulfillment check (5 steps):** `.claude/rules/renderer.md` "CTA fulfillment check" — apply on every `@action` wired in this plan.
- **i18n strict:** every new string in BOTH `sv.ts` and `en.ts`. Never `$t('...')` against a missing key.
- **Class-name collision check:** mandatory before naming a new CSS class — `.claude/rules/renderer.md`.
- **WCAG contrast:** `tests/unit/wcagContrast.test.ts` runs against every theme × appearance. Any token added in this plan re-runs; failure prints exact ratios.
- **Subagent dispatch:** use the `subagent-handoff` skill (project-local prompt templates centering user goals over spec compliance) for every task in Phases 3–4.
- **Plan rules:** `.claude/rules/plans.md` — user goal first (matches §User goal in the spec), full pattern scope (every section, deviations explicit), verification by user-observable outcome (§Verification + Task 22).
