# Plan: Life timeline expansion (BEN #31)

**Date:** 2026-05-02
**Status:** planned
**Source:** Conversation 2026-05-02 + supersedes Phase 4 of `docs/plans/2026-04-29-ben-reactivity.md`
**Effort:** M

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## User goal

Open A Life Report for any person and see the **story of their life** — their own events, their children's births, the deaths of their parents, spouse, and children that happened during their lifetime — instead of a bare list of bureaucratic entries on themselves. Same in the PersonPanel timeline section: it should be the life story, not a redundant copy of the EventList sitting next to it.

A reader should be able to glance at the timeline and understand "this is who they lost, this is what they built" without cross-referencing other reports.

## Scope

Every per-person life timeline in the renderer that takes a single subject. Full list:

1. **`src/api/report_data.ts`** — `getTimeline()` is the canonical assembler. It already exists but only emits subject's own events + family birth/death/christening/burial with no lifetime constraint and no relationship-typed labels. Extend it.
2. **`src/renderer/components/reports/ALifeReport.vue`** — replace bespoke `timelineItems` assembly + bespoke child-birth fetch (lines 358–375 and 490–517) with `window.api.reports.timeline()` plus options.
3. **`src/renderer/components/PersonTimeline.vue`** — replace its own-events-only fetch (currently `events.forPerson(id)`) with `window.api.reports.timeline()` so the panel timeline becomes the life story instead of duplicating EventList.
4. **`src/mcp/tools/prod/events.ts`** `get_timeline` — already calls `getTimeline()`; verify the new shape flows through.

### Scope deviations

