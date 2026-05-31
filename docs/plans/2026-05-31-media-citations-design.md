# 2026-05-31 — Media citations (Ben rapport 104) — design spec

> **Status:** design-only. This document surfaces the data-model and GEDCOM round-trip choice for "Media can contain a citation" (Ben Rapport 104, 2026-05-25). No implementation plan exists yet — write one only after the framing question is answered.

## User goal

Ben opens a media item (a portrait, a scanned page, a video clip) and can record where that media came from with the same fidelity he records any other source citation: a source row + page/location + a confidence level + an optional transcription + optional notes. After the round-trip through GEDCOM (export + re-import), the citation he attached to the media survives.

The user goal is *recording provenance of a media file*, not *recording that a media file illustrates a source*. The distinction matters because the app already supports the second case (media_links with entity_type='source'), and the user-facing question is whether Ben wants the first or accepts the second.

## Framing: which problem are we solving?

Ben's report is one sentence: *"FÖRSLAG: Att Media kan innehålla en Källhänvisning."* Two distinct readings, and the cost of the implementation is dominated by which one we pick.

### Framing A — Media-cites-Source (citation FK)

*"This scanned photograph of Anna Andersson came from page 42 of the parish registry. Confidence: secondary (it's a photo of an original, not the original itself). Transcription: 'Anna Andersson, dotter till…'."*

- New column: `citations.media_id` (NULL-able FK to `media(id) ON DELETE SET NULL`).
- New picker on MediaPanel ("+ Källhänvisning") opening `CitationModal` with `mediaId` prefilled.
- One new entry in `gedcom_fidelity_registry.ts`.
- **Round-trip:**
  - 5.5.1: `OBJE` records have no defined `SOUR` substructure. The only way is a custom `_SOUR` extension under the OBJE record. **Status: `lossy:5.5.1-spec-no-OBJE-SOUR-substructure` unless custom tag accepted.** With custom tag: `lossless-via:_SOUR-extension`.
  - 7.0: Same — `MULTIMEDIA_RECORD` doesn't accept `SOUR` per the spec's permitted-substructure table. The exception is `MULTIMEDIA_LINK` in some contexts, but that's the *link* (entity → media), not the *record* (media itself). **Status: `lossy:7.0-spec-no-OBJE-SOUR-substructure` unless custom tag accepted.** With custom tag: `lossless-via:_SOUR-extension`.
- Both versions converge: lossless only via a non-standard `_SOUR` sub-tag under OBJE records. Importable by our own importer; ignored by other tools. Genealogy-software-interop is the cost.

### Framing B — Surface existing media_links→source

*"This scanned photograph is associated with the parish registry source. Click through to view the source row."*

- No schema change. `media_links` with `entity_type='source'` already exists; `MediaPanel` doesn't surface it. Add a "Källor" section to `MediaPanel` (mirroring `PersonPanel.PersonSourcesSection`) listing the source rows this media is linked to, with `+` button to add a link.
- **Round-trip:** entirely lossless under both 5.5.1 and 7.0 today — media-to-source linkage maps to `OBJE` under `SOUR` (a SOUR record points at its scans).
- **Cost:** zero schema, zero registry change, one new section component (~80 LOC plus the link-add picker).
- **Limitation:** no page/confidence/transcription per-link. The user can record those on the source itself, not per-media-instance.

### Framing C — Media-as-Source (record duality)

A third reading worth surfacing for completeness: *"This media file IS a source — when I scanned the parish registry, the scan and the registry are the same evidentiary unit. Treat media as a source instance."*

- Reuses existing `sources` table; media file becomes the `file_ref`-bearing scan attached to the source row.
- Already partially supported: a Source can have a media linked via `media_links` (B). The "media is itself the source" reading is a UX framing, not a data-model change.
- Subsumed by Framing B's UI work.

## What we know about Ben's intent

- Ben uses Holger 8. Need to check whether Holger 8 supports per-media citations or per-media source-link. If Holger supports the former, Ben is likely asking for parity. If Holger only does the latter, Ben is asking for the existing-but-hidden feature to be exposed.
- Ben's other reports (100, 101, 102) consistently ask for *more visible* and *more direct* lifecycle controls — he wants what he can do on entity X to also be doable on entity Y. This nudges toward Framing B (he likely doesn't know `media_links→source` already exists because the UI doesn't show it).
- Confidence: ~60% Framing B, ~30% Framing A, ~10% Framing C. **The honest answer is: ask Ben.**

## Decision required before writing an implementation plan

1. **Ask Ben.** Show him a screenshot of how Framing B would look (a "Källor" section on MediaPanel listing source rows). If that answers his question, plan Framing B. If he says "yes but I also want a confidence and page number per scan", plan Framing A.
2. **If Framing A:** decide whether to accept the lossy GEDCOM status (and document it in the registry as `lossy:5.5.1-spec` / `lossy:7.0-spec` with spec citation) or invest in a `_SOUR` custom tag for both export and import. The latter is the more honest representation of the user's data but compromises GEDCOM tool interop.

## Verification (when this becomes a plan)

Each framing has a different verification:

**Framing B:**
- User-observable: open MediaPanel → see Källor section → click + → pick or create a source → save → the link is recorded. Open the source's panel → see the media in its media list (the reciprocal link).
- Tests: component test mounting MediaPanel and asserting the Källor section renders; an e2e walking the link-add flow; existing media_links round-trip test still passes.

**Framing A:**
- User-observable: open MediaPanel → see Källhänvisningar section → click + → CitationModal opens with media context → save citation with confidence 2 + page 42 + transcription → close → reopen MediaPanel → citation row visible.
- Tests: schema migration test asserts new column; new registry entry test (the schema introspection test enforces this); new per-field round-trip test: seed citation with media_id, export GEDCOM 5.5.1 + 7.0, re-import, assert citation.media_id round-tripped (or matches the declared lossy expectation per registry).
- E2e: walk the add-citation-to-media flow.

## Failure modes / RCA reference

- **None directly.** No prior failed attempt at media-citations exists in `docs/plans/archive/`.
- **Adjacent risk:** the gedcom_fidelity_registry CI gate will fail at the moment `citations.media_id` is added to the schema if a registry entry is missing. This is by design — see [.claude/rules/api.md](../../.claude/rules/api.md) Prime Directive (cont.). Both framings must respect this contract.

## Scope deviations

- **Framing C** intentionally not deepened. It's a useful framing to surface but it's not what Ben asked for, and Framings A and B cover the practical UX space.

---

## Next step

This is a design spec, not a plan. **Do not start implementation.** Ask Ben:

> *"Tack för Rapport 104. Två tolkningar — vilken passar bäst?"*
>
> *"(a) På Media kan jag lägga till en Källhänvisning med Källa + sida + tillförlitlighet + transkription (samma fält som för en händelses källhänvisning), eller"*
>
> *"(b) På Media kan jag se vilka Källor mediet är länkat till (utan sida/tillförlitlighet — det noteras på själva källan), och länka mediet till en till källa direkt från Media-panelen."*

Once Ben's answer is in, write the implementation plan at `docs/plans/YYYY-MM-DD-media-citations.md` following the appropriate verification list above.
