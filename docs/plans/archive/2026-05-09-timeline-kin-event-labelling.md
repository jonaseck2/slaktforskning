# Plan: Timeline kin-event labelling — relational prefix, partner names, age column, foster filter

**Date:** 2026-05-09
**Status:** done
**Source:** Beta tester reports 86, 87, 89, 91, 93#2 (May 7 batch)
**Effort:** M

## User goal

When a genealogist views a person's timeline, every entry tells them — at a glance, without leaning on context — *whose* event it is, *what* relationship it represents, and *how old the focal person was when it happened*. The plain word "Birth" never appears for someone else's birth. "Death" never appears for someone else's death. The marriage row says who the partner was, not where the ceremony was. A foster child's biological birth — an event the focal person had no part in — does not surface on the focal person's timeline at all; the foster placement event surfaces in its place when it has a date. The age of the focal person sits in a fixed visual column to the right of the spine, present for every event, never confusable with anyone else's age.

The reader's mental model when scanning the timeline is "this happened to me, and these things happened around me." Today the timeline labels obey the event's own name (`Birth`, `Death`, `Marriage`) regardless of relationship, which forces the reader to translate at every kin row. After this plan, the label carries the relationship.

## Scope

Every surface that renders a person's chronological event list:

- `src/renderer/components/PersonTimeline.vue` — primary surface (panel + list-tab section)
- `src/renderer/components/reports/ALifeReport.vue` — life-narrative print report shares the same labelling problem
- `src/renderer/components/reports/LifeOnOnePageReport.vue` — same
- `src/renderer/components/reports/YourAncestorsReport.vue` — uses kin event lines; same fix needed
- The composable that composes timeline rows from `events`, `event_participants`, `relationships` (likely `useTimelineEvents` or inline in `PersonTimeline.vue`) — this is the single place where the relational prefix is computed

**Scope deviations:**
- `MediaTimeline.vue`, `PlaceTimeline.vue` — host entity is not a person; no kin relation exists. Out of scope.
- `AMarriageReport.vue`, `PlaceChronicleReport.vue` — kin labelling does not apply (couple-centric and place-centric narratives have their own labelling rules).
- The `events` table itself — **no schema changes**. Labels are computed at render time from authored data (relationship type + subtype + sex of related person + dates). Persisting a relational label would be a Prime Directive violation.

## Behaviour spec

### Labelling rules (Swedish primary, English mirrored in `en.ts`)

For every event row on a person's timeline, the label is determined by the role the focal person plays:

| Role of focal person on this event | Label format (sv) | Example (sv) |
|---|---|---|
| Self (`event_participants.role = 'primary'` and person matches focal) | `<event-type>` | `Födelse` |
| Parent of an event-primary child | `<sex-of-child>s födelse` / `<sex-of-child>s död` | `Sons födelse`, `Dotters död` |
| Child of an event-primary parent | `Förälders <event-type>` | `Förälders död` |
| Partner on a couple event (marriage, divorce, wedding) | `<event-type> — <partner-display-name>` | `Vigsel — Anna Andersson` |
| Partner on death of a partner | `Partners död — <partner-display-name>` | `Partners död — Anna Andersson` |
| Sibling, godparent, witness, other | `<role-label>: <event-type> — <other-person-display-name>` | `Fadder: Dop — Lisa Persson` |

Place is still shown for self events and for kin events where `event_type` is location-defining (e.g. address change). For couple events the partner replaces the place in the *primary* line; place can move to a secondary subdued line if present.

`<sex-of-child>` resolves via `i18n` keys keyed on `persons.sex` ∈ {`M`, `F`, `U`} → `Son`, `Dotter`, `Barn`. Same shape for partner sex when relevant.

### Foster relation filter

A timeline row sourced from a child's `birth` event participates in the focal person's timeline only if the relationship between focal and child is `parent_child` with subtype `biological` or `adopted`. Subtype `foster` and `step` do **not** add the child's birth to the foster/step parent's timeline. Instead, when the `parent_child` row's *placement event* (the event with `event_type = 'foster_placement'` linked to the relationship, if any) has a date, that event appears on the focal person's timeline labelled `Fosterbarn välkommnas — <child-display-name>` (sv) / `Foster child welcomed — <child-display-name>` (en).

Symmetric rule: a foster parent's death does not appear on the foster child's timeline as `Förälders död`; it appears as `Fosterförälders död — <name>` if a quality-graded relationship subtype indicates fosterhood, or is filtered if the foster relationship had no overlap with the date.

### Age column

Today: age is rendered inline as `(7)` after the place, only for self events. Proposal: render age in a dedicated visual column immediately to the right of the timeline spine, present for **every** dated event regardless of role. Negative ages (event before focal birth) display as `−1` etc.

