# GEDCOM 7.0 Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GEDCOM 7.0 as a selectable export format, alongside the existing GEDCOM 5.5.1 export, with version-appropriate tag changes throughout.

**Architecture:** The existing `exportGedcom(db)` in `src/gedcom/exporter.ts` gains an optional `version: '5.5.1' | '7.0'` parameter. Version-specific formatting is handled inline with small helper differences — no new files needed. IPC and preload are extended to pass the version option through; the Vue export section gains a format selector.

**Tech Stack:** TypeScript, Electron IPC, Vue 3 Composition API, Vitest for unit tests.

---

## What changes between 5.5.1 and 7.0

| Area | 5.5.1 | 7.0 |
|------|-------|-----|
| HEAD | `1 GEDC` `2 VERS 5.5.1` `1 CHAR UTF-8` | `1 GEDC` `2 VERS 7.0` (no CHAR — UTF-8 mandatory) |
| External identifiers | `1 REFN value` `2 TYPE label` | `1 EXID value` `2 TYPE label` |
| Unparseable dates | `2 DATE Summer 1923` (lenient) | `2 DATE` `3 PHRASE Summer 1923` |
| Parseable dates with original | `2 DATE 12 JUN 1845` (no PHRASE) | `2 DATE 12 JUN 1845` `3 PHRASE 12 JUN 1845` (optional, emit when original is set) |
| PEDI values | lowercase: `birth`, `adopted`, `foster` | UPPERCASE: `BIRTH`, `ADOPTED`, `FOSTER` |
| NAME.TYPE for `alias` | `ALIAS` (non-standard extension) | `AKA` (in the 7.0 NameType enumeration) |

Everything else (INDI/FAM structure, HUSB/WIFE, PLAC/MAP, SOUR/REPO, ASSO, custom `_` extension tags) stays identical — 7.0 retains backward compatibility for all of these.

---

## File Map

| File | Change |
|------|--------|
| `src/gedcom/exporter.ts` | Add `version` param; version-aware header, EXID, PHRASE, PEDI, NAME.TYPE |
| `src/gedcom/date.ts` | Add `isStandardGedcomDate(s): boolean` helper (used for PHRASE detection) |
| `src/main/ipc.ts` | `gedcom:export` handler accepts `{ version?: string }` opts |
| `src/preload/index.ts` | `export: (opts?: { version?: string }) => ...` |
| `src/renderer/views/ImportExportView.vue` | Format `<select>` + single Export button |
| `tests/unit/gedcom-export-70.test.ts` | New unit test file for 7.0-specific behaviour |
| `.claude/IPC_REFERENCE.md` | Update `gedcom:export` signature |
| `CLAUDE.md` | Update preload surface for `gedcom.export` |

---

## Task 1: `isStandardGedcomDate` helper in date.ts

**Files:**
- Modify: `src/gedcom/date.ts`
- Test: `tests/unit/gedcom-export-70.test.ts` (create)

- [ ] **Step 1: Create the test file and write a failing test**

```typescript
// tests/unit/gedcom-export-70.test.ts
import { describe, it, expect } from 'vitest';
import { isStandardGedcomDate } from '../../src/gedcom/date';

describe('isStandardGedcomDate', () => {
  it('accepts exact date', () => {
    expect(isStandardGedcomDate('12 JUN 1845')).toBe(true);
  });
  it('accepts ABT prefix', () => {
    expect(isStandardGedcomDate('ABT 1900')).toBe(true);
  });
  it('accepts BEF prefix', () => {
    expect(isStandardGedcomDate('BEF 1900')).toBe(true);
  });
  it('accepts BET … AND …', () => {
    expect(isStandardGedcomDate('BET 1900 AND 1910')).toBe(true);
  });
  it('rejects free-text', () => {
    expect(isStandardGedcomDate('Summer 1923')).toBe(false);
  });
  it('rejects empty string', () => {
    expect(isStandardGedcomDate('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- tests/unit/gedcom-export-70.test.ts
```

