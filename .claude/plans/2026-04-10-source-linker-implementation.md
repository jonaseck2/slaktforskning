# Source Linker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect structured references in source/citation text fields and render them as clickable links to authoritative archives (ArkivDigital, Riksarkivet, FamilySearch, etc.).

**Architecture:** Pure TypeScript engine in `src/api/source-linker.ts` scans text with regex rules and returns link segments. A `<LinkedText>` Vue component renders segments as inline links. Rules ship as Swedish/English defaults, stored as TypeScript; user overrides persist in `db_settings`. Links open in system browser via a new IPC channel.

**Tech Stack:** TypeScript, Vitest, Vue 3 Composition API, Electron shell.openExternal

**Spec:** `.claude/plans/2026-04-10-source-linker-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/api/source-linker.ts` | Create | Core engine: `LinkRule`/`LinkedSegment` types, `linkify()`, `resolveRules()` |
| `src/api/link-rules/sv.ts` | Create | Swedish default rules (ArkivDigital, Riksarkivet, Dodbok, etc.) |
| `src/api/link-rules/en.ts` | Create | English default rules (FamilySearch, FindAGrave, Ancestry) |
| `src/api/link-rules/universal.ts` | Create | Universal rules (plain URL) |
| `tests/unit/source-linker.test.ts` | Create | Unit tests for linkify engine and rule sets |
| `src/main/ipc.ts` | Modify | Add `shell:open-external`, `db:setSetting` handlers |
| `src/preload/index.ts` | Modify | Add `window.api.shell.openExternal()`, `window.api.db.setSetting()` |
| `src/renderer/components/LinkedText.vue` | Create | Vue component rendering linked segments |
| `src/renderer/views/SourceDetailView.vue` | Modify | Use `<LinkedText>` for title display and citation page/notes |
| `src/renderer/views/LinkRulesView.vue` | Create | Settings UI for managing link rules |
| `src/renderer/router.ts` | Modify | Add `/link-rules` route |
| `src/renderer/App.vue` | Modify | Add sidebar nav link to Link Rules |

---

### Task 1: Core Engine — Types and linkify()

**Files:**
- Create: `src/api/source-linker.ts`
- Create: `tests/unit/source-linker.test.ts`

- [ ] **Step 1: Write failing tests for linkify()**

Create `tests/unit/source-linker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { linkify, type LinkRule, type LinkedSegment } from '../../src/api/source-linker';

const testRule: LinkRule = {
  id: 'test-aid',
  name: 'Test AID',
  pattern: 'AID:\\s*v(\\d+)\\.b(\\d+)',
  urlTemplate: 'https://example.com/volume/v$1?image=$2',
  locale: '*',
  enabled: true,
  priority: 10,
};

describe('linkify', () => {
  it('returns plain segment for text with no matches', () => {
    const result = linkify('no links here', [testRule]);
    expect(result).toEqual([{ text: 'no links here' }]);
  });

  it('returns empty array for empty string', () => {
    const result = linkify('', [testRule]);
    expect(result).toEqual([]);
  });

  it('extracts a single match with surrounding text', () => {
    const result = linkify('ref: AID: v12345.b67 end', [testRule]);
    expect(result).toEqual([
      { text: 'ref: ' },
      { text: 'AID: v12345.b67', url: 'https://example.com/volume/v12345?image=67', ruleName: 'Test AID' },
      { text: ' end' },
    ]);
  });

  it('extracts multiple matches', () => {
    const result = linkify('first AID: v1.b2 then AID: v3.b4', [testRule]);
    expect(result).toHaveLength(4);
    expect(result[1]).toEqual({
      text: 'AID: v1.b2',
      url: 'https://example.com/volume/v1?image=2',
      ruleName: 'Test AID',
    });
    expect(result[3]).toEqual({
      text: 'AID: v3.b4',
      url: 'https://example.com/volume/v3?image=4',
      ruleName: 'Test AID',
    });
  });

  it('handles match at start of string', () => {
    const result = linkify('AID: v1.b2 rest', [testRule]);
    expect(result[0]).toEqual({
      text: 'AID: v1.b2',
      url: 'https://example.com/volume/v1?image=2',
      ruleName: 'Test AID',
    });
  });

  it('handles match at end of string', () => {
    const result = linkify('see AID: v1.b2', [testRule]);
    expect(result).toHaveLength(2);
    expect(result[1].url).toBeDefined();
  });

  it('skips disabled rules', () => {
    const disabled = { ...testRule, enabled: false };
    const result = linkify('AID: v1.b2', [disabled]);
    expect(result).toEqual([{ text: 'AID: v1.b2' }]);
  });

  it('higher priority rule wins on overlap', () => {
    const lowPriority: LinkRule = {
      id: 'low',
      name: 'Low',
      pattern: 'AID:\\s*v\\d+',
      urlTemplate: 'https://low.com/$0',
      locale: '*',
      enabled: true,
      priority: 50,
    };
    const result = linkify('AID: v12345.b67', [lowPriority, testRule]);
    expect(result[0].url).toBe('https://example.com/volume/v12345?image=67');
    expect(result[0].ruleName).toBe('Test AID');
  });

  it('supports $0 as full match reference', () => {
    const urlRule: LinkRule = {
      id: 'url',
      name: 'URL',
      pattern: 'https?://[^\\s]+',
      urlTemplate: '$0',
      locale: '*',
      enabled: true,
      priority: 100,
    };
    const result = linkify('visit https://example.com/page today', [urlRule]);
    expect(result[1]).toEqual({
      text: 'https://example.com/page',
      url: 'https://example.com/page',
      ruleName: 'URL',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/source-linker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement linkify()**

Create `src/api/source-linker.ts`:

```typescript
export interface LinkRule {
  id: string;
  name: string;
  pattern: string;
  urlTemplate: string;
  locale: string;
  enabled: boolean;
  priority: number;
}

