# Source Linker — Design Spec

**Date:** 2026-04-10
**Status:** Draft

## Problem

Genealogy source references contain structured text that could link directly to authoritative online archives — ArkivDigital, Riksarkivet, FamilySearch, Ancestry, FindAGrave, etc. Currently these references are displayed as plain text, requiring users to manually copy identifiers and navigate to external sites.

## Design Principles

1. **Enrich presentation, not the data model** — Links are computed at render time from existing text fields. No new tables, no stored URLs, no sync obligations.
2. **Inline links, not dedicated sections** — Keep the UI uncluttered. Linkable text becomes a clickable `<a>` tag in place.
3. **External links open in system browser** — The app stays lean and focused. External sites often require authentication.
4. **Regex over custom DSLs** — Use well-known standards for pattern definitions. Users who add custom rules already know regex.
5. **Configurable with sensible defaults** — Ship Swedish and English rule sets. Users can enable/disable rules and add custom ones per database.

## Architecture

### Core Engine: `src/api/source-linker.ts`

A pure TypeScript module with zero Electron dependencies. Follows the existing `src/api/` pattern: all functions are pure, testable, and take explicit arguments.

```typescript
interface LinkRule {
  id: string;           // unique identifier, e.g. "arkivdigital-aid"
  name: string;         // human-readable, e.g. "ArkivDigital (AID)"
  pattern: string;      // regex string, e.g. "AID:\\s*v(\\d+)\\.b(\\d+)"
  urlTemplate: string;  // URL with $1, $2, ... for capture groups
  locale: string;       // "sv", "en", or "*" for universal
  enabled: boolean;
  priority: number;     // lower = matched first (for overlapping patterns)
}

interface LinkedSegment {
  text: string;         // the display text
  url?: string;         // present if this segment is a link
  ruleName?: string;    // which rule matched (for tooltips)
}

// Core function — scans text against enabled rules, returns segments
function linkify(
  text: string,
  rules: LinkRule[],
  context?: { repositoryIds?: string[] }
): LinkedSegment[]

// Merges default rules with user overrides
function resolveRules(
  defaults: LinkRule[],
  overrides: LinkRuleOverrides
): LinkRule[]
```

**Matching behavior:**
- Rules are sorted by priority (ascending). Lower priority number = matched first.
- The engine scans left-to-right. When a rule matches, that span is consumed — later rules cannot match within it.
- When two rules match at the same position, the higher-priority (lower number) rule wins.
- Non-matching text becomes plain `LinkedSegment` entries (no `url`).
- The optional `context.repositoryIds` allows repository-aware rule boosting — future enhancement, not required for v1.

### Default Rule Sets

Rule sets ship as TypeScript files in `src/api/link-rules/`:

#### `sv.ts` — Swedish Defaults

| ID | Name | Pattern | URL Template | Priority |
|----|------|---------|-------------|----------|
| `arkivdigital-aid` | ArkivDigital (AID) | `AID:\s*v(\d+)\.b(\d+)(?:\.s(\d+))?` | `https://app.arkivdigital.se/volume/v$1?image=$2` | 10 |
| `riksarkivet-nad` | Riksarkivet (NAD) | `NAD:\s*(SE/[A-Za-z]+/\d+)` | `https://sok.riksarkivet.se/nad?postid=ArkisRef+$1` | 10 |
| `riksarkivet-bildvisning` | Riksarkivet Image | `sok\.riksarkivet\.se/bildvisning/([A-Z0-9_]+)` | `https://sok.riksarkivet.se/bildvisning/$1` | 20 |
| `dodbok` | Sveriges Dödbok | `[Dd]ödboken\s+\d{4}[-–]\d{4}` | `https://www.genealogi.se/` | 50 |
| `svbf` | Sveriges Befolkning | `SvBf(\d{4})\|Sveriges [Bb]efolkning (\d{4})` | `https://www.genealogi.se/` | 50 |

#### `en.ts` — English Defaults

| ID | Name | Pattern | URL Template | Priority |
|----|------|---------|-------------|----------|
| `familysearch-ark` | FamilySearch ARK | `ark:/61903/([^\s,;)]+)` | `https://www.familysearch.org/ark:/61903/$1` | 10 |
| `findagrave` | FindAGrave Memorial | `Find\s*[Aa]\s*Grave[^0-9]*(\d{5,})` | `https://www.findagrave.com/memorial/$1` | 20 |
| `ancestry-record` | Ancestry Record | `ancestry\.com/discoveryui-content/view/(\d+):(\d+)` | `https://www.ancestry.com/discoveryui-content/view/$1:$2` | 20 |
| `familysearch-film` | FamilySearch Film | `[Ff]ilm\s*#?\s*(\d{6,})` | `https://www.familysearch.org/search/film/$1` | 30 |