- **`src/renderer/components/reports/AMarriageReport.vue` `sharedTimeline`** — NOT migrated. Reason: it is a *couple-shared* timeline (relationship events + children's births), not a single-person life timeline. The "spouse death affects subject" framing collapses when both spouses are co-equal subjects. Stays with bespoke assembly.
- **`src/renderer/components/MediaTimeline.vue`** — NOT in scope. It's a media-by-date timeline, different domain.
- **`src/renderer/components/PlacePanel.vue` timeline** — out of scope; it's a place-events timeline, not a person life story.

## Settled scope of "significant events" on the life timeline

**Default (always shown):**

| Category | Includes | Lifetime rule |
|---|---|---|
| Own events | birth, baptism, marriage, divorce, residence, occupation, immigration, military, education, other, death, burial | n/a |
| Children's births | each child's `birth` or `foster_placement` | birth ≤ subject_death + 9 months (covers postpartum) |
| Children's deaths | each child who predeceased the subject | strictly within subject's lifetime |
| Spouse death | death of any couple-relationship partner | only if before subject's own death |
| Parent deaths | both biological/adoptive parents' deaths | only if during subject's lifetime |

**Optional (off by default — toggles in ReportPanel `event_defaults_config`-style options):**

- `include_children_marriages` — children's marriages within subject's lifetime
- `include_sibling_deaths` — siblings' deaths within subject's lifetime

**Excluded entirely (do not add):** spouse's birth/baptism/etc., sibling births, parents' marriages/births, grandchildren events, aunts/uncles/cousins.

**Step/foster/adopted children:** treated identically to biological. The `parent_child` relationship is what qualifies; `subtype` does not filter.

**Step-parents:** out — only parents linked via `parent_child` where the subject is `person2_id`. No subtype filtering of parents.

## Verification (user-observable outcomes)

Run the dev app (`npm start`) and inspect with the slaktforskning-dev MCP. For each:

1. **Mother death visible** — pick a person whose mother died during their lifetime. Open A Life Report. The timeline shows a marker at the mother's death year labeled `Bortgång: <mother name> (mor)`.
2. **Child births and deaths visible** — pick a parent who outlived a child. Timeline shows `Födelse: <child> · <place>` AND `Bortgång: <child> (son/dotter)` if applicable.
3. **Spouse death visible** — pick a widowed person. Timeline shows `Bortgång: <spouse name> (make/maka)`. Pick someone whose spouse died AFTER them — that spouse death is NOT shown.
4. **Posthumous-child rule** — pick (or create) a case where a child was born within 9 months of the subject's death. Birth IS shown. Beyond 9 months — NOT shown.
5. **PersonPanel timeline differs from EventList** — open any person's panel, scroll to the timeline section. It includes family events; the EventList right above it shows only the subject's own events. They are visibly different.
6. **ReportPanel toggles** — turn on "Inkludera barns äktenskap" and "Inkludera syskons bortgång". Reload the report. Markers appear. Turn them off. Markers disappear. No reload of the report list view.
7. **MCP** — call `mcp__slaktforskning__get_timeline` for the same subjects. Returned entries include the new categories with the same lifetime constraints applied. Confirm by inspecting the JSON.

Plus baseline regression checks (these alone are NOT verification of user goal — only hygiene):
- `npm run lint` clean
- `npx vitest run tests/unit/report_data.test.ts` green
- `npx vitest run tests/unit/preload-coverage.test.ts tests/unit/static-api-coverage.test.ts` green (no new IPC channels added — `reports:timeline` already exists — but channel signature changes through here)

## Failure modes / RCA reference

**Prior plan:** `docs/plans/2026-04-29-ben-reactivity.md` Phase 4 specced this narrowly (spouse death + child birth + child death only) and never started. This plan supersedes it. As a final task, mark Phase 4 of the ben-reactivity plan as superseded by this file.

**Past failure mode:** `getTimeline()` was built (commit history pre-dates this plan) but the renderer never adopted it; ALifeReport rolled its own child-birth fetch, and PersonTimeline rolled its own own-events fetch. Result: two divergent timeline implementations and dead-but-shipped MCP code. **Lesson baked into this plan:** when an api/ data assembler exists, extend it instead of duplicating logic in the renderer; verify renderer + MCP both consume the same path.

**Prime Directive guard:** all lifetime-constraint math (subject's birth/death year, 9-month posthumous offset, "during lifetime" filters) happens at read time in `getTimeline()` from `events.date_value`. Nothing is persisted. If a task description ever says "store the computed birth_year" — stop. That violates the directive.

## File structure

```
src/api/report_data.ts                            (modify — extend getTimeline + new types)
src/api/report_data.ts (TimelineEntry interface)  (modify — add relationship_label vocabulary)
src/shared/channels/reports.ts                    (modify — pass options through to getTimeline)
src/preload/index.ts                              (modify — accept options in window.api.reports.timeline)
src/static/static-api.ts                          (modify — accept options in stub)
src/renderer/api.d.ts                             (auto via ApiSurface — verify)
src/renderer/components/reports/ALifeReport.vue   (modify — replace timelineItems assembly + remove child-birth fetch)
src/renderer/components/reports/ReportPanel.vue   (modify — add two checkboxes for optional categories)
src/renderer/components/PersonTimeline.vue        (modify — call reports.timeline; render family events with relationship suffix)
src/renderer/i18n/sv.ts                           (modify — add relationship-label keys: make, maka, mor, far, son, dotter, syskon)
src/renderer/i18n/en.ts                           (modify — same keys, English)
tests/unit/report_data.test.ts                    (modify — new categories + lifetime rule tests)
docs/plans/2026-04-29-ben-reactivity.md           (modify — mark Phase 4 superseded)
```

## Tasks

### Task 1: Extend `TimelineEntry` shape with stable relationship vocabulary

**Files:**
- Modify: `src/api/report_data.ts` (TimelineEntry interface around line 97)
- Modify: `tests/unit/report_data.test.ts` (extend timeline tests)

- [ ] **Step 1.1: Write the failing test**

In `tests/unit/report_data.test.ts`:

```typescript
describe('getTimeline relationship_label vocabulary', () => {
  it('emits stable labels for parent/spouse/child/sibling and own', () => {
    const db = createTestDb();
    // build subject + father + mother + spouse + child + sibling
    // assert each entry's relationship_label is one of:
    // 'self' | 'father' | 'mother' | 'spouse' | 'son' | 'daughter' | 'child' | 'sibling'
  });
});
```

- [ ] **Step 1.2: Run** `npx vitest run tests/unit/report_data.test.ts -t 'relationship_label vocabulary'` — expect FAIL.

- [ ] **Step 1.3: Implement** — change `relationship_label: string | null` to a typed union:

```typescript
export type TimelineRelationshipLabel =
  | 'self'
  | 'father'
  | 'mother'
  | 'spouse'
  | 'son'
  | 'daughter'
  | 'child'    // sex unknown
  | 'sibling';

export interface TimelineEntry {
  event: EventWithPlace;
  person_id: string;
  person_given_name: string;
  person_surname: string;
  relationship_label: TimelineRelationshipLabel;
  // 'self' replaces the old `null` for the subject's own events.
}
```

In `getTimeline()` body, where it currently sets `relationship_label: null`, set `'self'`. Where it sets `'spouse'` / `'parent'` / `'child'` / `'sibling'` strings, narrow them to the new vocabulary.

- [ ] **Step 1.4: Run test** — expect PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/api/report_data.ts tests/unit/report_data.test.ts
git commit -m "refactor(timeline): typed relationship_label vocabulary"
```

---

### Task 2: Lifetime-constraint helper (subject birth/death years + posthumous window)

**Files:**
- Modify: `src/api/report_data.ts`
- Modify: `tests/unit/report_data.test.ts`

- [ ] **Step 2.1: Write failing test** — assert that a private helper exposed through `getTimeline` filters family events by lifetime:

```typescript
it('drops parent death that occurred before subject birth', () => {
  // subject born 1900; father died 1899 → father death NOT in timeline
});
it('keeps child birth up to 9 months after subject death', () => {
  // subject died 1880-03-15; child born 1880-12-10 → child birth IS in timeline
  // subject died 1880-03-15; child born 1881-01-15 → child birth NOT in timeline
});
it('drops spouse death that occurred after subject death', () => {});
it('drops child death that occurred after subject death', () => {});
```

- [ ] **Step 2.2: Run** — expect FAIL.

- [ ] **Step 2.3: Implement** in `src/api/report_data.ts`:

```typescript
function extractYearMonthDay(dateValue: string | null): { y: number; m: number; d: number } | null {
  if (!dateValue) return null;
  const m = dateValue.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return null;
  return { y: parseInt(m[1], 10), m: m[2] ? parseInt(m[2], 10) : 1, d: m[3] ? parseInt(m[3], 10) : 1 };
}

function eventDateOnOrBefore(event: EventWithPlace, year: number, month: number, day: number): boolean {
  const ev = extractYearMonthDay(event.date_value);
  if (!ev) return false;
  if (ev.y !== year) return ev.y < year;
  if (ev.m !== month) return ev.m < month;
  return ev.d <= day;
}

function plusMonths(y: number, m: number, d: number, addMonths: number): { y: number; m: number; d: number } {
  let total = y * 12 + (m - 1) + addMonths;
  return { y: Math.floor(total / 12), m: (total % 12) + 1, d };
}

interface SubjectLifetime {
  birth: { y: number; m: number; d: number } | null;
  death: { y: number; m: number; d: number } | null;
  deathPlus9Mo: { y: number; m: number; d: number } | null;
}

function readSubjectLifetime(subjectEvents: EventWithPlace[]): SubjectLifetime {
  const birthEv = subjectEvents.find(e => e.event_type === 'birth');
  const deathEv = subjectEvents.find(e => e.event_type === 'death');
  const birth = birthEv ? extractYearMonthDay(birthEv.date_value) : null;
  const death = deathEv ? extractYearMonthDay(deathEv.date_value) : null;
  const deathPlus9Mo = death ? plusMonths(death.y, death.m, death.d, 9) : null;
  return { birth, death, deathPlus9Mo };
}
```

Filter callers: a relative's event qualifies when its date is **after subject's birth** AND **on or before** subject's death (plus 9-month window for child births only).

- [ ] **Step 2.4: Run** — expect PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/api/report_data.ts tests/unit/report_data.test.ts
git commit -m "feat(timeline): lifetime-constraint helper for family events"
```

---

### Task 3: Add parent deaths

**Files:** `src/api/report_data.ts`, `tests/unit/report_data.test.ts`

- [ ] **Step 3.1: Test** — subject with two parents linked via `parent_child` (subject is `person2_id`); both die during lifetime. Assert two entries with `relationship_label: 'father' | 'mother'` (mapped from parent's `sex`; `'U'` → `'father'` placeholder is wrong → use a single `'parent'` label? Re-decision: keep `'father'` / `'mother'`; if sex is `U`, fall back to `'parent'`). Update `TimelineRelationshipLabel` to add `'parent'`.

- [ ] **Step 3.2: Run** — FAIL.

- [ ] **Step 3.3: Implement** in `getTimeline()` — within the `for (const r of rels)` loop, when `r.type === 'parent_child'` and the OTHER person is the parent (i.e. `r.person2_id === personId`), fetch other-person death event, apply lifetime filter, push entry with sex-derived label (`father`/`mother`/`parent`).

- [ ] **Step 3.4: Run** — PASS.

- [ ] **Step 3.5: Commit** — `feat(timeline): include parent deaths within subject lifetime`

---

### Task 4: Move children's births into `getTimeline()` + apply 9-month posthumous rule

**Files:** `src/api/report_data.ts`, `tests/unit/report_data.test.ts`

- [ ] **Step 4.1: Test** — three children: one born during lifetime, one 6 months posthumous, one 18 months posthumous. Assert first two are in timeline, third is not.

- [ ] **Step 4.2: Run** — FAIL.

- [ ] **Step 4.3: Implement** — in the same loop where `r.type === 'parent_child'` and SUBJECT is `person1_id` (parent), fetch child's events, include `birth` and `foster_placement`, apply `<= deathPlus9Mo` rule. Label: `'son' | 'daughter' | 'child'` from child's `sex`.

- [ ] **Step 4.4: Run** — PASS.

- [ ] **Step 4.5: Commit** — `feat(timeline): include children's births with posthumous window`

---

### Task 5: Children's deaths

**Files:** `src/api/report_data.ts`, `tests/unit/report_data.test.ts`

- [ ] **Step 5.1: Test** — child death year before subject's death year → included. Child death after → excluded.

- [ ] **Step 5.2: Implement** — in the same parent_child branch, fetch child's `death` events, filter `<= subject.death`, push.

- [ ] **Step 5.3: Run + commit** — `feat(timeline): include children's deaths within subject lifetime`

---

### Task 6: Spouse death

**Files:** `src/api/report_data.ts`, `tests/unit/report_data.test.ts`

- [ ] **Step 6.1: Test** — couple where spouse died before subject → spouse death entry. Couple where spouse died after subject → no spouse death entry.

- [ ] **Step 6.2: Implement** — in the `r.type === 'couple'` branch, fetch other-person `death` event, filter `<= subject.death`, label `'spouse'`. (Current code already includes 'birth'/'death'/'christening'/'burial' for couple — narrow to **only** death + apply lifetime filter.)

- [ ] **Step 6.3: Run + commit** — `feat(timeline): spouse death only within subject lifetime`

---

### Task 7: Optional categories — children's marriages, sibling deaths

**Files:** `src/api/report_data.ts`, `src/shared/channels/reports.ts`, `src/preload/index.ts`, `src/static/static-api.ts`, `tests/unit/report_data.test.ts`

- [ ] **Step 7.1: Test** — assert default call (no options) excludes child marriages and sibling deaths. Assert call with `{ includeChildrenMarriages: true }` includes them.

- [ ] **Step 7.2: Implement signature**:

```typescript
export interface TimelineOptions {
  includeChildrenMarriages?: boolean;
  includeSiblingDeaths?: boolean;
}

export function getTimeline(db: Database, personId: string, options: TimelineOptions = {}): TimelineEntry[] | null {
  // ...
}
```

- [ ] **Step 7.3: Children's marriages** — when `includeChildrenMarriages`, find child's `couple` relationships, then their `marriage`-type events; filter to subject's lifetime.

- [ ] **Step 7.4: Sibling deaths** — when `includeSiblingDeaths`, find sibling-of-subject via shared parent in `parent_child` rels (or via `r.type === 'sibling'` direct rels), fetch their death events, filter to subject's lifetime.

- [ ] **Step 7.5: Channel** — update `src/shared/channels/reports.ts`:

```typescript
defineChannel({
  name: 'reports:timeline',
  thread: 'worker',
  handler: (db, personId: string, options?: import('../../api/report_data').TimelineOptions) =>
    reportData.getTimeline(db, personId, options),
});
```

- [ ] **Step 7.6: Preload** — update `src/preload/index.ts`:

```typescript
timeline: (personId: string, options?: { includeChildrenMarriages?: boolean; includeSiblingDeaths?: boolean }) =>
  ipcRenderer.invoke('reports:timeline', personId, options),
```

- [ ] **Step 7.7: Static stub** — update `src/static/static-api.ts` `timeline` to accept and ignore options; still returns `[]`.

- [ ] **Step 7.8: Run** preload + static-api coverage tests — expect PASS.

- [ ] **Step 7.9: Commit** — `feat(timeline): optional children's marriages + sibling deaths`

---

### Task 8: i18n — relationship-label keys

**Files:** `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

- [ ] **Step 8.1: Add keys to both files** under a new `timelineLabels` namespace:

```typescript
// sv.ts
timelineLabels: {
  self: '',
  father: 'far',
  mother: 'mor',
  parent: 'förälder',
  spouse: 'make/maka',
  son: 'son',
  daughter: 'dotter',
  child: 'barn',
  sibling: 'syskon',
}

// en.ts
timelineLabels: {
  self: '',
  father: 'father',
  mother: 'mother',
  parent: 'parent',
  spouse: 'spouse',
  son: 'son',
  daughter: 'daughter',
  child: 'child',
  sibling: 'sibling',
}
```

- [ ] **Step 8.2: Commit** — `feat(i18n): timeline relationship labels`

---

### Task 9: Migrate `ALifeReport.vue` to call `reports.timeline`

**Files:** `src/renderer/components/reports/ALifeReport.vue`

- [ ] **Step 9.1: Remove the bespoke `childBirthItems` ref + the child-birth fetch block** in `load()` (lines ~490–517 — `childRels` walk and `childEventArrays` Promise.all).

- [ ] **Step 9.2: Replace `timelineItems` computed** to call the new API. Add a parallel fetch in `load()`:

```typescript
const [summary, researcher, timelineEntries] = await Promise.all([
  window.api.reports.personSummary(props.personId) as Promise<PersonSummary | null>,
  window.api.db.getSetting('researcher_name') as Promise<string | null>,
  window.api.reports.timeline(props.personId, {
    includeChildrenMarriages: props.includeChildrenMarriages ?? false,
    includeSiblingDeaths: props.includeSiblingDeaths ?? false,
  }) as Promise<TimelineEntry[] | null>,
]);
```

Store `timelineEntries.value = timelineEntries ?? []`.

`timelineItems` becomes:

```typescript
const timelineItems = computed<TimelineItem[]>(() => {
  const items: TimelineItem[] = [];
  for (const entry of timelineEntries.value) {
    const year = extractYear(entry.event.date_value);
    if (year == null) continue;
    const place = entry.event.place_name;
    const typeLabel = eventTypeLabel(entry.event.event_type);
    const namePart = entry.relationship_label === 'self'
      ? null
      : (formatFullName({ given_name: entry.person_given_name, surname: entry.person_surname }) || t('common.unknown'));
    const relSuffix = entry.relationship_label === 'self'
      ? ''
      : ` (${t(`timelineLabels.${entry.relationship_label}`)})`;
    let label: string;
    if (namePart) {
      label = place
        ? `${typeLabel}: ${namePart}${relSuffix} · ${place}`
        : `${typeLabel}: ${namePart}${relSuffix}`;
    } else {
      label = place ? `${typeLabel} · ${place}` : typeLabel;
    }
    items.push({ id: entry.event.id, year, eventType: entry.event.event_type, label });
  }
  items.sort((a, b) => a.year - b.year);
  return items;
});
```

- [ ] **Step 9.3: Verify no lint errors**: `npm run lint -- src/renderer/components/reports/ALifeReport.vue`.

- [ ] **Step 9.4: Smoke check** — `npm start`, open A Life Report for someone with deceased parent and child, confirm markers appear.

- [ ] **Step 9.5: Commit** — `feat(reports): ALifeReport timeline uses canonical getTimeline + relationship suffixes`

---

### Task 10: ReportPanel toggles for optional categories

**Files:** `src/renderer/components/ReportPanel.vue`, `src/renderer/i18n/{sv,en}.ts`

- [ ] **Step 10.1: Add two checkboxes** to ReportPanel under a new "Tidslinje" subsection (only visible when active report is `aLife`):

```vue
<label class="ep-field">
  <input type="checkbox" v-model="config.includeChildrenMarriages" />
  <span>{{ $t('reports.alife.includeChildrenMarriages') }}</span>
</label>
<label class="ep-field">
  <input type="checkbox" v-model="config.includeSiblingDeaths' />
  <span>{{ $t('reports.alife.includeSiblingDeaths') }}</span>
</label>
```

(Wire through whatever store / prop ALifeReport reads its options from — likely the `reportConfig` Pinia store. Check the store and add the two fields.)

- [ ] **Step 10.2: i18n keys** — `reports.alife.includeChildrenMarriages` ("Inkludera barns äktenskap" / "Include children's marriages"), `reports.alife.includeSiblingDeaths` ("Inkludera syskons bortgång" / "Include sibling deaths").

- [ ] **Step 10.3: Smoke check** — toggle both, verify markers appear/disappear without a manual reload.

- [ ] **Step 10.4: Commit** — `feat(reports): toggles for optional life-timeline categories`

---

### Task 11: Migrate `PersonTimeline.vue` to canonical timeline (kill the EventList duplication)

**Files:** `src/renderer/components/PersonTimeline.vue`

- [ ] **Step 11.1: Replace the `useEntityData` loader** to call `window.api.reports.timeline(id)` instead of `events.forPerson(id)`. The existing template renders one entry per event — keep the layout but emit a relationship suffix on family entries.

```typescript
const { data, loading, error, reload } = useEntityData<TimelineData>(idRef, async (id) => {
  const entries = (await window.api.reports.timeline(id)) as TimelineEntry[];
  // build dated/undated like today, but each item carries entry.relationship_label
  // for rendering "Bortgång (mor): Anna · Stockholm" style.
});
```

- [ ] **Step 11.2: Update template** to render the relationship suffix near the event-type badge for non-`self` entries.

- [ ] **Step 11.3: Confirm visual difference** vs. the EventList rendered above it in PersonPanel. The two MUST show distinct content (PersonTimeline is family-aware; EventList is own-events-only).

- [ ] **Step 11.4: Confirm clicks** still open `EventModal` for own events. For family events, change the click target to navigate to that person's panel (`router.push({ name: 'persons', params: { personId: entry.person_id } })`) instead of opening the editor — editing a child's birth event from the parent's timeline is confusing.

- [ ] **Step 11.5: Smoke check** — open PersonPanel for the same subject as Task 9; confirm panel timeline now matches the report timeline shape.

- [ ] **Step 11.6: Commit** — `feat(panel): PersonTimeline shows family events instead of duplicating EventList`

---

### Task 12: Verify MCP path

**Files:** none (verification only)

- [ ] **Step 12.1: Run** `npx tsx src/mcp/server.ts` against a test database (or use the dev MCP). Call `get_timeline` for the same subjects from Task 9 verifications. Confirm new categories appear with relationship_label values.

- [ ] **Step 12.2: Update** `src/mcp/tools/prod/events.ts` `get_timeline` only if the tool description mentions specific event categories — don't promise more than the tool returns. (Likely no change needed; review.)

- [ ] **Step 12.3: Commit if any change** — `docs(mcp): describe new timeline event categories`

---

### Task 13: Mark Phase 4 of ben-reactivity superseded

**Files:** `docs/plans/2026-04-29-ben-reactivity.md`

- [ ] **Step 13.1: Edit Phase 4 checkboxes** to:

```markdown
### Phase 4 — Indirect events on timelines (#31)
- [x] Investigate `getTimeline(personId)` and report-side timelines — superseded by `docs/plans/2026-05-02-life-timeline-expansion.md`
- [x] Add: spouse death events, child birth events, child death events — superseded
- [x] Constraint: only include events that fell within the subject's lifetime — superseded; full settlement of "significant events" lives in the new plan.
```

- [ ] **Step 13.2: Commit** — `docs(plan): supersede ben-reactivity Phase 4 by life-timeline-expansion`

---

### Task 14: Self-review checklist

- [ ] All 7 verification scenarios in §"Verification" pass against a real database in `npm start`
- [ ] `npm run lint` clean
- [ ] `npx vitest run tests/unit/report_data.test.ts tests/unit/preload-coverage.test.ts tests/unit/static-api-coverage.test.ts` all green
- [ ] `npx vitest run` full suite green
- [ ] No persisted-inference violations introduced (search the diff for any `INSERT` / `UPDATE` writing computed birth/death years or "is alive" flags — none should exist)
- [ ] All checkboxes in this plan ticked, plan moved to `docs/plans/archive/` via `git mv`
- [ ] `package.json` minor version bump (this is a feature)
- [ ] `CHANGELOG.md` `## Unreleased` line summarising the timeline expansion
- [ ] Commit `chore: archive completed life-timeline-expansion + bump vX.Y.Z`
- [ ] Merge worktree → `main`, delete branch, remove worktree

## Out of scope (revisit later if needed)

- Visual collision-avoidance for crowded timelines — `TimelineBar` already does basic label adjustment; if real-world data overflows we'll revisit with a "compact mode" toggle.
- Migrating `AMarriageReport.sharedTimeline` — couple-shared shape is fundamentally different.
- Including grandchildren events — not in the settled scope; would need a per-generation depth limit which we have no design for yet.
