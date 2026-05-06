# Implementation: Source-type curation

**Date:** 2026-05-06
**Design spec:** [2026-05-06-source-types-curation-design.md](2026-05-06-source-types-curation-design.md)
**Branch strategy:** worktree (touches enum, i18n, registry, schema; tests across multiple layers)
**Source:** Beta tester reports 70 + 71 (v0.215.2)

## User goal

When recording a source, the genealogist picks from a dropdown that **covers the kinds of sources actually used in Swedish genealogy** and **is alphabetically scannable**. Today the list is too short and ordered in a way that's neither alphabetical nor grouped — they have to read every entry to find the right one, and several common Swedish source kinds (passenger lists, probate inventories, peerage registers, encyclopedias) aren't in the list at all.

Specifically: passenger lists, bouppteckningar, peerage registers, encyclopedias, and "another genealogist's work" all become first-class types; "Tidning" widens to "Tidning / Tidskrift"; "Onlinedata" becomes "Onlinedatabas / Sociala media"; and the dropdown sorts alphabetically in the user's locale.

## Locked decisions

From the design spec, all locked:

- **A1.** Rename `newspaper` label → "Tidning / Tidskrift" / "Newspaper / periodical". Enum value unchanged.
- **A2.** Rename `online_data` label → "Onlinedatabas / Sociala media" / "Online database / social media". Enum value unchanged. No splits or per-platform breakouts.
- **B1.** Add `passenger_list` ("Utvandringshandling / Passagerarlista" / "Passenger list").
- **B2.** Add `probate_inventory` ("Bouppteckning" / "Probate inventory").
- **B3.** Add `genealogist` ("Släktforskare / forskningsarbete" / "Genealogist's work").
- **B4.** Add `peerage_register` ("Adelskalender" / "Peerage register").
- **B5.** Add `encyclopedia` ("Uppslagsverk" / "Encyclopedia").
- **B6.** Skip `swedish_death_index`. Use `online_database` and let the source's title field carry "Sveriges dödbok".
- **C.** Order alphabetically in the user's locale.

## Scope

Five layers touch source types. Every one needs the new values + the new ordering:

1. **`src/renderer/constants/eventTypes.ts`** — `SOURCE_TYPE_VALUES` array. Add 5 new values; preserve existing values for back-compat.
2. **`src/renderer/i18n/sv.ts` + `src/renderer/i18n/en.ts`** — `sourceTypes.<value>` keys. Add 5 new entries; rewrite the labels for `newspaper` and `online_data`.
3. **`src/api/gedcom_fidelity_registry.ts`** — current registry entry for `sources.source_type` is one row covering the entire enum; new values widen the enum but the registry status (`lossy:5.5.1-spec-limit` or similar — confirm during impl) stays the same. No new column → no new registry row.
4. **GEDCOM exporter** (`src/gedcom/exporter.ts`) — current `source_type` → GEDCOM mapping table. New values need an entry. If a new value has no clean GEDCOM analogue, map to a generic SOURCE record with the type in NOTE; document the lossy mapping in a code comment.
5. **GEDCOM importer** (`src/import/gedcom/`) — confirm imported `source_type` strings are coerced through a known-set check. If yes, the new values join the set automatically. If the importer trusts whatever string is in the file, no change needed.

The dropdown consumer (`SourceModal.vue` or wherever `SOURCE_TYPE_VALUES` is read) gets sorted by locale label at render time — not by hardcoded order. That way a user switching locale also sees the dropdown re-sorted.

### Scope deviations

- **Migration of existing rows**: not needed for any of these changes. Renames are label-only (enum values unchanged); additions don't touch existing rows.
- **Per-platform social media split** (Facebook / Instagram / Wikipedia / …): explicitly rejected per the locked decisions.
- **Grouped dropdown** with non-selectable group headings: explicitly rejected.
- **Sveriges dödbok as a separate type**: explicitly rejected.

## Design summary

### Sort at render

The constants file stays in code-friendly order (e.g. canonical-then-additions). The render-time sort happens where the dropdown is built:

```ts
// In SourceModal.vue (or wherever the dropdown is)
const { t, locale } = useI18n();
const collator = computed(() => new Intl.Collator(locale.value));
const sortedSourceTypes = computed(() =>
  [...SOURCE_TYPE_VALUES].sort((a, b) =>
    collator.value.compare(t(`sourceTypes.${a}`), t(`sourceTypes.${b}`))
  )
);
```

