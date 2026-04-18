# Link Rules Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add link rule sets for German, Danish, and Norwegian genealogy platforms, expand existing Swedish and English rule sets, fix LinkedText to respect db config, and add locale toggles for the new locales.

**Architecture:** Each locale gets its own rule file in `src/api/link-rules/` exporting a `LinkRule[]` array (same pattern as `sv.ts` and `en.ts`). The `LinkRulesView` imports all rule sets and adds locale toggle checkboxes. `LinkedText` is fixed to load and apply `link_rules_config` from db settings instead of hardcoding all rules as enabled.

**Tech Stack:** TypeScript, Vue 3, Vitest

---

## Task 1: German rule set (`src/api/link-rules/de.ts`)

- [ ] Create `src/api/link-rules/de.ts` with the following rules:

```typescript
import type { LinkRule } from '../source-linker';

export const deRules: LinkRule[] = [
  {
    id: 'archion',
    name: 'Archion',
    pattern: 'Archion:\\s*(.+?)(?:\\s*,|\\s*$)',
    urlTemplate: 'https://www.archion.de/en/search/?search_string=$1',
    example: 'Archion: Taufregister 1680-1720',
    locale: 'de',
    enabled: true,
    priority: 10,
  },
  {
    id: 'matricula',
    name: 'Matricula',
    pattern: 'Matricula:\\s*(.+?)(?:\\s*,|\\s*$)',
    urlTemplate: 'https://data.matricula-online.eu/en/search/?place=$1',
    example: 'Matricula: Wien, St. Stephan',
    locale: 'de',
    enabled: true,
    priority: 10,
  },
  {
    id: 'ancestry-de',
    name: 'Ancestry.de Record',
    pattern: 'ancestry\\.de/discoveryui-content/view/(\\d+):(\\d+)',
    urlTemplate: 'https://www.ancestry.de/discoveryui-content/view/$1:$2',
    example: 'ancestry.de/discoveryui-content/view/45678:1234',
    locale: 'de',
    enabled: true,
    priority: 20,
  },
];
```

**Verify:** `npm test -- --run tests/unit/source-linker.test.ts` passes after Task 7.

---

## Task 2: Danish rule set (`src/api/link-rules/da.ts`)

- [ ] Create `src/api/link-rules/da.ts` with the following rules:

```typescript
import type { LinkRule } from '../source-linker';

export const daRules: LinkRule[] = [
  {
    id: 'arkivalieronline',
    name: 'Arkivalieronline (AO)',
    pattern: 'AO:\\s*(\\d+)',
    urlTemplate: 'https://www.sa.dk/ao-soegesider/da/billedviser?bession=$1',
    example: 'AO: 12345',
    locale: 'da',
    enabled: true,
    priority: 10,
  },
  {
    id: 'kip',
    name: 'KIP (KildeIndtastningsProjektet)',
    pattern: 'KIP:\\s*(.+?)(?:\\s*,|\\s*$)',
    urlTemplate: 'https://kip.rfrn.dk/search?q=$1',
    example: 'KIP: Odense 1787',
    locale: 'da',
    enabled: true,
    priority: 10,
  },
];
```

---

## Task 3: Norwegian rule set (`src/api/link-rules/no.ts`)

- [ ] Create `src/api/link-rules/no.ts` with the following rules:

```typescript
import type { LinkRule } from '../source-linker';

export const noRules: LinkRule[] = [
  {
    id: 'digitalarkivet',
    name: 'Digitalarkivet',
    pattern: 'DA:\\s*(.+?)(?:\\s*,|\\s*$)',
    urlTemplate: 'https://www.digitalarkivet.no/search/persons?q=$1',
    example: 'DA: Bergen 1801',
    locale: 'no',
    enabled: true,
    priority: 10,
  },
  {
    id: 'arkivverket',
    name: 'Arkivverket',
    pattern: 'arkivverket\\.no/[^\\s<>"\\)\\]]+',
    urlTemplate: '$0',
    example: 'arkivverket.no/search/archives',
    locale: 'no',
    enabled: true,
    priority: 20,
  },
];
```

---

## Task 4: Swedish rule additions (`src/api/link-rules/sv.ts`)

- [ ] Add two rules to the existing `svRules` array in `src/api/link-rules/sv.ts`:

```typescript
  {
    id: 'svar',
    name: 'SVAR',
    pattern: 'SVAR:\\s*(.+?)(?:\\s*,|\\s*$)',
    urlTemplate: 'https://sok.riksarkivet.se/svar/$1',
    example: 'SVAR: Husförhör Lekeberga 1820-1830',
    locale: 'sv',
    enabled: true,
    priority: 15,
  },
  {
    id: 'ddb',
    name: 'Demografiska databasen (DDB)',
    pattern: 'DDB:\\s*(.+?)(?:\\s*,|\\s*$)',
    urlTemplate: 'https://www.ddb.umu.se/search?q=$1',
    example: 'DDB: Skellefteå 1890',
    locale: 'sv',
    enabled: true,
    priority: 15,
  },
```