#### Universal rules (included in both)

| ID | Name | Pattern | URL Template | Priority |
|----|------|---------|-------------|----------|
| `plain-url` | Plain URL | `https?://[^\s<>")\]]+` | `$0` (special: matched text is the URL) | 100 |

### Vue Component: `<LinkedText>`

Location: `src/renderer/components/LinkedText.vue`

```vue
<template>
  <span class="linked-text">
    <template v-for="(seg, i) in segments" :key="i">
      <a v-if="seg.url"
         :href="seg.url"
         :title="seg.ruleName"
         class="source-link"
         @click.prevent="openExternal(seg.url)">
        {{ seg.text }}
      </a>
      <span v-else>{{ seg.text }}</span>
    </template>
  </span>
</template>
```

**Props:**
- `text: string` — the raw text to scan
- `repositoryIds?: string[]` — optional repository context (future use)

**Behavior:**
- Calls `linkify()` with rules from the current database's resolved rule set
- Links open via `window.api.shell.openExternal(url)` (new IPC channel)
- Tooltip on hover shows the rule name (e.g., "ArkivDigital (AID)")
- Falls back to plain `<span>{{ text }}</span>` if no rules match (zero visual change)

### IPC: `shell.openExternal`

New IPC channel to safely open URLs in the system browser:

- **Main:** `ipcMain.handle('shell:open-external', (_, url) => shell.openExternal(url))`
- **Preload:** `window.api.shell.openExternal(url: string)`
- **Validation:** Main process validates the URL starts with `https://` or `http://` before opening

### Fields Where `<LinkedText>` Is Used

Initial rollout — the fields most likely to contain linkable references:

| View | Field | Component |
|------|-------|-----------|
| `SourceDetailView` | `title` | Replace `<input>` display with `<LinkedText>` (edit mode stays as input) |
| `SourceDetailView` | `url` | Replace plain text with `<LinkedText>` |
| Citation tables | `page` | Wrap cell content in `<LinkedText>` |
| Citation tables/modals | `notes` | Wrap display content in `<LinkedText>` |

Future expansion (not in v1): person notes, relationship notes, transcription fields.

### Settings: Link Rules Configuration

New section in the Settings panel, under a "Link Rules" heading:

- **Locale toggles:** Checkboxes for "Swedish defaults" and "English defaults" (both can be active)
- **Rules table:** Shows all active rules — name, pattern preview (truncated), enabled toggle
- **Add custom rule:** Button opens a modal with fields: name, regex pattern, URL template, priority
- **Test field:** Text input where users can paste sample text to preview which rules match and what URLs they produce
- **Delete/reset:** Custom rules can be deleted. Default rules can be disabled but not deleted. A "Reset to defaults" button restores all overrides.

### Storage: Per-Database Overrides

Stored in `db_settings` under key `link_rules_config`:

```json
{
  "enabledLocales": ["sv", "en"],
  "overrides": {
    "arkivdigital-aid": { "enabled": false },
    "my-custom-rule": {
      "id": "my-custom-rule",
      "name": "My Archive",
      "pattern": "MyArch-(\\d+)",
      "urlTemplate": "https://myarchive.example.com/record/$1",
      "locale": "*",
      "enabled": true,
      "priority": 15
    }
  }
}
```

The `resolveRules()` function merges defaults with overrides:
1. Start with all default rules from enabled locales
2. Apply per-rule `enabled` overrides
3. Add custom rules from overrides
4. Sort by priority

## Testing

### Unit Tests (`tests/unit/source-linker.test.ts`)

- Each default rule: verify pattern matches expected strings and produces correct URLs
- Overlapping matches: verify priority resolution
- Edge cases: empty strings, no matches, malformed text, partial patterns
- `resolveRules()`: verify merge logic with overrides
- Capture group substitution: verify `$1`, `$2`, etc. replacement in URL templates

### Manual Testing

- Import the GEDCOM file (`Linda_Ahnstedt_utf8_260403.ged`) and verify AID/NAD references in citation notes become clickable links
- Verify links open in system browser
- Verify Settings UI can disable/enable rules and add custom ones

## Scope Boundaries

**In scope:**
- Core linkify engine with tests
- Swedish and English default rule sets
- `<LinkedText>` Vue component
- `shell.openExternal` IPC channel
- Settings UI for rule management
- Integration into source title, source URL, citation page, citation notes

**Out of scope (future):**
- Repository-aware rule boosting (using source→repository relationship)
- Auto-detecting locale from database content
- Importing link rules from GEDCOM REPO records
- Rendering links in person/relationship notes
- MCP tools for link rule management
