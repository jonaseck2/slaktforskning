# Plan: Bengt feedback — small bug fixes

**Date:** 2026-04-29
**Status:** planned
**Source:** `BENGT.md`
**Effort:** S–M (one PR per cluster, can be batched)

## Background
Cluster of small, independent bug fixes and minor UX corrections from Bengt's feedback. None require architectural change.

## Tickets covered
- BENGT #10 — Disable DevTools panel on production launch
- BENGT #28(b) — Don't pre-select last-used event type when adding new event
- BENGT #28(d) — Drop `baptism` from `EVENT_TYPE_VALUES` (keep `christening`)
- BENGT #36 — Warn (not block) when changing event_type on existing event
- BENGT #38 — "..." button shows tiny single-row dropdown — show full list directly
- BENGT #40 — Help → About menu with version + OSS attribution
- BENGT #8 (parent_child only) — Subtype select on Add-Related-Person flow, default `biological`
- "Önskemål om cirkeldiagrammet" — fan chart center segment links to wrong ancestor
- "Önskemål om cirkeldiagrammet" — replace fan chart bespoke tooltips with default tooltip system

## Tasks

### #10 DevTools off in production
- [ ] [src/main/index.ts:56](../../src/main/index.ts#L56) — wrap `win.webContents.openDevTools()` in `if (MAIN_WINDOW_VITE_DEV_SERVER_URL)`

### #28b Don't pre-select event type
- [ ] `EventModal.vue` — when `editingEvent` is null and no specific type was passed, default `form.event_type` to empty string / null instead of last-used
- [ ] Verify the quick-pick row (Födelse/Vigsel/Död/Övriga) shows none-active in this state

### #28d Drop baptism
- [ ] [src/renderer/constants/eventTypes.ts](../../src/renderer/constants/eventTypes.ts) — remove `baptism` from `EVENT_TYPE_VALUES`
- [ ] Migration: existing rows with `event_type='baptism'` → mass-update to `christening` on schema apply (low risk — same semantic in Swedish-speaking contexts)
- [ ] Remove `baptism` keys from i18n
- [ ] Update GEDCOM importer mapping if `baptism` was a separate input branch

### #36 Warn on event type change
- [ ] `EventModal.vue` edit mode — show inline warning under event_type select when value changes from initial: "Att ändra händelsetyp efter registrering kan göra fält och citationer inkonsekventa."
- [ ] No actual block — user can still save

### #38 Full list in "..." dropdown
- [ ] `EventModal.vue` — when "..." is clicked, render a full select with all `OTHER_EVENT_TYPES` options expanded, not a single-line popover
- [ ] Default to no value selected (ties in with #28b)

### #40 About menu
- [ ] [src/main/index.ts](../../src/main/index.ts) — add `Help` menu with `About OurLegacy` item
- [ ] About modal in renderer: app name + version (read from package.json), short description, "Open source — view on GitHub" link, license blurb (MIT or whatever the repo uses)
- [ ] Use `shell.openExternal` for the GitHub link

### #8 parent_child subtype
- [ ] `PersonModal.vue` — when `relatedTo` mode is `father`/`mother`/`child`, expose a `parent_child_subtype` select with `PARENT_CHILD_SUBTYPE_VALUES`, default `biological`
- [ ] Persist via `createRelationship` (subtype field already exists in schema)

### Fan chart bugs
- [ ] `FanChartReport.vue` (or chart component) — investigate center segment link target. Likely an off-by-one in the ahnentafel index when building the click handler
- [ ] Replace bespoke tooltip with the same default tooltip used elsewhere in the app (find the existing pattern via grep — likely `title` attribute or a shared tooltip directive)

## Out of scope
- Lock-on-event-type-change (#36 alternative) — explicitly chose warn over block
- Multi-pick file-thumbnails preview (#13) — explicitly out
- Sibling subtype (#8 sibling part) — explicit no-op

## Verification
- Build a production binary, launch it, confirm no DevTools panel
- Add a new event without preset type — none should be pre-selected
- Open existing baptism events after migration — should now read as christening
- Change event_type on existing event — see warning, save still works
- Click "..." on event-type quick-pick — see full list
- Help → About — see modal with version and GitHub link
- Add child via Add Family Member — see "Typ" select defaulting to biological
- Open fan chart — center segment opens the correct person; tooltips look like elsewhere