`Intl.Collator(locale)` is mandatory here — Swedish needs å/ä/ö ordered correctly relative to z, which BINARY string compare gets wrong. (This is the same rule as the relations-ordering plan that shipped earlier.)

### Filter chips

If `SourcesView` has a FilterChips bar bucketed by source type (per renderer rules), the new types appear as chips automatically once they have at least one row using them. No code change. Confirm during impl.

### MCP tool surface

`add_source` / `update_source` MCP tools accept `source_type` as a string. Today's enum check probably uses `SOURCE_TYPE_VALUES.includes(...)` — the new values flow through automatically.

## Tasks

- [ ] **Add the 5 new values** to `SOURCE_TYPE_VALUES` in `src/renderer/constants/eventTypes.ts`. Preserve existing values; append the new ones (sort happens at render).
- [ ] **i18n sv + en** — add labels for `passenger_list`, `probate_inventory`, `genealogist`, `peerage_register`, `encyclopedia`. Rewrite labels for `newspaper` and `online_data`.
- [ ] **Locale-aware sort** in the dropdown consumer (most likely `SourceModal.vue` — confirm during audit). Use `Intl.Collator(currentLocale)`. **Test**: in Swedish, "Adelskalender" appears before "Bok" (A < B); in English, "Encyclopedia" appears before "Foster relationship" (E < F).
- [ ] **GEDCOM export mapping** — find the `source_type` → GEDCOM class table; add entries for the 5 new types. Where no clean GEDCOM equivalent exists (most genealogy types map cleanly to vital_record/census/etc., but `peerage_register` and `genealogist` may not), map to a generic source with NOTE.
- [ ] **GEDCOM import coercion** — audit; confirm new values import correctly without code changes. If the importer maps GEDCOM source classes back to enum values via a static map, add reverse entries.
- [ ] **Registry coverage** — re-run `npx vitest run gedcom-fidelity-registry-coverage` to confirm no missing entries.
- [ ] **Unit test (sort)** — assert `sortedSourceTypes` ordering for sv and en locales using known fixtures.
- [ ] **Unit test (round-trip)** — for each new type, seed → export → re-import → verify the type round-trips losslessly (or with the documented lossy reason).
- [ ] **Manual smoke (deferred to user)** — open Source modal, confirm dropdown shows all 17 (12 old + 5 new) types alphabetically. Save a source of each new type; reload; confirm label persists.
- [ ] **Minor bump** + CHANGELOG: `- feat: source types include passenger list, probate inventory, peerage register, encyclopedia, genealogist; dropdown sorts alphabetically; "Tidning / Tidskrift" and "Onlinedatabas / Sociala media" relabeled`.

## Verification (user-observable)

1. Open Source modal. Type dropdown shows ~17 entries, sorted alphabetically in the current locale.
2. Each new type (passenger_list, probate_inventory, genealogist, peerage_register, encyclopedia) is selectable.
3. Existing source rows tagged `newspaper` now display the label "Tidning / Tidskrift" — the row's enum value didn't change; only the rendered label.
4. Existing rows tagged `online_data` display "Onlinedatabas / Sociala media".
5. Switch locale en ↔ sv. The dropdown re-sorts; å/ä/ö appear in their correct Swedish positions.
6. Export a source of each new type to GEDCOM and re-import; the type survives or matches the registry's documented lossy expectation.

## Failure modes / RCA reference

- **Hardcoded sort order in the dropdown**: `SOURCE_TYPE_VALUES` order is for code organization, not display. The render-time sort is the source of truth for what the user sees.
- **Locale collation skipped**: raw string compare puts å after z incorrectly. `Intl.Collator(locale)` is mandatory — same rule as the relations-ordering plan.
- **Migration not needed**: don't write a migration for the renames. Enum values are unchanged. Adding new values doesn't touch existing rows. Resist the urge.
- **GEDCOM round-trip silent drop**: every new type must have an exporter mapping (lossless or documented lossy) AND an importer reverse mapping. The registry test catches missing entries; the per-field round-trip test catches silent drops.
- **MCP tool input validation**: `add_source` / `update_source` accept `source_type`. The validation set must include the new values, otherwise agents calling MCP get a confusing rejection.
- **Filter chip computation**: the FilterChips on SourcesView buckets by `source_type`. If the bucket label isn't running through `t('sourceTypes.<value>')`, it'll show the raw enum string. Confirm during audit.