Layout: the timeline becomes a 4-column grid — `date | spine+dot | age | content`. Age column is right-aligned, fixed width (`min-width: 3ch`), uses `--text-secondary`. Empty cell when the event is undated. Reports follow suit (printed table form).

### Date warnings (light coupling to plan `date-before-birth-quality-check`)

If a kin event's date precedes the focal person's birth (e.g. a sibling born before the focal person was born — fine, but a *self* name event before *self* birth is a data error), no behaviour change in *this* plan; that case is handled by the quality plan.

## Tasks

### Phase 1 — Composable for relational labelling

- [ ] Extract `composeTimelineLabel(event, role, focalPerson, relatedPerson, t)` in `src/renderer/utils/timelineLabel.ts` — pure function, takes the event, the role the focal person played, optionally the "other" person (child / parent / partner), and `t` from `useI18n`. Returns `{ primary: string, secondary?: string }`.
- [ ] Unit tests in `tests/unit/timelineLabel.test.ts` — every row of the table above, both languages.

### Phase 2 — Wire into PersonTimeline.vue

- [ ] Replace the existing `event-badge` + `timeline-family-name` + `timeline-relationship` triplet with a single label slot rendered from `composeTimelineLabel`. Keep ARIA labels as full sentences for screen-reader mode.
- [ ] Add the age column (4-column grid). Handle undated rows gracefully.
- [ ] Foster filter: when assembling rows, drop kin `birth` rows where the linking `parent_child` relationship has subtype `foster` or `step`. Replace with a `foster_placement` row when present and dated.

### Phase 3 — i18n keys

- [ ] Add `timelineLabels.parentBirth`, `timelineLabels.parentDeath`, `timelineLabels.sonBirth`, `timelineLabels.daughterBirth`, `timelineLabels.childBirth`, `timelineLabels.partnerDeath`, `timelineLabels.fosterChildWelcomed`, etc. to both `sv.ts` and `en.ts`.
- [ ] Couple-event format: `timelineLabels.coupleEvent` — `'{type} — {partner}'`. The `{type}` resolves via `eventTypes.<type>`, `{partner}` is a `formatFullName` of the partner.

### Phase 4 — Report parity

- [ ] `ALifeReport.vue`: replace inline label composition with `composeTimelineLabel`. Keep the prose flow.
- [ ] `LifeOnOnePageReport.vue`: same.
- [ ] `YourAncestorsReport.vue`: kin event lines use `composeTimelineLabel`.

### Phase 5 — i18n register check (Bengt's terse Swedish)

- [ ] Swedish phrasing reviewed against `narration` register: short, no fluff. `"Sons födelse"` not `"Födelse av son"`.

## Verification

The user goal is "every kin event reads as a relationship at a glance, never as a bare event type."

1. **User-observable smoke test (mandatory).** Open the running app on a person who has: a child, a foster child, a deceased parent, a deceased partner, a divorce. Walk the timeline. Read each row aloud. Every kin row reads as a relationship; the foster child's biological birth is absent; the foster placement event is present (if dated). Marriage row shows partner. Age column is present and correct on every dated row, including kin rows.
2. **Vitest unit tests** on `composeTimelineLabel` cover every row of the spec table.
3. **Component test** on `PersonTimeline.vue` with a fixture covering all kin types asserts the rendered labels.
4. **Reports smoke test:** run `ALifeReport` and `LifeOnOnePageReport` for the same person; check the kin sentences read with the relational prefix.

Lint + typecheck + vitest passing alone do **not** verify the user goal — must include the manual walk-through.

## Failure modes / RCA reference

This plan extends the labelling improvement begun in [2026-05-04-person-relations-ordering-design.md](archive/2026-05-04-person-relations-ordering-design.md) (which fixed *ordering* but kept the bare-event-type *labels*). The composable extraction is a deliberate consolidation so the same labelling rules can be reused by the reports (which currently inline their own translations and drift over time).

Foster-relation subtype handling has shipped twice as half-fixes (`parent_child` subtypes were added but consumers still treated all subtypes equivalently in display). Per `panel-cta-conventions.test.ts` and the surface contract in `CLAUDE.md`, derived views must reflect the relationship type, not the raw event type. This plan codifies that for the timeline surface.

## Notes for the implementer

- The composable is the seam. Don't put the labelling logic in `PersonTimeline.vue` — three other surfaces need it.
- `formatFullName` from `nameUtils.ts` is the canonical name renderer for the partner/child/parent name. Never roll your own.
- ARIA: `aria-label` for screen-reader mode must be a full sentence — `"Sons födelse, datum 1972, plats Stockholm"` — not the short visual label. Use `narrate` directive composer.
- The age column should be excluded from screen-reader mode's row narration to avoid redundancy (the age is in the date math the screen reader already speaks).