Expected: FAIL — `isStandardGedcomDate is not a function`.

- [ ] **Step 3: Add the helper to `src/gedcom/date.ts`**

Add at the end of the file (after `formatGedcomDate`):

```typescript
/**
 * Returns true if the string is a parseable GEDCOM date value (not free-text).
 * Used by the 7.0 exporter to decide whether to emit PHRASE instead of DATE value.
 */
export function isStandardGedcomDate(s: string): boolean {
  if (!s || !s.trim()) return false;
  return parseGedcomDate(s).date_type !== 'unknown';
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- tests/unit/gedcom-export-70.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gedcom/date.ts tests/unit/gedcom-export-70.test.ts
git commit -m "feat(gedcom): add isStandardGedcomDate helper for 7.0 PHRASE detection"
```

---

## Task 2: Extend `exportGedcom` signature — header + EXID

**Files:**
- Modify: `src/gedcom/exporter.ts`
- Modify: `tests/unit/gedcom-export-70.test.ts`

- [ ] **Step 1: Write failing tests for header and EXID**

Append to `tests/unit/gedcom-export-70.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createPerson, addPersonName, addPersonIdentifier } from '../../src/api/persons';

// (add db variable and beforeEach at the top of the file — move all imports there)
let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('exportGedcom 7.0 — header', () => {
  it('emits GEDC VERS 7.0 and no CHAR tag', () => {
    const out = exportGedcom(db, '7.0');
    expect(out).toContain('2 VERS 7.0');
    expect(out).not.toContain('1 CHAR UTF-8');
  });
  it('5.5.1 export is unchanged', () => {
    const out = exportGedcom(db, '5.5.1');
    expect(out).toContain('2 VERS 5.5.1');
    expect(out).toContain('1 CHAR UTF-8');
  });
  it('default (no arg) is 5.5.1', () => {
    const out = exportGedcom(db);
    expect(out).toContain('2 VERS 5.5.1');
  });
});

describe('exportGedcom 7.0 — EXID identifiers', () => {
  it('emits EXID for familysearch identifier in 7.0', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonIdentifier(db, p.id, 'familysearch', 'LHWY-GQT');
    const out = exportGedcom(db, '7.0');
    expect(out).toContain('1 EXID LHWY-GQT');
    expect(out).toContain('2 TYPE FamilySearch');
    expect(out).not.toContain('1 REFN LHWY-GQT');
  });
  it('emits REFN for familysearch identifier in 5.5.1', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonIdentifier(db, p.id, 'familysearch', 'LHWY-GQT');
    const out = exportGedcom(db, '5.5.1');
    expect(out).toContain('1 REFN LHWY-GQT');
    expect(out).not.toContain('1 EXID');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npm test -- tests/unit/gedcom-export-70.test.ts
```

Expected: FAIL — `exportGedcom` doesn't accept a second argument yet.

- [ ] **Step 3: Add `version` param and implement header + EXID in `src/gedcom/exporter.ts`**

Change the function signature at line 77:

```typescript
export function exportGedcom(db: Database, version: '5.5.1' | '7.0' = '5.5.1'): string {
```

Change the HEAD lines at line 80:

```typescript
  if (version === '7.0') {
    lines.push('0 HEAD', '1 GEDC', '2 VERS 7.0');
  } else {
    lines.push('0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8');
  }
```

Replace the identifier switch statement (currently lines 228–256) with a version-aware version:

