# Citation-Level ArkivDigital Image Pointer — Design Spec

**Date:** 2026-08-23
**Status:** Filed. Blocks nothing.

## User goal

A researcher who imported from ArkivDigital can get from a citation back to the exact
archive image it came from, and that link survives an export and re-import.

## Why this is not already done

The `arkivdigital` profile stores the **volume** pointer — `_AID` on the SOUR record,
`v191316` — in `external_identifiers`, and re-emits it on export. The **image** pointer
lives one level down, on the citation:

```
2 SOUR @S1@
3 PAGE 52
3 _AID v191316.b580.s52     <- this one
```

6324 occurrences across the four real exports. It is still declared
`unmapped:pending-ad-citation-aid`.

The obstacle is mechanical, not conceptual. Storing an identifier against a citation
needs the citation's id at collect time, and `bulkCreateCitations` in `src/api/sources.ts`
generates ids internally and returns `void`. Every caller relies on that shape. Changing
it reaches the GEDCOM importer, the Genney importer, the Gramps importer and the event
importer's two citation-building sites — wider than the profile plan, and the kind of
signature change that deserves its own review rather than riding along.

## Scope

1. `bulkCreateCitations` accepts an optional caller-supplied `id` per row and returns the
   ids it used, matching the contract `.claude/rules/api.md` already states for bulk
   functions: *"Return `Promise<string[]>` of assigned ids"* and *"Accept caller-supplied
   `id`"*. It is the one bulk function that does neither.
2. The two citation-building sites in `src/import/gedcom/event-importer.ts` allocate the
   id up front and collect `{ entity_type: 'citation', system: 'arkivdigital.image',
   value }` alongside.
3. The exporter re-emits `3 _AID <value>` under the citation, prefetched by entity like
   the source-level one.
4. Delete the `*.SOUR._AID` entry from `accounting-declared.ts`.

**Scope deviation:** the other three importers keep passing no id; the parameter is
optional and their behaviour is unchanged.

## Verification

1. Import a file with a citation-level `_AID` and assert the row lands in
   `external_identifiers` with `entity_type = 'citation'`.
2. Export and re-import; assert it survives.
3. The accounting gate passes with `*.SOUR._AID` removed from the declared list.
4. `tests/unit/import-batching.test.ts` still green — the change must not turn a bulk
   insert back into per-row IPC.

## Note on urgency

Low. Once verbatim capture ships
([2026-08-23-unmapped-capture-design.md](2026-08-23-unmapped-capture-design.md)) the tag
is preserved and re-emitted without being modelled, so nothing is lost meanwhile. This
plan upgrades it from preserved to usable — a citation that knows its image can offer the
researcher a link.
