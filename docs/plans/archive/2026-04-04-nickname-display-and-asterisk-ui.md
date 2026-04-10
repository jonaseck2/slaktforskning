# Fix: Nickname insertion position + asterisk notation in UI

## Problem

1. `fullNameParts` placed nickname *after all given-name tokens*, so
   "Elisabeth Cathrina" + preferred="Elisabeth" + nickname="Lisa" rendered
   as `Elisabeth Cathrina "Lisa"` instead of `Elisabeth "Lisa" Cathrina`.

2. Asterisk notation (`Elisabeth* Cathrina`) was only processed by the
   GEDCOM importer when `profile: 'genney'` was set — users could not use
   it in the PersonDetailView name form.

3. `listPersons`/`searchPersons` did not return `nickname`, so PersonsView
   and PersonPicker never showed it.

4. GEDCOM export emitted `_TILLTALS` as the canonical tag for tilltalsnamn.
   Simpler to use only the asterisk notation consistently.

## Root Cause

- `fullNameParts` (nameUtils.ts) appended nickname unconditionally after the
  full `givenNameParts()` call, ignoring where the preferred token sat.
- The asterisk parser in importer.ts was inside `if (isGenney && ...)`.
- `SELECT` in listPersons/searchPersons omitted `pn.nickname`.
- Exporter emitted `_TILLTALS` in addition to the asterisk.

## Fix

- `fullNameParts`: rewrote to iterate tokens manually; inserts `"nickname"`
  immediately after the preferred-name token (falls back to end of given
  names when no preferred token is present).
- Added `parseAsteriskNotation(raw)` utility to nameUtils.ts; called in
  PersonDetailView's `addName` and `saveEditName` submit handlers — explicit
  `preferred_name` field takes precedence over asterisk.
- `listPersons`/`searchPersons` now select `pn.nickname`; PersonsView and
  PersonPicker pass it to `<PersonName>`.
- Exporter: removed `_TILLTALS`, keeps only asterisk in NAME value.
- Importer: asterisk processing no longer gated on `isGenney`; any GEDCOM
  with asterisk notation gets preferred_name extracted.

## Files Changed

- `src/renderer/utils/nameUtils.ts` — fullNameParts rewrite + parseAsteriskNotation
- `src/api/persons.ts` — listPersons/searchPersons return nickname
- `src/renderer/views/PersonsView.vue` — PersonRow.nickname + pass to PersonName
- `src/renderer/components/PersonPicker.vue` — PersonResult.nickname + pass to PersonName
- `src/renderer/views/PersonDetailView.vue` — asterisk parsing on submit
- `src/gedcom/exporter.ts` — removed _TILLTALS
- `src/gedcom/importer.ts` — asterisk processing profile-agnostic
- `tests/unit/nameUtils.test.ts` — updated + new parseAsteriskNotation tests
- `tests/unit/gedcom.test.ts` — updated roundtrip + asterisk-without-profile test