```typescript
    const identifiers = getPersonIdentifiers(db, p.id);
    for (const ident of identifiers) {
      const idTag = version === '7.0' ? 'EXID' : 'REFN';
      switch (ident.identifier_type) {
        case 'refn':
          lines.push(`1 ${idTag} ${ident.identifier_value}`);
          break;
        case 'rin':
          if (version === '7.0') {
            lines.push(`1 EXID ${ident.identifier_value}`);
            lines.push(`2 TYPE RIN`);
          } else {
            lines.push(`1 RIN ${ident.identifier_value}`);
          }
          break;
        case 'familysearch':
          lines.push(`1 ${idTag} ${ident.identifier_value}`);
          lines.push(`2 TYPE FamilySearch`);
          break;
        case 'ancestry':
          lines.push(`1 ${idTag} ${ident.identifier_value}`);
          lines.push(`2 TYPE Ancestry`);
          break;
        case 'riksarkivet':
          lines.push(`1 ${idTag} ${ident.identifier_value}`);
          lines.push(`2 TYPE Riksarkivet`);
          break;
        case 'personnummer':
          lines.push(`1 ${idTag} ${ident.identifier_value}`);
          lines.push(`2 TYPE Personnummer`);
          break;
        default: // 'other'
          lines.push(`1 ${idTag} ${ident.identifier_value}`);
          lines.push(`2 TYPE Other`);
          break;
      }
    }
```

Add the import for `isStandardGedcomDate` at the top of `exporter.ts`:

```typescript
import { formatGedcomDate, isStandardGedcomDate } from './date';
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/gedcom-export-70.test.ts
```

Expected: all tests in this file pass (header + EXID tests).

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/gedcom/exporter.ts src/gedcom/date.ts tests/unit/gedcom-export-70.test.ts
git commit -m "feat(gedcom): exportGedcom accepts version param; 7.0 header and EXID identifiers"
```

---

## Task 3: GEDCOM 7.0 date PHRASE emission

**Files:**
- Modify: `src/gedcom/exporter.ts`
- Modify: `tests/unit/gedcom-export-70.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/gedcom-export-70.test.ts`:

```typescript
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';

