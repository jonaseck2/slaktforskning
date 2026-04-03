# Plan: Sourcing & Citation Consistency

## Philosophy

The app's design principle is **source-first**: every factual claim should be traceable to a source. The citation system is already built into the data model (citations table with `event_id`, `person_id`, `relationship_id`, `place_id` FKs, all populated since v0.3.0). The gap is in the UI — citation affordances (Cite buttons + Unsourced badges) are incomplete and inconsistent across entity types.

**Current state (from codebase audit):**

| Entity | Cite Button | Unsourced Badge | CitationForm supports it |
|--------|-------------|-----------------|--------------------------|
| Event (via EventList) | YES | YES | YES (`eventId`) |
| Person (header only) | YES | NO | YES (`personId`) |
| Relationship (header only) | YES | NO | YES (`relationshipId`) |
| Place | **NO** | **NO** | **NO** (`placeId` prop missing) |

The API and schema fully support place citations — only the UI is missing.

---

## Goal

Every entity that can be cited shows:
1. A **citation count badge** (green) when citations exist
2. An **Unsourced badge** (yellow) when no citations exist
3. A **Cite** button that opens CitationForm pre-linked to that entity

This applies at the level of the **entity as a whole**, not individual fields. (Field-level citations are a v0.9+ concern — the Assertions UI.)

---

## Changes Required

### 1. CitationForm — add `placeId` prop

`src/renderer/components/CitationForm.vue` currently has `eventId`, `personId`, `relationshipId` props but no `placeId`.

Add:
```typescript
const props = defineProps<{
  sourceId?: string;
  eventId?: string;
  personId?: string;
  relationshipId?: string;
  placeId?: string;        // NEW
}>();
```

Pass `place_id: props.placeId` when calling `window.api.sources.createCitation(...)`.

### 2. PlaceDetailView — full citation affordance

Add to `PlaceDetailView.vue`:
- Import and use CitationForm (already used on EventList — copy the pattern)
- On mount, call `window.api.sources.getCitationsForPlace(placeId)` to load citation count
- Show citation badge / Unsourced badge in the place header (same style as PersonDetailView header)
- "Cite Sources" button opens CitationForm with `:placeId="place.id"`
- After CitationForm emits `saved`, reload citation count

**New IPC channel needed:** `sources:getCitationsForPlace` — maps to `getCitationsForPlace(db, placeId)` which already exists in `src/api/sources.ts` but is not wired to IPC.

### 3. PersonDetailView — Unsourced badge in header

PersonDetailView already has a Cite button in the header but **no Unsourced badge**. The badge should appear next to the Cite button when no person-level citations exist, matching the EventList pattern.

- Load `window.api.sources.getCitationsForPerson(personId)` on mount
- Show count badge or Unsourced badge next to the Cite button
- After CitationForm saves, reload count

**New IPC channel needed:** `sources:getCitationsForPerson`

### 4. RelationshipDetailView — Unsourced badge in header

Same as PersonDetailView: Cite button exists, Unsourced badge missing.

- Load `window.api.sources.getCitationsForRelationship(relId)` on mount
- Show count badge or Unsourced badge

**New IPC channel needed:** `sources:getCitationsForRelationship`

### 5. New API functions

`src/api/sources.ts` — add three narrow query functions (similar to `getCitationsForEvent`):

```typescript
getCitationsForPerson(db, personId): Citation[]
getCitationsForRelationship(db, relationshipId): Citation[]
getCitationsForPlace(db, placeId): Citation[]
```

These are simple `SELECT ... WHERE person_id = ?` queries — the schema already has the columns and they are indexed via the existing citation FKs.

### 6. IPC + Preload

Add to `src/main/ipc.ts`:
```
sources:getCitationsForPerson
sources:getCitationsForRelationship
sources:getCitationsForPlace
```

Add to `src/preload/index.ts`:
```
window.api.sources.getCitationsForPerson(personId)
window.api.sources.getCitationsForRelationship(relationshipId)
window.api.sources.getCitationsForPlace(placeId)
```

### 7. MCP Tools

Add to `src/mcp/createServer.ts`:
```
get_citations_for_person(person_id)
get_citations_for_relationship(relationship_id)
get_citations_for_place(place_id)
```

---

## Unsourced Badge Component

The Unsourced badge and citation count badge currently live inline in EventList. Extract them into a reusable `CitationBadge.vue` component:

```vue
<!-- Props: count: number (citation count) -->
<!-- Shows green "N sources" badge when count > 0 -->
<!-- Shows yellow "Unsourced" badge when count === 0 -->
<CitationBadge :count="citationCount" />
```

This prevents duplication across PersonDetailView, RelationshipDetailView, PlaceDetailView, and EventList.

---

## "Source-First" UX Enforcement

Beyond the badges, add these UI signals to reinforce the source-first principle:

**QualityView integration** (hooks into the sanity checks plan):
- `UNSOURCED_BIRTH` and `UNSOURCED_DEATH` notices are already planned in the sanity checks plan
- Add: `UNSOURCED_PERSON` (notice) — person-level citation count = 0
- Add: `UNSOURCED_PLACE` (notice) — place-level citation count = 0

**No blocking:** the app never blocks saving an unsourced entity. Badges and QualityView notices are the signal, not hard blocks.

---

## Implementation Steps

- [ ] **1. API** — add `getCitationsForPerson`, `getCitationsForRelationship`, `getCitationsForPlace` to `src/api/sources.ts`
- [ ] **2. IPC** — wire three new channels in `src/main/ipc.ts`
- [ ] **3. Preload** — expose on `window.api.sources.*`
- [ ] **4. CitationForm** — add `placeId` prop + pass `place_id` to API call
- [ ] **5. CitationBadge.vue** — extract reusable badge component from EventList; update EventList to use it
- [ ] **6. PersonDetailView** — load person citation count on mount; show CitationBadge next to Cite button
- [ ] **7. RelationshipDetailView** — same as PersonDetailView
- [ ] **8. PlaceDetailView** — load place citation count; show CitationBadge + Cite button in header; wire CitationForm with `placeId`
- [ ] **9. MCP tools** — add `get_citations_for_person`, `get_citations_for_relationship`, `get_citations_for_place` to `createServer.ts`
- [ ] **10. Unit tests** — add tests for the three new API functions in `tests/unit/sources.test.ts`
- [ ] **11. MCP tests** — add tests for the three new MCP tools in `tests/unit/mcp.test.ts`
- [ ] **12. Component tests** — test that CitationBadge shows correct badge; test PlaceDetailView cite button renders
- [ ] **13. Docs** — update `CLAUDE.md` (IPC surface), `MCP.md`, `PLAN.md`

---

## Skills to Update

- **`add-feature`** — `CitationBadge` is now a shared component: add it to the "Shared components to reuse" list with its prop signature. Confirm `CitationForm` entry lists all four props (`eventId`, `personId`, `relationshipId`, `placeId`).
- **`mcp-dev`** — add the three new tools (`get_citations_for_person`, `get_citations_for_relationship`, `get_citations_for_place`) to the tool reference table in the skill.
- **`data-modeling`** — add a note to the citations section clarifying that all four FK targets now have full UI affordance (was previously event-only in the UI).

## What Does NOT Change

- Sources (`SourceDetailView`) do not get a Cite button — they are the source, not a claimant
- No field-level citations in this plan (that's Assertions UI, v0.7.0)
- No blocking of unsourced saves — badges only
- Citation confidence, page, and transcription fields are unchanged