export interface LinkedSegment {
  text: string;
  url?: string;
  ruleName?: string;
}

export interface LinkRuleOverrides {
  enabledLocales: string[];
  overrides: Record<string, Partial<LinkRule> & { enabled?: boolean }>;
}

function substituteCaptures(template: string, match: RegExpMatchArray): string {
  return template.replace(/\$(\d+)/g, (_, n) => {
    const idx = parseInt(n, 10);
    if (idx === 0) return match[0];
    return match[idx] ?? '';
  });
}

export function linkify(text: string, rules: LinkRule[]): LinkedSegment[] {
  if (!text) return [];

  const enabledRules = rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  if (enabledRules.length === 0) return [{ text }];

  interface Match {
    start: number;
    end: number;
    text: string;
    url: string;
    ruleName: string;
    priority: number;
  }

  const matches: Match[] = [];

  for (const rule of enabledRules) {
    const regex = new RegExp(rule.pattern, 'g');
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const url = substituteCaptures(rule.urlTemplate, m);
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        url,
        ruleName: rule.name,
        priority: rule.priority,
      });
    }
  }

  if (matches.length === 0) return [{ text }];

  // Sort by start position, then by priority (lower wins)
  matches.sort((a, b) => a.start - b.start || a.priority - b.priority);

  // Remove overlapping matches (first match at each position wins)
  const filtered: Match[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }

  // Build segments
  const segments: LinkedSegment[] = [];
  let pos = 0;
  for (const m of filtered) {
    if (m.start > pos) {
      segments.push({ text: text.slice(pos, m.start) });
    }
    segments.push({ text: m.text, url: m.url, ruleName: m.ruleName });
    pos = m.end;
  }
  if (pos < text.length) {
    segments.push({ text: text.slice(pos) });
  }

  return segments;
}

