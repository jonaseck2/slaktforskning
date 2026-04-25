# Website Export — App-Look Static Site

**Date:** 2026-04-25
**Status:** Design approved, awaiting implementation plan
**Replaces:** `src/api/html_site/` (current standalone HTML generator)

## Goal

Replace the current static HTML export with a read-only Vue SPA that visually matches the application. Visitors get the same sidebar, search, focus person, themes, and detail layouts they would see in the app — minus the editing affordances.

## Scope

### Included views (sidebar nav)

1. **People** — list view, no side panel
2. **Places** — map + list view, no side panel
3. **Media** — gallery
4. **Reports** — pre-rendered keepsake reports for the focus person
5. **Frameable prints** — pre-rendered chart prints for the focus person

### Detail pages (linked from list rows, search results, relationship cards, map markers)

- `/persons/:id` — full-page read-only person detail (events, family, sources, media, notes, identifiers). Reuses the same layout as `PersonPanel` rendered as a full-width page, no edit buttons.
- `/places/:id` — full-page read-only place detail (events, persons, media, citations, child places). Reuses `PlacePanel` layout.

### Excluded from sidebar (but still reachable inline)

- **Sources** — appear as citation footnotes inside person/place/event detail pages. No standalone sources list.
- **Relationships** — surfaced inside person detail pages (parents, spouses, children, siblings). No standalone relationships list.
- **Groups, Research Tasks, Quality, Settings, Import/Export, Database** — fully omitted.

### Settings retained (sidebar appearance panel)

- Theme (Forest / Nordic / Twilight)
- Appearance (Light / Dark / High Contrast)
- Text size (S / M / L)
- Language (Sv / En)
- Read aloud / Screen reader mode

## Architecture

### Build strategy: separate Vite entry with static-mode flag

A new Vite config `vite.static.config.ts` produces a self-contained SPA build under `dist-static/`:

```
dist-static/
├── index.html
├── assets/        # bundled JS + CSS (tokens.css, shared.css, components)
├── data.json      # full data snapshot (persons, places, events, sources, citations, relationships, media metadata)
└── media/
    ├── full/      # original-size files
    └── thumb/     # ≤800px thumbnails
```

The bundle reuses the existing renderer components but flips into static mode at startup:

```ts
// src/static/main.ts (new entry)
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';        // static-mode router (subset)
import { i18n } from '../renderer/i18n';
import { installStaticApi } from './static-api';
import App from './App.vue';               // static-mode App shell
import '../renderer/styles/tokens.css';
import '../renderer/styles/shared.css';

await installStaticApi();   // fetches data.json, mounts window.api stub

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.mount('#app');
```

### `window.api` stub (`src/static/static-api.ts`)

Implements the same surface used by the included views, backed by an in-memory snapshot loaded from `data.json`. Methods that mutate state are no-ops or throw. The stub covers:

- `persons.list*`, `persons.get*`, `persons.search`, `persons.getNames`, `persons.getEvents`, `persons.getRelationships`, `persons.getCitations`, `persons.getIdentifiers`
- `places.list*`, `places.get`, `places.search`, `places.getEvents`, `places.getPersons`, `places.getCitations`
- `media.list*`, `media.get`, `media.getForEntity`, `media.getRegions`, `media.readAsDataUrl` → returns a URL pointing at `media/full/<id>.<ext>`
- `events.get`, `sources.get`, `citations.getFor*`, `relationships.get`, `relationships.getOfPerson`
- `db.getSetting` for `default_person_id`, `gazetteer_config`, `link_rules_config`, `researcher_name`
- `checks.runAll` → returns `null` (signals "not available")

Channels for editing, deletion, undo/redo, file dialogs, printing, and DB switching are absent — components that call them are gated by the static-mode flag and don't render those buttons.

### Static-mode flag

A single boolean `import.meta.env.VITE_STATIC_MODE` (set to `true` in `vite.static.config.ts`, falsy in renderer build) is consumed by:

