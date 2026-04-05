# Ancestor Book Export — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "Ancestor Book" PDF export to ReportsView that produces a self-contained PDF for a selected focal person, containing a static circle chart, an ahnentafel list of all ancestors, and one personal summary page per ancestor — all with internal clickable links.

**Architecture:** Single new Vue component `AncestorBookReport.vue` plus a new `fetchAllAncestors()` utility function. Reuses `computeCircleLayout` (circle chart SVG), `fetchPedigreeTree` (circle chart data), and the IndividualSummary data-fetch pattern. All internal links use HTML anchor fragments (`href="#person-{id}"`) which Chromium preserves in `printToPDF()`. No new IPC channels, no schema changes.

---

## Document Structure

The exported PDF contains four sections in order:

1. **Title page** — focal person's full name, "Stamtavla", export date
2. **Circle chart** — static SVG (max 6 generations), each populated segment wrapped in `<a href="#person-{id}">`. Page break after.
3. **Ahnentafel list** — all ancestors grouped by generation, fetched recursively without generation cap. Each name is a `<a href="#person-{id}">` link with birth–death years. Ahnentafel number shown.
4. **Person summaries** — one section per ancestor in ahnentafel order, anchored with `id="person-{id}"`. Contains: all names, life events (with date/place), parents/spouses/children (linked if in the ancestor set), notes, source bibliography.

---

## UI Entry Point

New tab **"Stamtavla"** in `ReportsView.vue`, alongside the three existing report tabs (Ahntaveldiagram, Familjeblad, Personsammanfattning).

- Uses existing `PersonPicker` component to select the focal person
- Same "Skriv ut" / "Exportera PDF" buttons as other tabs (call `window.api.print.print()` / `window.api.print.exportPdf()`)
- Warning shown in UI if ancestor count exceeds 500

---

## Files

| File | Action | Description |
|------|--------|-------------|
| `src/renderer/components/reports/AncestorBookReport.vue` | Create | Full document renderer: title + SVG + ahnentafel list + person summaries |
| `src/renderer/utils/chartData.ts` | Modify | Add `fetchAllAncestors(personId)` — BFS without generation cap, returns `Map<ahnNum, PersonNode>` |
| `src/renderer/views/ReportsView.vue` | Modify | Add "Stamtavla" tab and import `AncestorBookReport` |
| `src/renderer/i18n/sv.ts` | Modify | Add `reports.tab.ancestorBook`, `reports.ancestorBook.*` strings |
| `src/renderer/i18n/en.ts` | Modify | English equivalents |

No schema changes. No IPC changes. No MCP changes.

---

## `fetchAllAncestors`

```typescript
export async function fetchAllAncestors(
  focalId: string,
  limit = 500
): Promise<Map<number, PersonNode>>
```

- BFS queue starting with `{ personId: focalId, ahnNum: 1 }`
- For each node: fetch person + names + birth/death year (same as `fetchPersonNode`)
- Fetch parent_child relationships to find parents; assign father = `2n`, mother = `2n+1`
- Stop when queue empty or `map.size >= limit`
- Returns `Map<ahnentafelNumber, PersonNode>` — same structure as `fetchPedigreeTree` result
- If limit reached, sets a returned flag `limitReached: boolean`

Return type:
```typescript
{ ancestors: Map<number, PersonNode>; limitReached: boolean }
```

---

## Circle Chart SVG (Static)

- Call `fetchPedigreeTree(personId, 6)` for the 6-generation circle layout data
- Call `computeCircleLayout(tree, 6)` to get `CircleSegment[]`
- Render SVG inline in the component — no Vue reactivity, no zoom controls, no ResizeObserver
- ViewBox `700 700`, displayed at CSS width 100% with max-width fitting A4 (approx 540px print width)
- Each populated segment: `<a xlink:href="#person-{seg.person.id}"><path .../><text ...></a>`
- Empty segments: rendered as-is, no anchor wrap
- Curved text mode: off (straight tangential text only, simpler for static render)
- Generation control: fixed at 6 (no UI control needed in print context)

---

## Ahnentafel List

- Sorted by ahnentafel number (1, 2, 3, 4, 5…)
- Grouped by generation with a generation heading: "Generation 1", "Generation 2", etc.
- Each row: `[ahnNum]. <a href="#person-{id}">Given Surname</a> (birthYear–deathYear)`
- Missing birth year shown as `?`; missing death year omitted (living or unknown). If both missing, no parenthetical shown.
- `break-inside: avoid` per generation group for clean page breaks

---

## Person Summaries

One `<section>` per ancestor, in ahnentafel order (1, 2, 3, …).

Each section:
```
<section id="person-{id}">
  <h2>[ahnNum]. Given Surname (birthYear–deathYear)</h2>

  Names table: given_name | surname | name_type

  Events table: type | date | place | description | cause

  Family:
    Parents: [linked name] + [linked name]  (linked if in ancestor set)
    Spouses: [name] (not linked — spouses are not ancestors)
    Children: [name] (not linked — children are not ancestors)

  Notes (if any)

  Sources: numbered bibliography
</section>
```

**Linking rule:** A name gets an `<a href="#person-{id}">` only if that person's ID exists in the `fetchAllAncestors` result map. Spouses and children are shown as plain text.

**Data fetching per person:** Identical pattern to `IndividualSummary.vue`:
- `window.api.persons.getNames(id)`
- `window.api.events.forPerson(id)`
- `window.api.relationships.getForPerson(id)` + participant lookups
- `window.api.citations.forPerson(id)` + `forEvent(eventId)` for sources

All ancestor IDs are collected first, then data for all persons is fetched in parallel via `Promise.all` over the full ancestor map before rendering begins.

---

## Print / PDF

No changes to IPC layer. The existing `window.api.print.exportPdf()` call renders the full document (all sections) via Chromium's `printToPDF()`:
- Page size: A4
- Margins: 20mm all sides
- `printBackground: false`
- Chromium preserves `href="#anchor"` links as internal PDF bookmarks automatically

---

## i18n Keys

| Key | Swedish | English |
|-----|---------|---------|
| `reports.tab.ancestorBook` | Stamtavla | Ancestor Book |
| `reports.ancestorBook.title` | Stamtavla | Ancestor Book |
| `reports.ancestorBook.pickPerson` | Välj rotperson | Select focal person |
| `reports.ancestorBook.generationN` | Generation {n} | Generation {n} |
| `reports.ancestorBook.limitWarning` | Mer än 500 förfäder hittades — exporten visar de 500 närmaste. | More than 500 ancestors found — export shows the 500 closest. |
| `reports.ancestorBook.noPersonSelected` | Välj en person för att generera stamtavlan. | Select a person to generate the ancestor book. |
| `reports.ancestorBook.exportDate` | Exporterad {date} | Exported {date} |
| `reports.ancestorBook.ahnentafelList` | Ahnentavla | Ahnentafel List |
| `reports.ancestorBook.summaries` | Personsammanfattningar | Personal Summaries |

---

## Constraints and Non-Goals

- **No descendant pages** — only direct ancestors (parents, grandparents, etc.) get summary pages
- **No media/images** — media attachments not included in this export
- **No curved text** in SVG — straight tangential text only (simpler, more readable in print)
- **No interactive zoom/pan** in SVG
- **No new tests** — `fetchAllAncestors` is a BFS loop over existing well-tested API calls; no new test file warranted