export function resolveRules(
  allDefaults: LinkRule[],
  config: LinkRuleOverrides
): LinkRule[] {
  const { enabledLocales, overrides } = config;

  const activeLocales = new Set([...enabledLocales, '*']);
  const rules = allDefaults
    .filter((r) => activeLocales.has(r.locale))
    .map((r) => {
      const override = overrides[r.id];
      if (!override) return r;
      return { ...r, ...override };
    });

  const defaultIds = new Set(allDefaults.map((r) => r.id));
  for (const [id, override] of Object.entries(overrides)) {
    if (!defaultIds.has(id) && override.pattern && override.urlTemplate && override.name) {
      rules.push({
        id,
        name: override.name!,
        pattern: override.pattern!,
        urlTemplate: override.urlTemplate!,
        locale: override.locale ?? '*',
        enabled: override.enabled ?? true,
        priority: override.priority ?? 50,
      });
    }
  }

  return rules.sort((a, b) => a.priority - b.priority);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/source-linker.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```
feat: add source linker engine with linkify() and resolveRules()
```

---

### Task 2: Default Rule Sets

**Files:**
- Create: `src/api/link-rules/sv.ts`
- Create: `src/api/link-rules/en.ts`
- Create: `src/api/link-rules/universal.ts`
- Modify: `tests/unit/source-linker.test.ts`

- [ ] **Step 1: Write failing tests for default rules**

Add to `tests/unit/source-linker.test.ts`:

```typescript
import { svRules } from '../../src/api/link-rules/sv';
import { enRules } from '../../src/api/link-rules/en';
import { universalRules } from '../../src/api/link-rules/universal';

describe('Swedish default rules', () => {
  it('matches ArkivDigital AID with page suffix', () => {
    const result = linkify('(AID: v170308.b530.s44, NAD: SE/VALA/00333)', svRules);
    const aidSeg = result.find((s) => s.ruleName === 'ArkivDigital (AID)');
    expect(aidSeg).toBeDefined();
    expect(aidSeg!.url).toBe('https://app.arkivdigital.se/volume/v170308?image=530');
  });

  it('matches ArkivDigital AID without page suffix', () => {
    const result = linkify('AID: v36086.b20', svRules);
    const aidSeg = result.find((s) => s.url);
    expect(aidSeg!.url).toBe('https://app.arkivdigital.se/volume/v36086?image=20');
  });

  it('matches Riksarkivet NAD code', () => {
    const result = linkify('NAD: SE/VALA/00333', svRules);
    const nadSeg = result.find((s) => s.ruleName === 'Riksarkivet (NAD)');
    expect(nadSeg).toBeDefined();
    expect(nadSeg!.url).toContain('SE/VALA/00333');
  });

  it('matches Sveriges Befolkning abbreviation', () => {
    const result = linkify('SvBf1980', svRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
  });
});

describe('English default rules', () => {
  it('matches FamilySearch ARK', () => {
    const result = linkify('see ark:/61903/1:1:XHLN-69H for details', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.familysearch.org/ark:/61903/1:1:XHLN-69H');
  });

  it('matches FindAGrave memorial', () => {
    const result = linkify('Find A Grave memorial 12345678', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.findagrave.com/memorial/12345678');
  });

  it('matches Ancestry record URL', () => {
    const result = linkify('ancestry.com/discoveryui-content/view/12345:6789', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.ancestry.com/discoveryui-content/view/12345:6789');
  });
});

describe('Universal rules', () => {
  it('matches plain HTTPS URL', () => {
    const result = linkify('visit https://example.com/page today', universalRules);
    const seg = result.find((s) => s.url);
    expect(seg!.url).toBe('https://example.com/page');
  });

  it('matches plain HTTP URL', () => {
    const result = linkify('see http://old.site.com/doc', universalRules);
    const seg = result.find((s) => s.url);
    expect(seg!.url).toBe('http://old.site.com/doc');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/unit/source-linker.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create Swedish rules**

Create `src/api/link-rules/sv.ts`:

```typescript
import type { LinkRule } from '../source-linker';

export const svRules: LinkRule[] = [
  {
    id: 'arkivdigital-aid',
    name: 'ArkivDigital (AID)',
    pattern: 'AID:\\s*v(\\d+)\\.b(\\d+)(?:\\.s\\d+)?',
    urlTemplate: 'https://app.arkivdigital.se/volume/v$1?image=$2',
    locale: 'sv',
    enabled: true,
    priority: 10,
  },
  {
    id: 'riksarkivet-nad',
    name: 'Riksarkivet (NAD)',
    pattern: 'NAD:\\s*(SE/[A-Za-z]+/\\d+)',
    urlTemplate: 'https://sok.riksarkivet.se/nad?postid=ArkisRef+$1',
    locale: 'sv',
    enabled: true,
    priority: 10,
  },
  {
    id: 'riksarkivet-bildvisning',
    name: 'Riksarkivet Image',
    pattern: 'sok\\.riksarkivet\\.se/bildvisning/([A-Z0-9_]+)',
    urlTemplate: 'https://sok.riksarkivet.se/bildvisning/$1',
    locale: 'sv',
    enabled: true,
    priority: 20,
  },
  {
    id: 'svbf',
    name: 'Sveriges Befolkning',
    pattern: 'SvBf\\d{4}|Sveriges [Bb]efolkning \\d{4}',
    urlTemplate: 'https://www.genealogi.se/',
    locale: 'sv',
    enabled: true,
    priority: 50,
  },
];
```

- [ ] **Step 4: Create English rules**

Create `src/api/link-rules/en.ts`:

```typescript
import type { LinkRule } from '../source-linker';

export const enRules: LinkRule[] = [
  {
    id: 'familysearch-ark',
    name: 'FamilySearch ARK',
    pattern: 'ark:/61903/([^\\s,;)]+)',
    urlTemplate: 'https://www.familysearch.org/ark:/61903/$1',
    locale: 'en',
    enabled: true,
    priority: 10,
  },
  {
    id: 'findagrave',
    name: 'FindAGrave Memorial',
    pattern: 'Find\\s*[Aa]\\s*Grave[^0-9]*(\\d{5,})',
    urlTemplate: 'https://www.findagrave.com/memorial/$1',
    locale: 'en',
    enabled: true,
    priority: 20,
  },
  {
    id: 'ancestry-record',
    name: 'Ancestry Record',
    pattern: 'ancestry\\.com/discoveryui-content/view/(\\d+):(\\d+)',
    urlTemplate: 'https://www.ancestry.com/discoveryui-content/view/$1:$2',
    locale: 'en',
    enabled: true,
    priority: 20,
  },
  {
    id: 'familysearch-film',
    name: 'FamilySearch Film',
    pattern: '[Ff]ilm\\s*#?\\s*(\\d{6,})',
    urlTemplate: 'https://www.familysearch.org/search/film/$1',
    locale: 'en',
    enabled: true,
    priority: 30,
  },
];
```

- [ ] **Step 5: Create universal rules**

Create `src/api/link-rules/universal.ts`:

```typescript
import type { LinkRule } from '../source-linker';

export const universalRules: LinkRule[] = [
  {
    id: 'plain-url',
    name: 'URL',
    pattern: 'https?://[^\\s<>"\\)\\]]+',
    urlTemplate: '$0',
    locale: '*',
    enabled: true,
    priority: 100,
  },
];
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/source-linker.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```
feat: add Swedish, English, and universal default link rules
```

---

### Task 3: resolveRules() Tests

**Files:**
- Modify: `tests/unit/source-linker.test.ts`

- [ ] **Step 1: Add resolveRules() tests**

Add to `tests/unit/source-linker.test.ts`:

```typescript
import { resolveRules } from '../../src/api/source-linker';

describe('resolveRules', () => {
  const defaults: LinkRule[] = [
    { id: 'sv-1', name: 'SV Rule', pattern: 'sv', urlTemplate: 'https://sv.com', locale: 'sv', enabled: true, priority: 10 },
    { id: 'en-1', name: 'EN Rule', pattern: 'en', urlTemplate: 'https://en.com', locale: 'en', enabled: true, priority: 10 },
    { id: 'uni-1', name: 'Universal', pattern: 'uni', urlTemplate: 'https://uni.com', locale: '*', enabled: true, priority: 100 },
  ];

  it('includes only rules from enabled locales plus universal', () => {
    const result = resolveRules(defaults, { enabledLocales: ['sv'], overrides: {} });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('sv-1');
    expect(ids).toContain('uni-1');
    expect(ids).not.toContain('en-1');
  });

  it('applies enabled override to disable a default rule', () => {
    const result = resolveRules(defaults, {
      enabledLocales: ['sv'],
      overrides: { 'sv-1': { enabled: false } },
    });
    const svRule = result.find((r) => r.id === 'sv-1');
    expect(svRule!.enabled).toBe(false);
  });

  it('adds custom rules from overrides', () => {
    const result = resolveRules(defaults, {
      enabledLocales: ['sv'],
      overrides: {
        'custom-1': {
          name: 'Custom',
          pattern: 'cust',
          urlTemplate: 'https://cust.com/$1',
          enabled: true,
          priority: 25,
        },
      },
    });
    const custom = result.find((r) => r.id === 'custom-1');
    expect(custom).toBeDefined();
    expect(custom!.name).toBe('Custom');
  });

  it('sorts output by priority', () => {
    const result = resolveRules(defaults, { enabledLocales: ['sv', 'en'], overrides: {} });
    for (let i = 1; i < result.length; i++) {
      expect(result[i].priority).toBeGreaterThanOrEqual(result[i - 1].priority);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --run tests/unit/source-linker.test.ts`
Expected: All tests PASS (resolveRules was implemented in Task 1)

- [ ] **Step 3: Commit**

```
test: add resolveRules() unit tests
```

---

### Task 4: IPC — shell:open-external and db:setSetting

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add shell:open-external handler to ipc.ts**

In `src/main/ipc.ts`, add `shell` to the electron import:

```typescript
import { shell } from 'electron';
```

Add handler after existing db handlers:

```typescript
wrapHandler('shell:open-external', (url) => {
  const urlStr = url as string;
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    throw new Error('Only http and https URLs are allowed');
  }
  return shell.openExternal(urlStr);
});
```

- [ ] **Step 2: Add db:setSetting handler to ipc.ts**

Add `setDbSetting` to the import from `'../api/db_settings'`:

```typescript
import { getDbSetting, setDbSetting } from '../api/db_settings';
```

Add handler after existing `db:getSetting`:

```typescript
wrapHandler('db:setSetting', (key, value) =>
  setDbSetting(getDatabase(), key as string, value as string)
);
```

- [ ] **Step 3: Add window.api.shell and db.setSetting to preload**

In `src/preload/index.ts`, add `setSetting` to the `db` namespace (after `getSetting` on line 103):

```typescript
setSetting: (key: string, value: string) => ipcRenderer.invoke('db:setSetting', key, value),
```

Add a new `shell` namespace in the api object:

```typescript
shell: {
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
},
```

- [ ] **Step 4: Commit**

```
feat: add shell:open-external and db:setSetting IPC channels
```

---

### Task 5: LinkedText Vue Component

**Files:**
- Create: `src/renderer/components/LinkedText.vue`

- [ ] **Step 1: Create LinkedText.vue**

Create `src/renderer/components/LinkedText.vue`:

```vue
<template>
  <span class="linked-text">
    <template v-for="(seg, i) in segments" :key="i">
      <a
        v-if="seg.url"
        :href="seg.url"
        :title="seg.ruleName"
        class="source-link"
        @click.prevent="openExternal(seg.url!)"
      >{{ seg.text }}</a>
      <template v-else>{{ seg.text }}</template>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { linkify, type LinkedSegment } from '../../api/source-linker';
import { svRules } from '../../api/link-rules/sv';
import { enRules } from '../../api/link-rules/en';
import { universalRules } from '../../api/link-rules/universal';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

const props = defineProps<{
  text: string;
}>();

const allRules = [...svRules, ...enRules, ...universalRules];

const segments = computed<LinkedSegment[]>(() => {
  if (!props.text) return [];
  return linkify(props.text, allRules);
});

function openExternal(url: string) {
  window.api.shell.openExternal(url);
}
</script>

<style scoped>
.source-link {
  color: var(--link-color, #4a9eff);
  text-decoration: underline;
  text-decoration-style: dotted;
  cursor: pointer;
}
.source-link:hover {
  text-decoration-style: solid;
}
</style>
```

- [ ] **Step 2: Commit**

```
feat: add LinkedText Vue component for auto-linking source references
```

---

### Task 6: Integrate LinkedText into SourceDetailView

**Files:**
- Modify: `src/renderer/views/SourceDetailView.vue`

- [ ] **Step 1: Import LinkedText component**

In `src/renderer/views/SourceDetailView.vue`, add to the `<script setup>` imports:

```typescript
import LinkedText from '../components/LinkedText.vue';
```

- [ ] **Step 2: Add LinkedText to source title in header**

Replace the `<h2>` at line 5:

From:
```html
<h2>{{ source.title }}</h2>
```

To:
```html
<h2><LinkedText :text="source.title" /></h2>
```

- [ ] **Step 3: Add LinkedText to citation page column**

Replace the page `<td>` at line 71:

From:
```html
<td>{{ cit.page || '—' }}</td>
```

To:
```html
<td><LinkedText v-if="cit.page" :text="cit.page" /><span v-else>—</span></td>
```

- [ ] **Step 4: Verify manually**

Run: `npm start`
Navigate to a source detail page with AID/NAD references. Verify:
- Source title in `<h2>` header renders references as clickable links
- Citation page column renders references as links
- Clicking a link opens the system browser

- [ ] **Step 5: Commit**

```
feat: integrate LinkedText into SourceDetailView for source titles and citation pages
```

---

### Task 7: Link Rules Settings View

**Files:**
- Create: `src/renderer/views/LinkRulesView.vue`
- Modify: `src/renderer/router.ts`
- Modify: `src/renderer/App.vue`
- Modify: `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`

- [ ] **Step 1: Create LinkRulesView.vue**

Create `src/renderer/views/LinkRulesView.vue` with:
- Locale toggles (checkboxes for Swedish/English defaults)
- Active rules table with name, pattern, URL template, priority, enabled toggle, delete button for custom rules
- Test field textarea with preview of matched segments
- Add custom rule modal with name, regex pattern, URL template, priority fields, regex validation
- Load/save config via `window.api.db.getSetting('link_rules_config')` / `window.api.db.setSetting('link_rules_config', json)`

The component uses `resolveRules()` from `src/api/source-linker.ts` and all three default rule sets. Custom rules are stored in `db_settings` as JSON under key `link_rules_config`. The full LinkRuleOverrides structure is: `{ enabledLocales: string[], overrides: Record<string, Partial<LinkRule>> }`.

See the spec at `.claude/plans/2026-04-10-source-linker-design.md` for the complete component structure (Settings section).

- [ ] **Step 2: Add route to router.ts**

In `src/renderer/router.ts`, add after the media route:

```typescript
{ path: '/link-rules', component: () => import('./views/LinkRulesView.vue') },
```

- [ ] **Step 3: Add sidebar nav link in App.vue**

Add a `<router-link>` to the sidebar nav in `src/renderer/App.vue`, near the database link. Use i18n key `nav.linkRules`. Follow the existing nav link pattern (look at how other routes like `/database` or `/quality` are linked).

- [ ] **Step 4: Add i18n keys**

Add to both `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`:

Swedish:
```typescript
nav: {
  // ... existing keys
  linkRules: 'Lankregler',
},
linkRules: {
  title: 'Lankregler',
  defaultRuleSets: 'Standardregler',
  swedish: 'Svenska',
  english: 'Engelska',
  activeRules: 'Aktiva regler',
  addRule: 'Lagg till regel',
  name: 'Namn',
  pattern: 'Monster (regex)',
  urlTemplate: 'URL-mall',
  priority: 'Prioritet',
  enabled: 'Aktiv',
  noRules: 'Inga regler aktiva',
  testField: 'Testa',
  testPlaceholder: 'Klistra in text for att testa vilka regler som matchar...',
},
```

English:
```typescript
nav: {
  // ... existing keys
  linkRules: 'Link Rules',
},
linkRules: {
  title: 'Link Rules',
  defaultRuleSets: 'Default Rule Sets',
  swedish: 'Swedish',
  english: 'English',
  activeRules: 'Active Rules',
  addRule: 'Add Rule',
  name: 'Name',
  pattern: 'Pattern (regex)',
  urlTemplate: 'URL Template',
  priority: 'Priority',
  enabled: 'Enabled',
  noRules: 'No rules active',
  testField: 'Test',
  testPlaceholder: 'Paste text here to test which rules match...',
},
```

- [ ] **Step 5: Verify manually**

Run: `npm start`
Navigate to Link Rules via sidebar. Verify:
- Locale toggles show and persist
- Rules table displays all default rules
- Adding a custom rule works (with regex validation)
- Test field previews matches
- Disabling a rule persists across page reload

- [ ] **Step 6: Commit**

```
feat: add Link Rules settings view with rule management and test field
```

---

### Task 8: Run Full Test Suite and Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/PLAN.md`
- Modify: `package.json` (version bump)

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: All tests pass including new source-linker tests

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors (fix any that appear)

- [ ] **Step 3: Update CLAUDE.md**

Add to File Map under `src/api/`:
```
│   ├── source-linker.ts          # Text-to-link engine: linkify(), resolveRules()
│   └── link-rules/               # Default link rule sets
│       ├── sv.ts                  # Swedish rules (ArkivDigital, Riksarkivet, etc.)
│       ├── en.ts                  # English rules (FamilySearch, FindAGrave, Ancestry)
│       └── universal.ts           # Universal rules (plain URLs)
```

Add `LinkedText` to the Shared Components table:
```
| `LinkedText` | `text: string` | — | Auto-links structured references in text. Scans with regex rules, renders matches as `<a>` tags that open in system browser via `shell.openExternal`. |
```

Add `/link-rules` to the Routes table:
```
| `/link-rules` | `LinkRulesView` | Link rule management: locale toggles, rule table, custom rules, test field |
```

- [ ] **Step 4: Update .claude/PLAN.md**

Add Source Linker to the Implementation Status table.

- [ ] **Step 5: Version bump**

This is a new feature — bump minor version in `package.json`.

- [ ] **Step 6: Commit**

```
feat: source linker — configurable auto-linking for genealogy source references (vX.Y.0)
```
