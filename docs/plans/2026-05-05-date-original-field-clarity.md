# Implementation: Clarify the `date_original` field in event modals

**Date:** 2026-05-05
**Branch strategy:** main (UI label + help text + data-quality follow-up)
**Source:** Beta tester report 61 (v0.215.2)

## User goal

Open the event modal (e.g. add Birth event) and immediately understand what the second date field below the parsed date is for. Today the field has no clear purpose — the user typed an address there, expecting it to be a "description of the date". When they then sorted the person list by birth date, the address sorted before the year, breaking the list.

The user's words (translated, condensed): *"Below the birth date there's a field whose intended use is unclear to me. If I select 'Approximately' as the date qualifier, should I write 'Approximately 1945-03-13' there? Or what's the intent? I once typed the home-birth address there. That clearly wasn't the intent. … Wish: clarify how this field should be used."*

## User-visible bug also confirmed

`listPersonsPage` line 536 ranks rows by `COALESCE(NULLIF(e.date_original, ''), e.date_value)` — `date_original` (verbatim authored string) wins over `date_value` (parsed ISO) for *display* in the list, even when `date_original` contains free-form text that isn't a date. This is the symptom the user observed: "Hemma, Storgatan 1" sorts before "1945-03-13".

The display rule is intentional — the user's verbatim authoring beats our parse — but it presumes the field is used as intended. The plan's first job is to make the intent obvious; the second is to handle the recovery path for users who have already mis-used it.

## Scope

Two surfaces and one data-quality check:

1. **Event modal** (`src/renderer/components/modals/EventModal.vue`) — the field labeled at line 52. Add a clear label and a one-line helper text. The helper must convey: "verbatim original — paste/type the source's exact wording (e.g. 'omkring 1845', 'born about 1845-03', 'kring midsommar 1900'); leave blank if you only have the parsed date."
2. **Every other modal that exposes `date_original`** — audit `src/renderer/components/modals/`. If `EventModal` isn't the only consumer, fix all of them.
3. **Quality check** — add a `data-quality` rule that flags events whose `date_original` is non-empty and contains no digit (likely free-form text that isn't a date), AND whose `date_value` is empty/null (so the row would show only the bad text). This is the recovery path: existing data already has the wrong content; the user needs help finding it.

### Scope deviations

- Don't auto-clear or auto-migrate any `date_original` value. Prime Directive: authored data stays. The quality check surfaces the issue; the user fixes manually.
- Don't change the display priority (`COALESCE(NULLIF(date_original, ''), date_value)`). Verbatim wins by design.
- Don't add a parse-validation modal that blocks save. Helper text + quality check is enough; rejecting authored input is wrong.

## Design summary

### Label + helper text

In the EventModal, replace whatever today's label is (or add one) with:

- **Label:** `{{ $t('events.dateOriginalLabel') }}` → SV: `"Originaltext (källans ordalydelse)"` / EN: `"Original wording (as in the source)"`
- **Helper:** `<p class="ep-field-help">{{ $t('events.dateOriginalHelp') }}</p>` → SV: `"Skriv det exakta datumet som källan anger, t.ex. 'omkring 1845' eller 'midsommardagen 1900'. Lämna tomt om du bara har det tolkade datumet ovan."` / EN: `"Type the date exactly as the source records it, e.g. 'about 1845' or 'midsummer 1900'. Leave blank if you only have the parsed date above."`

The helper renders below the input in `--text-muted`, `--font-sm`. Match existing helper patterns in the codebase (search `ep-field-help` or equivalent — pick the existing convention).

### Quality check

In `src/api/quality_checks.ts` (or wherever the quality view's checks live), add:

```ts
{
  id: 'event_date_original_non_date',
  severity: 'warning',
  description: t('quality.eventDateOriginalNonDate'),
  query: `
    SELECT e.id, e.event_type, e.date_original
    FROM events e
    WHERE e.date_original IS NOT NULL
      AND TRIM(e.date_original) <> ''
      AND e.date_original NOT GLOB '*[0-9]*'
  `,
  // Row click → navigate to the event's primary participant's PersonPanel,
  // open Events section, focus the offending event.
}
```

Per `.claude/rules/api.md` and the renderer rules, the QualityView already has clickable-row navigation; this check plugs into that.

i18n keys: `quality.eventDateOriginalNonDate` ("Originaltext på datumfält saknar siffra (innehåller fri text)" / "Date original field has no digit (contains free text)").

## Tasks

- [ ] **Audit modals** for `date_original` consumers. List in this plan before editing.
- [ ] **Add label + helper text** in EventModal and every audited modal. Use the new `events.dateOriginalLabel` / `events.dateOriginalHelp` i18n keys.
- [ ] **i18n keys** in `sv.ts` and `en.ts`: `events.dateOriginalLabel`, `events.dateOriginalHelp`, `quality.eventDateOriginalNonDate`.
- [ ] **Add quality check** with the SQL above. Wire row click to event's primary participant's PersonPanel.
- [ ] **Unit test** on the quality check: seed events with (a) digit-bearing `date_original`, (b) digit-free `date_original`, (c) empty `date_original`. Assert only (b) is flagged.
- [ ] **Patch bump** + CHANGELOG: `- fix: clarify 'date original' field with label and helper; flag misuse via quality check`.

## Verification (user-observable)

1. Open the event modal for a Birth event. The second date field has a clear label ("Originaltext (källans ordalydelse)") and a one-line helper below it explaining the intent.
2. Open Quality view. The new check `event_date_original_non_date` lists every event whose `date_original` is non-digit text. Row count is non-zero on a database with the user's existing mis-use.
3. Click a flagged row → navigate to the person's PersonPanel → Events section, with the offending event visible. User edits / clears `date_original`, sort order in person list returns to correct.
4. Locale switch (sv ↔ en) renders both label and helper in the chosen language.

## Failure modes / RCA reference

- **Don't auto-clear.** A future "fix it for them" temptation is to auto-blank `date_original` when it has no digits. That's a Prime Directive violation — authored data stays until *another* explicit human action removes it.
- **Don't change display priority.** Verbatim wins by design. The point of `date_original` is to preserve "kring midsommar 1900" as the user authored it; we display it precisely so the user sees what they wrote, not what we parsed.
- **Don't add a parse-validation gate.** Many legitimate `date_original` strings won't parse to ISO ("midsummer 1900"). Blocking save on parse failure breaks legitimate authoring.
- **Helper text must be one line.** Two lines of helper inside a modal field is a UX smell — if it needs two lines, the field design is wrong, not the text.