---

## Task 5: English/international rule additions (`src/api/link-rules/en.ts`)

- [ ] Add four rules to the existing `enRules` array in `src/api/link-rules/en.ts`:

```typescript
  {
    id: 'myheritage-record',
    name: 'MyHeritage Record',
    pattern: 'myheritage\\.com/research/record-(\\d+-\\d+)',
    urlTemplate: 'https://www.myheritage.com/research/record-$1',
    example: 'myheritage.com/research/record-1-300123456',
    locale: 'en',
    enabled: true,
    priority: 20,
  },
  {
    id: 'geni-profile',
    name: 'Geni Profile',
    pattern: 'geni\\.com/people/[^/]+/(\\d+)',
    urlTemplate: 'https://www.geni.com/people/profile/$1',
    example: 'geni.com/people/John-Smith/6000000012345678',
    locale: 'en',
    enabled: true,
    priority: 20,
  },
  {
    id: 'wikitree-id',
    name: 'WikiTree Profile',
    pattern: 'WikiTree:\\s*([A-Za-z]+-\\d+)',
    urlTemplate: 'https://www.wikitree.com/wiki/$1',
    example: 'WikiTree: Smith-12345',
    locale: 'en',
    enabled: true,
    priority: 20,
  },
  {
    id: 'billiongraves',
    name: 'BillionGraves',
    pattern: 'BillionGraves[^0-9]*(\\d{5,})',
    urlTemplate: 'https://billiongraves.com/grave/$1',
    example: 'BillionGraves memorial 1234567',
    locale: 'en',
    enabled: true,
    priority: 25,
  },
```

---

## Task 6: Update imports in consuming files

- [ ] Update `src/renderer/views/LinkRulesView.vue` — import new rule sets and add to `allDefaults`:

In `<script setup>`, add imports:
```typescript
import { deRules } from '../../api/link-rules/de';
import { daRules } from '../../api/link-rules/da';
import { noRules } from '../../api/link-rules/no';
```

Update `allDefaults`:
```typescript
const allDefaults: LinkRule[] = [...universalRules, ...svRules, ...enRules, ...deRules, ...daRules, ...noRules];
```

- [ ] Add locale toggle checkboxes in the template (after the English toggle):

```html
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
```

---

## Task 7: Unit tests for all new rules (`tests/unit/source-linker.test.ts`)

- [ ] Add test blocks for each new rule set. Append to existing test file:

```typescript
import { deRules } from '../../src/api/link-rules/de';
import { daRules } from '../../src/api/link-rules/da';
import { noRules } from '../../src/api/link-rules/no';

describe('German default rules', () => {
  it('matches Archion reference', () => {
    const result = linkify('Archion: Taufregister 1680-1720', deRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('archion.de');
    expect(seg!.url).toContain('Taufregister');
  });

  it('matches Matricula reference', () => {
    const result = linkify('Matricula: Wien, St. Stephan, more text', deRules);
    const seg = result.find((s) => s.ruleName === 'Matricula');
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('matricula-online.eu');
  });

  it('matches Ancestry.de record URL', () => {
    const result = linkify('ancestry.de/discoveryui-content/view/45678:1234', deRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.ancestry.de/discoveryui-content/view/45678:1234');
  });
});

describe('Danish default rules', () => {
  it('matches Arkivalieronline AO reference', () => {
    const result = linkify('AO: 12345', daRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('sa.dk');
    expect(seg!.url).toContain('12345');
  });

  it('matches KIP reference', () => {
    const result = linkify('KIP: Odense 1787, some note', daRules);
    const seg = result.find((s) => s.ruleName?.includes('KIP'));
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('kip.rfrn.dk');
  });
});

describe('Norwegian default rules', () => {
  it('matches Digitalarkivet DA reference', () => {
    const result = linkify('DA: Bergen 1801, census', noRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('digitalarkivet.no');
  });

  it('matches Arkivverket URL passthrough', () => {
    const result = linkify('see arkivverket.no/search/archives for details', noRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.text).toBe('arkivverket.no/search/archives');
  });
});

describe('Swedish rule additions', () => {
  it('matches SVAR reference', () => {
    const result = linkify('SVAR: Husförhör Lekeberga 1820-1830, page 5', svRules);
    const seg = result.find((s) => s.ruleName === 'SVAR');
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('riksarkivet.se/svar/');
  });

  it('matches DDB reference', () => {
    const result = linkify('DDB: Skellefteå 1890, birth record', svRules);
    const seg = result.find((s) => s.ruleName?.includes('DDB'));
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('ddb.umu.se');
  });
});

describe('English rule additions', () => {
  it('matches MyHeritage record URL', () => {
    const result = linkify('myheritage.com/research/record-1-300123456', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.myheritage.com/research/record-1-300123456');
  });

  it('matches Geni profile URL', () => {
    const result = linkify('geni.com/people/John-Smith/6000000012345678', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('geni.com/people/profile/6000000012345678');
  });

  it('matches WikiTree ID reference', () => {
    const result = linkify('WikiTree: Smith-12345', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.wikitree.com/wiki/Smith-12345');
  });

  it('matches BillionGraves memorial', () => {
    const result = linkify('BillionGraves memorial 1234567', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://billiongraves.com/grave/1234567');
  });
});
```

