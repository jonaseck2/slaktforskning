# Feature: EVENT.cause UI

## Summary
Exposed the existing `cause TEXT` column on the `events` table in the UI and GEDCOM export.

## Problem
The `cause` column was already populated by Genney import and stored in the database, but the UI had no way to view or edit it.

## Changes

### EventForm.vue
- Added "Orsak" (Cause) text field, visible only for applicable event types: death, birth, emigration, probate, will, other
- Field is hidden (and cause is saved as null) when the selected event type does not support cause
- CAUSE_APPLICABLE_TYPES typed as `readonly EventTypeValue[]` for compile-time safety

### EventList.vue
- Shows cause inline in the description column when set: "(Orsak: value)"

### GEDCOM Exporter
- Emits `2 CAUS <value>` under individual event records when cause is non-null

### i18n
- sv: events.cause = 'Orsak', events.causePlaceholder = 't.ex. hjärtinfarkt'
- en: events.cause = 'Cause', events.causePlaceholder = 'e.g. heart attack'

## Files Changed
- `src/renderer/components/EventForm.vue` — cause field in form
- `src/renderer/components/EventList.vue` — cause display in list
- `src/renderer/i18n/sv.ts` — Swedish i18n keys
- `src/renderer/i18n/en.ts` — English i18n keys
- `src/gedcom/exporter.ts` — emit 2 CAUS tag