describe('exportGedcom 7.0 — DATE PHRASE', () => {
  it('emits PHRASE for unparseable date_original in 7.0', () => {
    const p = createPerson(db, { sex: 'M' });
    const ev = createEvent(db, {
      event_type: 'birth',
      date_type: 'unknown',
      date_original: 'Summer 1923',
    });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const out = exportGedcom(db, '7.0');
    // Unparseable: blank DATE value + PHRASE
    expect(out).toContain('2 DATE\n3 PHRASE Summer 1923');
    expect(out).not.toContain('2 DATE Summer 1923');
  });
  it('emits standard DATE value for parseable date in 7.0', () => {
    const p = createPerson(db, { sex: 'M' });
    const ev = createEvent(db, {
      event_type: 'birth',
      date_type: 'exact',
      date_value: '1845-06-12',
      date_original: '12 JUN 1845',
    });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const out = exportGedcom(db, '7.0');
    expect(out).toContain('2 DATE 12 JUN 1845');
  });
  it('5.5.1 emits date_original as-is (no PHRASE)', () => {
    const p = createPerson(db, { sex: 'M' });
    const ev = createEvent(db, {
      event_type: 'birth',
      date_type: 'unknown',
      date_original: 'Summer 1923',
    });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const out = exportGedcom(db, '5.5.1');
    expect(out).toContain('2 DATE Summer 1923');
    expect(out).not.toContain('3 PHRASE');
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npm test -- tests/unit/gedcom-export-70.test.ts
```

Expected: FAIL — no PHRASE emitted yet.

- [ ] **Step 3: Add `emitDate` helper and wire it in `src/gedcom/exporter.ts`**

Add a helper function near the top of the file (after the imports, before `exportGedcom`):

```typescript
/** Emit a DATE line (and optional PHRASE child) for the given event fields. */
function emitDate(
  lines: string[],
  date_type: string,
  date_value: string | null,
  date_value_end: string | null,
  date_original: string,
  level: number,
  version: '5.5.1' | '7.0',
): void {
  const dateStr = formatGedcomDate(date_type, date_value, date_value_end, date_original);
  if (!dateStr) return;

  if (version === '7.0' && date_original && !isStandardGedcomDate(date_original)) {
    // Unparseable original: emit blank DATE + PHRASE child
    lines.push(`${level} DATE`);
    lines.push(`${level + 1} PHRASE ${date_original}`);
  } else {
    lines.push(`${level} DATE ${dateStr}`);
  }
}
```

Replace every occurrence of:
```typescript
if (dateStr) lines.push(`2 DATE ${dateStr}`);
```
with a call to the helper. There are two occurrences — one in the INDI events loop, one in the FAM events loop. Both use `level = 2`:

```typescript
emitDate(lines, ev.date_type, ev.date_value, ev.date_value_end, ev.date_original, 2, version);
```

Also remove the now-redundant `const dateStr = formatGedcomDate(...)` line before each of those (since `emitDate` does it internally). The two blocks look like:

**INDI events block** (around line 190):
```typescript
      // was: const dateStr = formatGedcomDate(...); lines.push(`1 ${tag}`); if (dateStr) lines.push(`2 DATE ${dateStr}`);
      lines.push(`1 ${tag}`);
      emitDate(lines, ev.date_type, ev.date_value, ev.date_value_end, ev.date_original, 2, version);
      lines.push(`2 _EVID ${ev.id}`);
```

**FAM events block** (around line 330):
```typescript
      lines.push(`1 ${tag}`);
      emitDate(lines, ev.date_type, ev.date_value, ev.date_value_end, ev.date_original, 2, version);
      lines.push(`2 _EVID ${ev.id}`);
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/gedcom-export-70.test.ts
```

Expected: all PHRASE tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/gedcom/exporter.ts tests/unit/gedcom-export-70.test.ts
git commit -m "feat(gedcom): 7.0 export emits PHRASE child for unparseable dates"
```

---

## Task 4: PEDI uppercase + NAME.TYPE alias→AKA for GEDCOM 7.0

**Files:**
- Modify: `src/gedcom/exporter.ts`
- Modify: `tests/unit/gedcom-export-70.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/gedcom-export-70.test.ts`:

```typescript
import { createRelationship } from '../../src/api/relationships';

describe('exportGedcom 7.0 — PEDI values', () => {
  it('emits BIRTH (uppercase) for biological parent_child in 7.0', () => {
    const parent = createPerson(db, { sex: 'M' });
    const child = createPerson(db, { sex: 'F' });
    // Create a couple for the parent so a FAM record is generated
    const couple = createRelationship(db, { type: 'couple', person1_id: parent.id });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const out = exportGedcom(db, '7.0');
    expect(out).toContain('2 PEDI BIRTH');
    expect(out).not.toContain('2 PEDI birth');
  });
  it('emits birth (lowercase) for biological parent_child in 5.5.1', () => {
    const parent = createPerson(db, { sex: 'M' });
    const child = createPerson(db, { sex: 'F' });
    createRelationship(db, { type: 'couple', person1_id: parent.id });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id, subtype: 'biological' });
    const out = exportGedcom(db, '5.5.1');
    expect(out).toContain('2 PEDI birth');
  });
});

describe('exportGedcom 7.0 — NAME.TYPE', () => {
  it('emits AKA (not ALIAS) for alias name type in 7.0', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Sven', surname: 'Larsson', name_type: 'alias' });
    const out = exportGedcom(db, '7.0');
    expect(out).toContain('2 TYPE AKA');
    expect(out).not.toContain('2 TYPE ALIAS');
  });
  it('emits ALIAS for alias name type in 5.5.1', () => {
    const p = createPerson(db, { sex: 'M' });
    addPersonName(db, p.id, { given_name: 'Sven', surname: 'Larsson', name_type: 'alias' });
    const out = exportGedcom(db, '5.5.1');
    expect(out).toContain('2 TYPE ALIAS');
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npm test -- tests/unit/gedcom-export-70.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement PEDI uppercase in `src/gedcom/exporter.ts`**

Find the PEDI line (inside the CHIL loop in the FAM section, ~line 318):

```typescript
          // Before:
          const pedi = pcRel.subtype === 'biological' ? 'birth' : pcRel.subtype;
          lines.push(`2 PEDI ${pedi}`);
```

Replace with:

```typescript
          let pedi = pcRel.subtype === 'biological' ? 'birth' : pcRel.subtype;
          if (version === '7.0') pedi = pedi.toUpperCase();
          lines.push(`2 PEDI ${pedi}`);
```

Find the NAME.TYPE line in the INDI names loop (~line 162):

```typescript
          // Before:
          lines.push(`2 TYPE ${n.name_type.toUpperCase()}`);
```

Replace with:

```typescript
          let nameType = n.name_type.toUpperCase();
          if (version === '7.0' && nameType === 'ALIAS') nameType = 'AKA';
          lines.push(`2 TYPE ${nameType}`);
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/gedcom-export-70.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/gedcom/exporter.ts tests/unit/gedcom-export-70.test.ts
git commit -m "feat(gedcom): 7.0 export uses PEDI uppercase and AKA instead of ALIAS"
```

---

## Task 5: IPC handler and preload accept version option

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Update IPC handler in `src/main/ipc.ts`**

Find the `gedcom:export` handler (~line 476). Change it to:

```typescript
  wrapHandler('gedcom:export', async (opts?: { version?: string }) => {
    const version = (opts?.version === '7.0' ? '7.0' : '5.5.1') as '5.5.1' | '7.0';
    const defaultName = version === '7.0' ? 'family-tree-70.ged' : 'family-tree.ged';
    const result = await dialog.showSaveDialog({
      title: 'Export GEDCOM File',
      defaultPath: defaultName,
      filters: [{ name: 'GEDCOM Files', extensions: ['ged'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const gedText = exportGedcom(getDatabase(), version);
    fs.writeFileSync(result.filePath, gedText, 'utf-8');
    return { exported: true, filePath: result.filePath };
  });
```

- [ ] **Step 2: Update preload in `src/preload/index.ts`**

Find the gedcom export line (~line 78):

```typescript
    export: () => ipcRenderer.invoke('gedcom:export'),
```

Change to:

```typescript
    export: (opts?: { version?: string }) => ipcRenderer.invoke('gedcom:export', opts),
```

- [ ] **Step 3: Build to check for TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat(gedcom): IPC and preload pass version option to exportGedcom"
```

---

## Task 6: Import/Export UI — version selector

**Files:**
- Modify: `src/renderer/views/ImportExportView.vue`

- [ ] **Step 1: Add version ref and update the export section template**

In `ImportExportView.vue`, add a `exportVersion` ref in the `<script setup>` block, after the other refs:

```typescript
const exportVersion = ref<'5.5.1' | '7.0'>('5.5.1');
```

Replace the entire `<!-- Export GEDCOM -->` section in the template:

```html
      <!-- Export GEDCOM -->
      <div class="section">
        <h3>{{ $t('importExport.gedcomExportTitle') }}</h3>
        <p class="section-desc">{{ $t('importExport.gedcomExportDesc') }}</p>
        <div class="section-buttons">
          <select v-model="exportVersion" :disabled="busy" class="version-select">
            <option value="5.5.1">GEDCOM 5.5.1</option>
            <option value="7.0">GEDCOM 7.0</option>
          </select>
          <button @click="handleExportGedcom" :disabled="busy">{{ $t('gedcom.export') }}</button>
        </div>
        <p v-if="exportVersion === '7.0'" class="section-desc section-desc--info">
          {{ $t('importExport.gedcomExportDesc70') }}
        </p>
      </div>
```

- [ ] **Step 2: Update `handleExportGedcom` to pass the version**

Find the `handleExportGedcom` function and change the export call:

```typescript
async function handleExportGedcom() {
  if (!window.api || busy.value) return;
  busy.value = true;
  try {
    const result = (await window.api.gedcom.export({ version: exportVersion.value })) as { exported?: boolean; canceled?: boolean; filePath?: string };
    if (result.exported) setStatus(t('importExport.exportSuccess', { file: result.filePath ?? '' }));
  } catch (err) {
    setStatus(t('importExport.exportError'), 'error');
    console.error('[ImportExport] GEDCOM export failed:', err);
  } finally {
    busy.value = false;
  }
}
```

- [ ] **Step 3: Add the `version-select` style in `<style scoped>`**

Append to the scoped style block:

```css
.version-select {
  padding: 7px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: var(--font-sm);
  font-family: inherit;
  background: white;
  cursor: pointer;
}

.version-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.section-desc--info {
  color: #555;
  font-style: italic;
}
```

- [ ] **Step 4: Add i18n key for 7.0 description**

Find the i18n locale file(s) and add `gedcomExportDesc70`. Locate the locale files:

```bash
find src/renderer -name "*.ts" | xargs grep -l "gedcomExportTitle"
```

In the Swedish locale file, add alongside `gedcomExportDesc`:
```
gedcomExportDesc70: 'GEDCOM 7.0 är den nuvarande standarden (2021). Välj detta om du importerar till en modern app som stöder 7.0.',
```

In the English locale file:
```
gedcomExportDesc70: 'GEDCOM 7.0 is the current standard (2021). Choose this if you are importing into a modern app that supports 7.0.',
```

- [ ] **Step 5: Launch the app and verify the selector appears**

```bash
npm start
```

Navigate to Import/Export. The Export GEDCOM section should show a dropdown (5.5.1 / 7.0) and an Export button. Selecting 7.0 should show the info text below.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/ImportExportView.vue
git commit -m "feat(gedcom): export format selector (5.5.1 / 7.0) in ImportExportView"
```

---

## Task 7: Docs, PLAN.md, version bump, final commit

**Files:**
- Modify: `.claude/PLAN.md`
- Modify: `.claude/IPC_REFERENCE.md`
- Modify: `CLAUDE.md` (preload surface)
- Modify: `package.json` (version bump)

- [ ] **Step 1: Run full test suite one final time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Update `CLAUDE.md` preload surface**

Find the `gedcom.export` line in the `window.api Surface` section and update:

```
export: (opts?: { version?: string }) => Promise<{ exported?: boolean; canceled?: boolean; filePath?: string }>
```

- [ ] **Step 3: Update `.claude/IPC_REFERENCE.md`**

Find `gedcom:export` and update its signature to accept `opts?: { version?: '5.5.1' | '7.0' }`.

- [ ] **Step 4: Add milestone to `.claude/PLAN.md`**

In the Implementation Status table, add a new row:
```
| vX.Y.Z | GEDCOM 7.0 export: version selector UI, EXID identifiers, DATE PHRASE, PEDI/NAME.TYPE normalization | [plan](plans/2026-04-06-gedcom-70-export.md) |
```

- [ ] **Step 5: Bump version in `package.json`**

Increment the minor version (e.g. `0.35.0` → `0.36.0`).

- [ ] **Step 6: Final commit**

```bash
git add .claude/PLAN.md .claude/IPC_REFERENCE.md CLAUDE.md package.json
git commit -m "docs: update PLAN, IPC reference, CLAUDE.md for GEDCOM 7.0 export (vX.Y.Z)"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| Header `GEDC VERS 7.0`, no `CHAR UTF-8` | Task 2 |
| EXID instead of REFN for identifiers | Task 2 |
| PHRASE for unparseable dates | Task 3 |
| PEDI uppercase for 7.0 | Task 4 |
| `alias` NAME.TYPE → `AKA` for 7.0 | Task 4 |
| 5.5.1 export unchanged (regression) | Tasks 2–4 (tested) |
| IPC + preload pass version | Task 5 |
| UI version selector | Task 6 |
| Docs + version bump | Task 7 |

### Placeholder scan

No TBDs, TODOs, or vague steps found.

### Type consistency

- `version: '5.5.1' | '7.0'` used consistently in `exportGedcom`, `emitDate`, IPC handler, preload, and Vue ref.
- `isStandardGedcomDate` exported from `date.ts`, imported in `exporter.ts`.
- All `addPersonIdentifier` calls in tests use the 3-arg signature `(db, personId, type, value)`.

Check the actual `addPersonIdentifier` signature before running tests — if it differs, update the test calls accordingly. Look at `src/api/persons.ts` for the exact signature.