**Verify:** `npm test -- --run tests/unit/source-linker.test.ts`

---

## Task 8: Fix LinkedText to use db config

The current `LinkedText.vue` hardcodes all rules as enabled (ignoring the user's db config). Fix it to load and apply `link_rules_config`.

- [ ] Rewrite `src/renderer/components/LinkedText.vue` `<script setup>`:

```typescript
import { ref, computed, onMounted } from 'vue';
import { linkify, resolveRules, type LinkedSegment, type LinkRuleOverrides } from '../../api/source-linker';
import { svRules } from '../../api/link-rules/sv';
import { enRules } from '../../api/link-rules/en';
import { deRules } from '../../api/link-rules/de';
import { daRules } from '../../api/link-rules/da';
import { noRules } from '../../api/link-rules/no';
import { universalRules } from '../../api/link-rules/universal';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  text: string;
}>();

const allDefaults = [...universalRules, ...svRules, ...enRules, ...deRules, ...daRules, ...noRules];

const config = ref<LinkRuleOverrides>({ enabledLocales: ['sv'], overrides: {} });
const loaded = ref(false);

async function loadConfig() {
  try {
    const raw = await window.api.db.getSetting('link_rules_config') as string | null;
    if (raw) {
      config.value = JSON.parse(raw) as LinkRuleOverrides;
    }
  } catch {
    // keep default
  }
  loaded.value = true;
}

const segments = computed<LinkedSegment[]>(() => {
  if (!props.text || !loaded.value) return [];
  const rules = resolveRules(allDefaults, config.value);
  return linkify(props.text, rules);
});

function openExternal(url: string) {
  window.api.shell.openExternal(url);
}

onMounted(loadConfig);
```

The template stays the same. The key changes:
1. Import `resolveRules` and `LinkRuleOverrides`
2. Load `link_rules_config` from db settings on mount
3. Apply `resolveRules` to filter by enabled locales and apply overrides
4. Show nothing until config is loaded (prevents flash of all-rules-enabled)

---

## Task 9: i18n keys

- [ ] Add locale labels to `src/renderer/i18n/en.ts` in the `linkRules` section:

```typescript
  linkRules: {
    // ... existing keys ...
    german: 'German',
    danish: 'Danish',
    norwegian: 'Norwegian',
  },
```

- [ ] Add locale labels to `src/renderer/i18n/sv.ts` in the `linkRules` section:

```typescript
  linkRules: {
    // ... existing keys ...
    german: 'Tyska',
    danish: 'Danska',
    norwegian: 'Norska',
  },
```

---

## Task 10: Lint and full test suite

- [ ] Run `npm run lint` — fix any errors
- [ ] Run `npm test -- --run` — all tests pass
- [ ] Verify the new test count includes all new describe blocks

**Verify commands:**
```bash
npm run lint
npm test -- --run tests/unit/source-linker.test.ts
npm test -- --run
```

---

## Files Changed

| File | Action |
|------|--------|
| `src/api/link-rules/de.ts` | Create (3 rules) |
| `src/api/link-rules/da.ts` | Create (2 rules) |
| `src/api/link-rules/no.ts` | Create (2 rules) |
| `src/api/link-rules/sv.ts` | Edit (add 2 rules) |
| `src/api/link-rules/en.ts` | Edit (add 4 rules) |
| `src/renderer/views/LinkRulesView.vue` | Edit (imports + locale toggles) |
| `src/renderer/components/LinkedText.vue` | Edit (use db config) |
| `src/renderer/i18n/en.ts` | Edit (3 new keys) |
| `src/renderer/i18n/sv.ts` | Edit (3 new keys) |
| `tests/unit/source-linker.test.ts` | Edit (6 new describe blocks, ~20 tests) |

## Post-implementation

- [ ] Update `CLAUDE.md` — add `de.ts`, `da.ts`, `no.ts` to the File Map under `link-rules/`, update rule counts, note LinkedText fix
- [ ] Update `docs/PLAN.md` — mark link rules expansion milestone as done
- [ ] Bump patch version in `package.json`