- `App.vue` static fork → renders simplified sidebar (5 nav items only, no Quality/Tasks badges, no `import-export`, no `settings` link)
- Person/place detail components → hide all "Edit", "Add", "Delete", "+ Add", and `<button>` controls
- `EventList`, `PersonNamesTable`, `ResearchTasksTable`, `GroupsTable` → readonly mode; no row-edit, no add buttons
- `:id` routes → render a full-width detail layout instead of opening a side panel

To keep the flag from spreading, add a Pinia store `useUiModeStore()` that exposes `isReadOnly` computed from the env var. Components import the store; tests/dev can override it.

### Routing (static-mode router)

`src/static/router.ts` mirrors `src/renderer/router.ts` but with a reduced route set:

```ts
{ path: '/',            redirect: focusPersonId ? `/persons/${focusPersonId}` : '/persons' }
{ path: '/persons',     component: PersonsListView }   // list only, no panel
{ path: '/persons/:id', component: PersonDetailView }  // full-page read-only detail
{ path: '/places',      component: PlacesListView }    // map + list
{ path: '/places/:id',  component: PlaceDetailView }
{ path: '/media',       component: MediaView }         // existing component, read-only
{ path: '/reports',     component: ReportsIndexView }  // links to pre-rendered reports
{ path: '/reports/:slug', component: ReportPageView }  // renders one pre-configured report
{ path: '/prints',      component: PrintsIndexView }
{ path: '/prints/:slug',  component: PrintPageView }
{ path: '/search',      component: SearchView }        // existing component, read-only
```

Hash history (`createWebHashHistory`) is preserved so deep links work on `file://`.

`PersonDetailView` and `PlaceDetailView` are new components (~50 lines each) that wrap the existing `PersonPanel` / `PlacePanel` content into a full-width page layout. They reuse the panel's section components directly — `PersonNamesTable`, `EventList`, `EntityMediaSection`, etc. — passing `readonly` so action buttons disappear.

### Data snapshot (`data.json`)

Generated at export time by `src/api/html_site/generator.ts` (rewritten). Single JSON file, top-level shape:

```json
{
  "meta": {
    "siteTitle": "Family Tree",
    "focusPersonId": "uuid",
    "exportedAt": "2026-04-25T...",
    "researcherName": "...",
    "scope": { "ancestors": 5, "descendants": 3, "everyone": false },
    "options": {
      "includeMedia": true,
      "includeReports": true,
      "includePrints": true,
      "excludeLiving": false,
      "redactLiving": true
    }
  },
  "persons":       [ ... ],
  "personNames":   [ ... ],
  "personIds":     [ ... ],
  "relationships": [ ... ],
  "events":        [ ... ],
  "eventParticipants": [ ... ],
  "places":        [ ... ],
  "sources":       [ ... ],
  "citations":     [ ... ],
  "media":         [ ... ],
  "mediaLinks":    [ ... ],
  "mediaRegions":  [ ... ],
  "settings": {
    "default_person_id": "uuid",
    "gazetteer_config":  { ... },
    "researcher_name":   "..."
  }
}
```

The static-api stub builds in-memory indices on first load (by id, by person→names, by event→participants, etc.) so query latency matches the live app.

### Pre-rendered reports & prints

Reports and frameable prints are Vue components that already work — but pre-rendering them as static HTML+PDF means visitors get a clean printable page even with JS disabled, and the report layout is locked at export time so future scope changes don't reshuffle the printed output.

For each report/print included in the export, the main process spawns a hidden `BrowserWindow` pointing at `file://<output>/index.html#/reports/<slug>?prerender=1`. The static build's router sees `prerender=1` and renders the report full-bleed with the sidebar hidden. After `did-finish-load` plus a 1.5s settle window (Leaflet, fonts, image loads):

1. Capture HTML: `webContents.executeJavaScript('document.documentElement.outerHTML')` → `<output>/reports/<slug>.html`.
2. Capture PDF: `webContents.printToPDF()` → `<output>/reports/<slug>.pdf`.

