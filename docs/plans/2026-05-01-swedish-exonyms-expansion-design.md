# Swedish-Language Exonyms Expansion — Design

**Status:** Approved (design) — implementation plan to follow
**Date:** 2026-05-01

## Goal

Expand the Swedish-language gazetteers (`lang-sv-geonames` + `lang-sv-wikidata`) so that Swedish exonyms — the Swedish-language names used by Swedish genealogists for non-Swedish places — actually resolve. Today "Bryssel", "Köpenhamn", "Hälsingör", "Wien", "Florens", "Åhlborg", and similar bare Swedish forms fail to match because the alias arrays on the relevant nodes don't contain them.

This is purely a data/build-script issue. **Do not hand-edit the JSON.** The whole point is that the data is regenerable from a canonical open-licensed source — that's how new entries get added when GeoNames or Wikidata adds them, and how stale entries get removed when the upstream changes.

## Why

- Probe today: `resolvePlace("Bryssel")` returns NO MATCH; `resolvePlace("Brussels")` lands on Brussels, **Illinois** (a tiny hamlet in `us-immigration-states`) because no European Brussels exists in any gazetteer with "Bryssel" as an alias.
- The lang gazetteers exist and are wired into the resolver. The shape is correct (`"Belgium > Brussels Capital": ["Brysselregionen"]`). The data is just incomplete.
- Swedish genealogists routinely write Swedish names for foreign places in their notes ("Köpenhamn 1872" not "København 1872"). The resolver should match what users actually type.

## Canonical sources

Two complementary sources, picked deliberately:

1. **GeoNames `alternateNamesV2.txt`, filtered by `isolanguage = sv`.** CC BY 4.0. This is the existing `build-lang-sv-geonames.ts` source. It already covers countries and admin1; the gap is that it's currently filtered too narrowly. Re-running with a broader scope (admin2 / city / capital) will pull in Swedish names for European capitals and major cities.
2. **Wikidata SPARQL `rdfs:label @sv`.** CC0 1.0. This is the existing `build-lang-sv-wikidata.ts` source — currently scoped to Nordic admin divisions. Broaden to European countries' admin1 + their capital cities and significant cities by querying with population + capital filters.

We do **not** invent aliases. Every Swedish name in the output traces back to one of those two sources. If a place has no Swedish exonym in either source (e.g. small Belgian villages), it gets no entry — the resolver falls back to the native name, which is the correct behaviour.

## Architecture

### Modify: `scripts/build-lang-sv-geonames.ts`

Currently the script only walks countries + admin1. Extend the walk to also include:
- **Capitals and major cities**: `feature_class = P` (populated place) AND `population >= 100000` from `cities15000.txt` / `cities500.txt`. This pulls in Brussels, Vienna, Florence, Aalborg, etc. — anywhere a Swedish exonym likely exists.
- For each candidate place, look up GeoNames altname rows where `isolanguage = sv` AND the Swedish name `≠` the canonical English/native name.

The output structure is unchanged: `translations: { "Country > Admin1 > City": ["Swedish name", ...] }`. We're just adding more entries.

### Modify: `scripts/build-lang-sv-wikidata.ts`

Currently the SPARQL query only fetches Nordic admin divisions. Add two queries (mirrors the world-historical pattern):

- **Q1**: European admin1 of Q458 (EU) + Q46 (Europe) members — already covered for Nordic, broaden to the rest. Filter by `rdfs:label @sv` exists AND `≠` native label.
- **Q2**: Capital cities (`P31 = Q5119`) of European countries with `rdfs:label @sv` ≠ `rdfs:label @en`.

The script already merges results by path key — no merge logic change.

### Output sizes

Rough estimate: GeoNames extension adds ~500–1000 new translation entries. Wikidata extension adds ~200–500 new entries. Combined output `lang-sv-*.json` files grow from ~few hundred entries to ~2000 — still negligible against the 42 MB total bundle.

### No new gazetteer files

This is an extension of the two existing language gazetteers, not new files. `bundled.ts` doesn't change. `BUNDLED_GAZETTEERS` count doesn't change.

## Testing

- Unit (`tests/unit/gazetteers.test.ts`): expand the existing lang-gazetteer tests to assert specific known exonyms resolve:
  - `resolvePlace("Bryssel")` → `Belgium › Brussels Capital`
  - `resolvePlace("Köpenhamn")` → `Danmark › Hovedstaden › København`
  - `resolvePlace("Wien")` → `Austria › … › Vienna`
  - `resolvePlace("Florens")` → `Italy › Tuscany › Florence`
  - `resolvePlace("Aalborg, Sverige")` — note: this is the *Danish* spelling. Expected: still resolves to `Danmark › Region Nordjylland › Aalborg Kommune` because Aalborg is canonical. The Swedish exonym would be in the alias array if one exists in GeoNames; if not, that's fine — Swedes also use Aalborg.
  - `resolvePlace("Åhlborg, Danmark")` — only resolves if "Åhlborg" exists as a Swedish alt-name in GeoNames for Aalborg. If it doesn't, the test asserts NO MATCH (and we don't pretend it does). The user can correct their typing or use the canonical form.
- Determinism: build script twice → identical JSON.
- License audit: every new entry has `<sourceTag>` in the comment header (`gn` or `wd`) so a future reviewer can audit provenance.

## Out of scope

- Hand-curating Swedish aliases that the canonical sources don't contain. **Hard rule.** If a user wants "Lillköping" added, that's a contribution upstream to GeoNames/Wikidata, not a hand edit here.
- Adding a third language source (e.g. Wikipedia interwiki labels). Two sources is enough; more increases drift risk.
- Other languages. The existing pattern would extend naturally to `lang-de-*`, `lang-no-*`, etc., but those are separate specs driven by their own user demand.

## Open questions

- Should we add the Swedish exonym to the *boundary* gazetteer's nodes too? No — boundaries are referenced by the resolver via the same translation lookup; the lang gazetteer's translations apply to boundary resolves too because `mergeTranslations` runs against the loaded gazetteer set.
