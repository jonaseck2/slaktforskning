# Plan: Visualisation as primary working view

## Goal

Make the visualisation tree the primary workspace. Clicking any person in the chart
opens a collapsible detail panel on the right — no view switching required.

---

## Current state

- `/` → PersonsView (list)
- `/visualisering/:personId` → VisualizationView (full-screen chart)
- Chart clicks currently emit `@navigate` → full route navigation to a new focal person
- Person details only available at `/persons/:id` (separate page)

---

## Desired state

- `/visualisering` is the primary working view (accessible from the top of the sidebar)
- Clicking any person in the chart opens their details in a right-side panel
- The panel is collapsible (toggle button; chart expands to fill the space when closed)
- Clicking a person in the panel (e.g. a related person link) can re-focus the chart
- PersonsView, RelationshipsView etc. remain as secondary views

---

## Design decisions

| Decision | Choice |
|----------|--------|
| Click in chart | Select person → show in panel; does NOT re-focus chart |
| Re-focus chart | "Visa i träd" (Show in tree) button in panel header, or click focal-person name in header |
| Panel width | 360px fixed, slides in from right |
| Panel collapse | Toggle button on left edge of panel; chart area expands/contracts |
| Panel sections | Collapsible: Händelser (Events), Relationer (Relationships), Anteckningar (Notes) |
| Edit in panel | Read-only summary + "Öppna" link to PersonDetailView for full editing |
| Empty panel state | "Klicka på en person i trädet" prompt |
| Primary route | Redirect `/` → `/visualisering` when a focal person was previously used; otherwise PersonsView stays as fallback |

---

## Components

### New: `PersonPanel.vue`
`src/renderer/components/PersonPanel.vue`

Props: `personId: string | null`

Sections (each collapsible with chevron toggle):
- **Header**: Full name, birth–death years, sex color bar; "Visa i träd" button; "Öppna →" link to `/persons/:id`
- **Händelser**: EventList (read-only, same data as PersonDetailView)
- **Relationer**: list of relationships with linked names (clicking re-focuses chart)
- **Anteckningar**: person notes field (read-only with "Öppna" to edit)

State: per-section open/closed stored in `localStorage` as `panel-section-{name}`.

### Modified: `VisualizationView.vue`

- Add `selectedPersonId: string | null` ref
- Replace `@navigate="navigateTo"` on all three charts with `@select="selectPerson"` (see below)
- Layout: flex row — `<div class="viz-main">` (chart) + `<PersonPanel>` (panel)
- Panel toggle button: a `<button class="panel-toggle">` on the left edge of the panel
- Panel open/closed state persisted in `localStorage` as `viz-panel-open`
- Keep existing "re-focus" logic: "Visa i träd" in panel header calls `navigateTo(personId)` which changes the focal person

### Modified: chart components

All three chart components (`PedigreeChart`, `HourglassChart`, `TimelineChart`) currently
emit `navigate`. Add a `select` emit alongside `navigate`:

- `navigate` (existing): called when the user wants to re-focus the chart (e.g. "Visa i träd" path)
- `select` (new): called on single click — the person clicked should appear in the panel

For now the simplest approach: rename `@navigate` → `@select` in VisualizationView and
keep emitting from the same click handler in each chart. The distinction between
"re-focus chart" and "show in panel" is then handled purely by VisualizationView:
single click → panel only; the panel provides the re-focus button.

---

## Layout sketch

```
┌─────────────────────────────────────────────────────┬─────────────────┐
│  [tabs: Pedigree | Hourglass | Timeline]            │ Anna Stina M.   │
│                                                     │ 1817–1881  [→]  │
│                                                     ├─────────────────┤
│                                                     │ ▼ Händelser     │
│         [chart fills this area]                     │   Födseln 1817  │
│                                                     │   Dödsfall 1881 │
│                                                     ├─────────────────┤
│                                                     │ ▼ Relationer    │
│                                                     │   Peter Joh...  │
│                                                     │   Lena Maja...  │
│                                                  [◀]├─────────────────┤
│                                                     │ ▶ Anteckningar  │
└─────────────────────────────────────────────────────┴─────────────────┘
```

The `[◀]` toggle collapses the panel; becomes `[▶]` when closed.

---

## Sidebar / routing

- Move "Visualisering" to the top of the sidebar nav (it already is — keep it there)
- Change sidebar default: clicking "Visualisering" without a prior focal person → show
  the hourglass tab with an empty state prompting the user to pick a person from Persons
- Optional (v2): persist last-viewed focal person in settings so opening the app
  resumes where you left off

---

## Checklist

- [ ] `PersonPanel.vue` — header + 3 collapsible sections (events, relationships, notes)
- [ ] `VisualizationView.vue` — flex layout with panel slot + toggle + `selectedPersonId`
- [ ] Chart components — add `select` emit; update VisualizationView to use it
- [ ] Panel toggle persisted in localStorage
- [ ] Section open/closed state persisted in localStorage
- [ ] i18n keys: `panel.showInTree`, `panel.open`, `panel.noPersonSelected`
- [ ] Empty panel state when no person is selected
- [ ] "Visa i träd" button re-focuses chart by calling existing `navigateTo`
- [ ] Sidebar: Visualisering link at top (already there), consider making it the `/` default