`ReportPageView.vue` in the SPA renders an `<iframe src="/reports/<slug>.html">` for the preview and surfaces a download link to the PDF. Visitors browsing online see the rendered report inline; print/save uses the embedded PDF.

This is the same hidden-window pattern already used for chart export in `src/main/ipc/utility.ts` — well-trodden ground.

## Export dialog UX

A reworked `WebsiteExportView.vue` (route `/website`) replaces the current single-button section. Layout:

```
Website Export
─────────────────────────────────────
Subject
  Focus person: [PersonPicker] (defaults to default_person_id)
  Used for both data scope and report subject.

Data scope
  ◯ Everyone (full database)
  ● Focus person and family
      Ancestor generations: [5 ▾]
      Descendant generations: [3 ▾]

Privacy
  ☐ Exclude living persons entirely
  ☑ Redact details for living persons (decade-only dates, no events/sources/media)

Include
  ☑ Media (originals + thumbnails)
  ☑ Reports (pre-rendered for focus person)
  ☑ Frameable prints (pre-rendered for focus person)

Site
  Site title: [____________]
  ☑ Swedish    ☑ English

[Choose folder & export]
```

After export completes: success toast + "Open folder" button. The output directory contains a self-contained site that can be opened, zipped, or uploaded as-is.

## Living-person handling

- **Exclude entirely:** persons with `living=true` are dropped from the snapshot. Relationships referencing them become orphaned and are also dropped.
- **Redact:** persons with `living=true` keep their preferred name, sex, and a decade-floored birth year (`1985` → `1980s`). Their events, sources, media, identifiers, notes are not exported. Their detail page shows a "Details redacted for privacy" notice.
- Both flags are independent. If both are set, exclude wins.

## Search

