# Implementation: Partner heading is singular per row

**Date:** 2026-05-05
**Branch strategy:** main (single i18n key edit)
**Source:** Beta tester report 59 (v0.215.2, low priority)

## User goal

In PersonPanel → Relationer, each partner row shows under a heading that says "PARTNER" (singular), not "PARTNERS" (plural). Each row is one partner — the plural is grammatically wrong.

## Scope

Every place that renders a per-partner heading inside PersonRelationshipsSection (and any report that mirrors it). The relations renderer was just reordered in the `2026-05-04-person-relations-ordering` plan; the partner-row header lives there.

Files to audit:
- `src/renderer/components/PersonRelationshipsSection.vue` — primary surface
- `src/renderer/components/reports/{ALifeReport,AMarriageReport,LifeOnOnePageReport,PhotoAlbumReport}.vue` — same headings if any render them
- i18n: `src/renderer/i18n/sv.ts` and `en.ts` — find every `partners:` key and decide which is per-row (singular) vs section-level (plural)

### Scope deviations

A *section* heading that summarises ALL partners as a group (e.g. a collapsible region containing many partner rows) legitimately stays plural. Only per-row labels become singular. The audit must distinguish the two; document each occurrence.

## Investigation

The string `partners: 'Partners'` appears in both `sv.ts` and `en.ts` line 683. There may be more than one such key (per-row vs section-level). Before editing, search every consumer of every `partners*` key and label each occurrence as per-row or section-level.

```bash
grep -rn "$t('.*partners" src/renderer/
grep -rn "partner:" src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
```

## Tasks

- [ ] **Audit** all `partners` / `partner` i18n keys. For each, mark per-row vs section-level. Capture in a small table in this plan before editing.
- [ ] **Add `partner` (singular) keys** if not already present: `'Partner'` in both `sv.ts` and `en.ts`.
- [ ] **Switch per-row consumers** to the singular key. Section-level stays plural.
- [ ] **Test:** mount PersonRelationshipsSection with two partners. Each row's heading reads "Partner" (or its localized equivalent). The section-level container, if any, stays plural.
- [ ] **Patch bump** + CHANGELOG: `- fix: per-row partner heading is singular ('Partner' not 'Partners')`.

## Verification (user-observable)

1. Open a person with two partners. The first partner row's header reads "Partner" (Swedish: "Partner"). The second partner row's header also reads "Partner".
2. If a section-level "Partners" group header exists above both rows, it stays plural — that's correct ("the partners section contains multiple partner rows").
3. Switch to English. Per-row reads "Partner"; group reads "Partners". Both grammatically correct.

## Failure modes / RCA reference

- **One key, two consumers.** The same `partners` key may be reused for both per-row and section-level headings. Don't rename in place — add a new `partner` key, switch only the per-row consumers, keep the section-level one on the plural key. Renaming in place breaks any consumer you didn't audit.
- **Other languages.** Add the singular to every locale file the project ships, even ones not tested by the user — i18n CI breaks otherwise.