Client-side. On init, the static-api stub builds a [lunr](https://lunrjs.com/) index over person names, place names, source titles, and event places. The existing `SearchView` calls `window.api.persons.search(q)` etc., which the stub answers via lunr — no UI changes to SearchView needed.

Index size for ~1000 persons: ~200 KB. Acceptable.

## What changes in the existing codebase

### New files

- `vite.static.config.ts` — separate Vite config, defines `VITE_STATIC_MODE`, externalizes nothing (single self-contained bundle).
- `src/static/main.ts` — Vue bootstrap for static mode.
- `src/static/App.vue` — simplified shell (5-nav sidebar, no badges, no settings/import-export links, no auto-set-focus from db).
- `src/static/router.ts` — reduced route table.
- `src/static/static-api.ts` — `window.api` stub backed by `data.json` + lunr.
- `src/static/views/PersonDetailView.vue` — full-page wrapper around PersonPanel content.
- `src/static/views/PlaceDetailView.vue` — full-page wrapper around PlacePanel content.
- `src/static/views/PersonsListView.vue` — list-only (lifted from PersonsView's list tab).
- `src/static/views/PlacesListView.vue` — map + list-only.
- `src/static/views/ReportsIndexView.vue` — links to pre-rendered reports.
- `src/static/views/ReportPageView.vue` — iframe or HTML embed of one pre-rendered report.
- `src/static/views/PrintsIndexView.vue` and `PrintPageView.vue` — same pattern for prints.
- `src/api/html_site/snapshot.ts` — replaces `generator.ts`. Builds `data.json` from the DB given scope/privacy options.
- `src/api/html_site/scope.ts` — given a focus person + N up + M down, returns the set of person IDs in scope (with their relationships, events, places, sources, media transitively).
- `src/api/html_site/redact.ts` — applies the redact-living rule to a person snapshot.
- `src/main/ipc/website-export.ts` — orchestrates: build dist-static (run Vite once at app build time, cache the result), copy to output, write data.json, copy media files + thumbnails, spawn hidden window for report/print prerendering.

### Modified files

- `src/renderer/components/PersonPanel.vue`, `PlacePanel.vue`, `RelationshipPanel.vue`, etc. — accept a `readonly` prop that hides edit/delete/add controls. Default `false`.
- `src/renderer/components/EventList.vue`, `PersonNamesTable.vue`, `ResearchTasksTable.vue`, `GroupsTable.vue`, `EntityMediaSection.vue`, `PersonIdentifiersSection.vue`, `PersonChecksSection.vue` — accept `readonly`, hide controls.
- `src/renderer/components/AppAvatar.vue`, `usePersonProfilePic.ts` — already calls `window.api.media.readAsDataUrl`; static stub returns a URL string instead of a data: URL. Components don't care.
- `src/renderer/components/LinkedText.vue` — already opens links via `shell.openExternal`; static stub returns a no-op + falls back to `window.open`. Trivial change.
- `src/renderer/views/WebsiteExportView.vue` — replaced with the export dialog described above.
- `src/api/html_site/templates.ts`, `style.ts`, `generator.ts` — deleted. Old static export goes away.
- `forge.config.ts` — add `dist-static/` to extraResources so the bundle ships with the packaged app.
- `package.json` — adds `npm run build:static` (invokes `vite build --config vite.static.config.ts`) and `npm run dev:static` (invokes `vite --config vite.static.config.ts` against a dev fixture `data.json` for local iteration). The static bundle is built during `npm run package` / `make` and shipped under `extraResources/dist-static/`. At export time the IPC handler copies the shipped bundle to the user's chosen folder, then writes `data.json` and media on top — no Vite invocation at runtime.

### Tests

- `tests/unit/snapshot.test.ts` — given a fixture DB + scope, snapshot matches the expected JSON shape.
- `tests/unit/scope.test.ts` — focus-person + N up + M down returns the right transitive set.
- `tests/unit/redact.test.ts` — living-person redaction strips events/sources/media, decade-floors birth.
- `tests/unit/staticApi.test.ts` — stub answers the same questions as the real api/ for a fixture snapshot.
- `tests/e2e/website-export.test.ts` — full export flow: pick folder, export, open `dist/index.html` in Playwright, verify nav, search, person detail, theme switch all work.

## Risks & open considerations

| Risk | Mitigation |
|---|---|
| Static bundle drift from app — readonly props get added to a new component but not propagated. | All readonly props default `false`; e2e snapshot of the static site catches missing controls hiding. |
| Reports rely on layout passes (Leaflet maps, font measurements). Hidden-window prerender may capture partial state. | Use `wait_for_layout_settle` pattern — wait 1.5s after `did-finish-load`, also wait for any pending `requestIdleCallback`. Reuses `chart-export` patterns. |
| Bundle size — including all chart components, leaflet, lunr, both locales. | Estimated ~600 KB gzipped. Acceptable for a one-shot download. Lazy-load reports if size becomes an issue. |
| `:id` deep links break when scope changes — old export linked `/persons/abc123`, new export drops that person. | Static SPA shows a "Person not found" page with a link back to the people list. |
| User confusion about "Focus person" vs "Researcher" vs "default_person_id". | Export dialog explicitly labels: "Focus person — used for both data scope and report subject. Pre-filled from your default person setting." |
| Living-person scope: a parent of focus person is alive; redacting their birth date hides the focus person's parentage line. | Acceptable — that's exactly the privacy the user is opting into. Document in the export dialog tooltip. |
| Site needs JavaScript to view. | Documented as a tradeoff. Users who need a no-JS family tree are not the target. |

## Out of scope

- Server-side rendering (SSR). Pre-rendered HTML is reserved for reports/prints only.
- Multi-page outputs that aren't keepsake reports. The site is a SPA; one HTML entry point.
- Embed/iframe widgets for use in another site. Visitors load the export as a whole.
- Editing in any form. The static site has zero write paths.
- Search across multiple databases. One export = one database snapshot.

## Versioning

This is a v0.146.0 minor bump (new feature, removes old generator). The old `src/api/html_site/` is deleted in the same change — no compatibility shim, no migration. Users running the new build get the new export.
