/**
 * Panel descriptors — Tasks 2 (pilot) + 3 (fan-out) of the e2e-expansion plan.
 *
 * Task 2 piloted two panels with the most historical Surface Contract bugs
 * (PersonPanel + PlacePanel — `+ Add person` orphan, `+ Event` lying handler,
 * Persons-section derived-view confusion). Task 3 fans the same descriptors
 * out to every remaining right-side panel: Source, Group, ResearchTask, Media,
 * Report, Website. ExportOptionsPanel is intentionally excluded — its leading
 * HTML comment documents it as NOT a right-side panel (embedded options card,
 * not migrated to EntityPanel). Section titles + CTA labels verified against
 * the running binary in `en` locale on 2026-05-14.
 *
 * Each section declares a `kind` that tells the runner what flavour of CTA
 * it has and how to exercise the four Surface Contract checks.
 *
 *  - `none`             — no CTA (read-only / derived view / details-only).
 *                         Only the lifecycle-parity check fires (verifies the
 *                         section renders).
 *  - `modal-with-host`  — clicking the CTA opens a `[role=dialog]` whose title
 *                         contains the host entity's name (e.g. "Birth of
 *                         Test Person"). Save creates a row.
 *  - `modal-anonymous`  — clicking the CTA opens a dialog whose title does not
 *                         show the host name (e.g. PlacePanel's Tasks opens
 *                         ResearchTaskModal titled "New task"). Host context
 *                         is verified behaviourally: after save, the count goes
 *                         +1 (which can only happen if the host id flowed in).
 *  - `picker`           — clicking the CTA reveals an inline picker (combobox)
 *                         inside the panel. Host context is implicit (picker is
 *                         scoped to host).
 *  - `media-attach`     — opens an inline media picker inside the panel.
 *                         Round-tripping a real attach requires a file fixture;
 *                         the `fulfills-label` check is skipped.
 *  - `relations-empty`  — Relations section delegates Add to the panel-add-
 *                         relative shortcut buttons in the panel header. No
 *                         in-section CTA; lifecycle parity = section renders.
 *
 * The `seed` step seeds the host plus one extra row per section that
 * participates in lifecycle-parity (e.g. one event so Events / Timeline / Life
 * map / People all have a row to inspect).
 *
 * Selectors verified against the running binary on 2026-05-13.
 */

import type { AppDriver } from '../fixture';
import { mutateViaMcp } from '../helpers/mutate-via-mcp';

export type SectionKind =
  | 'none'
  | 'modal-with-host'
  | 'modal-with-host-no-count-bump'
  | 'modal-anonymous'
  | 'picker'
  | 'media-attach'
  | 'relations-empty';

export interface PanelSection {
  /** Visible section title (English, as rendered by SectionHeader). */
  title: string;
  /** Visible CTA button label, e.g. `+ Event`. `null` for sections without a CTA. */
  ctaLabel: string | null;
  /** Determines how the runner exercises this section. */
  kind: SectionKind;
  /**
   * If set, skip check 3 (lifecycle parity: rows offer edit + delete/unlink
   * affordances). Use for sections that LEGITIMATELY don't have row-shaped
   * lifecycle affordances:
   *
   *   - **Derived views** (e.g. PersonPanel.Timeline, PlacePanel.Timeline):
   *     show the same primitive as a canonical sibling section but in a
   *     different layout. The lifecycle (edit + delete) lives on the
   *     canonical section, not on every alternate rendering of the same
   *     data. CTA-label / host-flows-in / no-degradation checks still fire
   *     because the CTA itself is legitimate (it creates a real primitive).
   *
   *   - **Non-row UI** (e.g. PersonPanel.Life map): renders the primitive
   *     as map markers / cards / graphs instead of rows. Per-row edit/delete
   *     affordances aren't applicable; lifecycle lives on the canonical row
   *     section.
   *
   * Every use of this flag MUST cite the canonical sibling section that
   * owns the primitive's lifecycle, so reviewers can verify the lifecycle
   * is actually covered somewhere.
   */
  skipLifecycleParity?: { canonicalOwner: string; reason: string };
}

export interface PanelDescriptor {
  /** Display name in test output. */
  name:
    | 'PersonPanel'
    | 'PlacePanel'
    | 'SourcePanel'
    | 'GroupPanel'
    | 'ResearchTaskPanel'
    | 'MediaPanel'
    | 'ReportPanel'
    | 'WebsitePanel';
  /**
   * Seed the host entity + one row per add-shaped section. Returns the host id.
   * For host-less panels (Report / Website — configuration forms) return any
   * stable placeholder; the runner won't pass it to a route helper.
   */
  seed: (driver: AppDriver) => Promise<string>;
  /**
   * Build the panel route from the seeded host id. For MediaPanel — which has
   * no /media/:id route — return `/media` and pair with `selectAfterNavigate`.
   */
  route: (id: string) => string;
  /**
   * Optional hook fired after the runner navigates to `route(id)`. Used for
   * MediaPanel: clicks the row matching the seeded host so the panel mounts
   * with the right selection. Receives a driver-like proxy that can run JS
   * inside the renderer.
   */
  selectAfterNavigate?: (driver: AppDriver, id: string) => Promise<void>;
  /**
   * What the host name reads as in-DOM (used for host-flows-in assertions).
   * Empty string for host-less config panels (Report / Website) — the runner
   * skips the host-name assertion when this is empty.
   */
  hostName: string;
  /** Sections to verify, in display order. */
  sections: PanelSection[];
  /** True if the panel must offer a Danger-zone delete affordance. */
  hostDeletable: boolean;
}

export const PANELS: PanelDescriptor[] = [
  {
    name: 'PersonPanel',
    hostName: 'Test Person',
    seed: async (driver) => {
      const p = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'Test',
        surname: 'Person',
        sex: 'U',
      });
      // Pre-seed an event WITH place_id so Events / Timeline / Life-map all
      // have a lifecycle-parity row. Life-map's count badge specifically
      // tracks events-with-place-id, not bare events — so the place_id is
      // load-bearing here.
      const place = await mutateViaMcp<{ id: string }>(driver, 'places.create', {
        name: 'Seeded place for PersonPanel',
        place_type: 'city',
      });
      const ev = await mutateViaMcp<{ id: string }>(driver, 'events.create', {
        event_type: 'birth',
        date_original: 'SEEDED-EVENT-DATE',
        place_id: place.id,
      });
      await mutateViaMcp(driver, 'eventParticipants.add', {
        event_id: ev.id,
        person_id: p.id,
        role: 'primary',
      });
      // Pre-seed a group + link so Groups section has a lifecycle-parity row.
      const group = await mutateViaMcp<{ id: string }>(driver, 'groups.create', {
        name: 'Seeded group',
      });
      await mutateViaMcp(driver, 'groups.addLink', group.id, 'person', p.id);
      // Pre-seed a research task + link so Tasks section has a row.
      const task = await mutateViaMcp<{ id: string }>(driver, 'researchTasks.create', {
        task: 'Seeded research task',
      });
      await mutateViaMcp(driver, 'researchTasks.addLink', task.id, 'person', p.id);
      return p.id;
    },
    route: (id) => `/persons/${id}`,
    sections: [
      // "Person" details section is always visible but has no CTA.
      { title: 'Person', ctaLabel: null, kind: 'none' },
      { title: 'Names', ctaLabel: '+ Name', kind: 'modal-with-host' },
      // Identifiers is `v-show`-hidden until count > 0 — skip in the pilot.
      // (TODO Task 3: pre-seed an identifier so this section exposes itself.)
      { title: 'Events', ctaLabel: '+ Event', kind: 'modal-with-host' },
      // Timeline is a derived view of the Events section's data — same
      // primitive, alternate layout (vertical chronological timeline of
      // `.timeline-entry` divs, not rows). The CTA still creates a real
      // event, so checks 1/2/4 fire; lifecycle is covered by Events.
      {
        title: 'Timeline',
        ctaLabel: '+ Event',
        kind: 'modal-with-host',
        skipLifecycleParity: {
          canonicalOwner: 'Events',
          reason: 'derived view of events as `.timeline-entry` divs; edit/delete lifecycle lives on the Events section',
        },
      },
      // Life map renders events as leaflet markers — no row UI at all.
      // Count badge tracks events-with-place-id (so check 2 also skips
      // because a bare event is invisible to the count). The CTA truthfully
      // adds an event; lifecycle lives on Events.
      {
        title: 'Life map',
        ctaLabel: '+ Event',
        kind: 'modal-with-host-no-count-bump',
        skipLifecycleParity: {
          canonicalOwner: 'Events',
          reason: 'leaflet map widget; events render as markers, not rows; lifecycle lives on Events',
        },
      },
      { title: 'Relationships', ctaLabel: null, kind: 'relations-empty' },
      { title: 'Media', ctaLabel: '+ Media', kind: 'media-attach' },
      // Media Timeline has no CTA (canonical Add lives on the Media section above).
      { title: 'Media Timeline', ctaLabel: null, kind: 'none' },
      { title: 'Groups', ctaLabel: '+ Group', kind: 'picker' },
      { title: 'Tasks', ctaLabel: '+ Task', kind: 'picker' },
      // Quality is read-only.
      { title: 'Quality', ctaLabel: null, kind: 'none' },
    ],
    hostDeletable: true,
  },

  {
    name: 'SourcePanel',
    hostName: 'Test Source',
    seed: async (driver) => {
      const s = await mutateViaMcp<{ id: string }>(driver, 'sources.create', {
        title: 'Test Source',
      });
      // Pre-seed one citation so the Citations section has a row for
      // lifecycle-parity (edit + delete affordance check).
      const person = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'Cited',
        surname: 'Person',
        sex: 'U',
      });
      await mutateViaMcp(driver, 'citations.create', {
        source_id: s.id,
        person_id: person.id,
        confidence: 3, // numeric (0..3), see CONFIDENCE_LEVEL_VALUES
      });
      return s.id;
    },
    route: (id) => `/sources/${id}`,
    sections: [
      { title: 'Source Details', ctaLabel: null, kind: 'none' },
      // CitationModal title is `citations.addTitle` (no host name) — but the
      // sourceId flows in via prop, verified behaviourally by count++.
      { title: 'Citations', ctaLabel: '+ Citation', kind: 'modal-anonymous' },
      { title: 'Media', ctaLabel: '+ Media', kind: 'media-attach' },
      { title: 'Quality', ctaLabel: null, kind: 'none' },
    ],
    hostDeletable: true,
  },

  {
    name: 'GroupPanel',
    hostName: 'Test Group',
    seed: async (driver) => {
      const g = await mutateViaMcp<{ id: string }>(driver, 'groups.create', {
        name: 'Test Group',
      });
      // Pre-seed person + place + media + links so all three GroupPanel
      // link sections (People / Places / Media) have a lifecycle-parity row.
      const person = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'Group',
        surname: 'Member',
        sex: 'U',
      });
      const place = await mutateViaMcp<{ id: string }>(driver, 'places.create', {
        name: 'Seeded place for GroupPanel',
        place_type: 'city',
      });
      const media = await mutateViaMcp<{ id: string }>(driver, 'media.create', {
        title: 'Seeded media for GroupPanel',
      });
      // groups:addLink takes positional args: (groupId, entityType, entityId).
      await mutateViaMcp(driver, 'groups.addLink', g.id, 'person', person.id);
      await mutateViaMcp(driver, 'groups.addLink', g.id, 'place', place.id);
      await mutateViaMcp(driver, 'groups.addLink', g.id, 'media', media.id);
      return g.id;
    },
    route: (id) => `/groups/${id}`,
    sections: [
      // "Groups" header is the group-info section title — counterintuitive,
      // but it's the host details (`groups.title` = 'Groups' in en).
      { title: 'Groups', ctaLabel: null, kind: 'none' },
      // All three link sections share the same `+ Add` label (LinkedXSection
      // pattern). Each opens an inline picker scoped to the host group.
      { title: 'People', ctaLabel: '+ Add', kind: 'picker' },
      { title: 'Places', ctaLabel: '+ Add', kind: 'picker' },
      { title: 'Media', ctaLabel: '+ Add', kind: 'picker' },
    ],
    hostDeletable: true,
  },

  {
    name: 'ResearchTaskPanel',
    hostName: 'Test research task',
    seed: async (driver) => {
      const t = await mutateViaMcp<{ id: string }>(driver, 'researchTasks.create', {
        task: 'Test research task',
      });
      // Pre-seed person + place + media + links so all three ResearchTaskPanel
      // link sections (People / Places / Media) have a lifecycle-parity row.
      const person = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'Task',
        surname: 'Subject',
        sex: 'U',
      });
      const place = await mutateViaMcp<{ id: string }>(driver, 'places.create', {
        name: 'Seeded place for ResearchTaskPanel',
        place_type: 'city',
      });
      const media = await mutateViaMcp<{ id: string }>(driver, 'media.create', {
        title: 'Seeded media for ResearchTaskPanel',
      });
      // researchTasks:addLink takes positional args: (taskId, entityType, entityId).
      await mutateViaMcp(driver, 'researchTasks.addLink', t.id, 'person', person.id);
      await mutateViaMcp(driver, 'researchTasks.addLink', t.id, 'place', place.id);
      await mutateViaMcp(driver, 'researchTasks.addLink', t.id, 'media', media.id);
      return t.id;
    },
    route: (id) => `/research-tasks/${id}`,
    sections: [
      // 'Task' is the task-detail section title (researchTasks.task = 'Task').
      { title: 'Task', ctaLabel: null, kind: 'none' },
      { title: 'People', ctaLabel: '+ Add', kind: 'picker' },
      { title: 'Places', ctaLabel: '+ Add', kind: 'picker' },
      { title: 'Media', ctaLabel: '+ Add', kind: 'picker' },
    ],
    hostDeletable: true,
  },

  {
    name: 'MediaPanel',
    // MediaPanel renders the title inside an editable input, not a static
    // .panel-name span. Host-flows-in check still works because the inline
    // pickers are scoped to the host media id (verified behaviourally), but
    // we leave hostName empty to skip the dialog-title assertion.
    hostName: '',
    seed: async (driver) => {
      const m = await mutateViaMcp<{ id: string }>(driver, 'media.create', {
        // file_ref is optional; tests don't need a real file because none of
        // the descriptor's CTAs are `media-attach`. Skipping the file fixture
        // keeps the seed minimal.
        title: 'Test Media',
      });
      // Pre-seed linked person + place so Linked Persons + Linked Places
      // both have a lifecycle-parity row.
      const person = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'Media',
        surname: 'Subject',
        sex: 'U',
      });
      const place = await mutateViaMcp<{ id: string }>(driver, 'places.create', {
        name: 'Seeded place for MediaPanel',
        place_type: 'city',
      });
      await mutateViaMcp(driver, 'media.addLink', {
        media_id: m.id,
        entity_type: 'person',
        entity_id: person.id,
      });
      await mutateViaMcp(driver, 'media.addLink', {
        media_id: m.id,
        entity_type: 'place',
        entity_id: place.id,
      });
      return m.id;
    },
    // /media/:id doesn't exist — MediaView uses stateful selection.
    // selectAfterNavigate (below) clicks the matching list row to mount the panel.
    route: () => '/media',
    selectAfterNavigate: async (driver, id) => {
      await driver.executeJs(`
        (async () => {
          await new Promise(r => setTimeout(r, 500));
          // The MediaView card/row has a clickable element that, when clicked,
          // sets selectedMediaId. Find by title (we seeded with 'Test Media').
          const candidates = [...document.querySelectorAll('.media-card, .clickable-row')];
          const card = candidates.find(el => el.textContent?.includes('Test Media'));
          if (card) {
            card.click();
            await new Promise(r => setTimeout(r, 400));
          }
        })()
      `);
    },
    sections: [
      { title: 'Caption', ctaLabel: null, kind: 'none' },
      // `+ Person` and `+ Place` open inline picker-wrap pickers scoped to
      // this media. The picker-wrap selector is recognised by the spec's
      // hasInlinePicker helper.
      { title: 'Linked Persons', ctaLabel: '+ Person', kind: 'picker' },
      // Face Tags `+ Draw` toggles draw mode on the viewer — it's not a CTA
      // that creates a primitive on click in the panel. Tagged as `none` to
      // skip the modal/picker checks; section-renders still fires.
      // TODO: face-tag draw-mode is a unique surface that warrants its own
      // SectionKind and a viewer-roundtrip test. Out of scope for Task 3.
      { title: 'Face Tags', ctaLabel: null, kind: 'none' },
      { title: 'Linked Places', ctaLabel: '+ Place', kind: 'picker' },
      // Linked Events has no CTA in the panel — events link via the event
      // modal's media attachment. No label-lie risk.
      { title: 'Linked Events', ctaLabel: null, kind: 'none' },
      { title: 'Quality', ctaLabel: null, kind: 'none' },
    ],
    hostDeletable: true,
  },

  {
    name: 'ReportPanel',
    // Config form, no host entity, no danger zone — `hostName: ''` opts the
    // spec out of host-name and Danger-zone assertions.
    hostName: '',
    seed: async () => 'report',
    route: () => '/reports',
    sections: [
      // Default report tab is 'alife' → subjectSectionTitle = 'Person'.
      { title: 'Person', ctaLabel: null, kind: 'none' },
      { title: 'Header & footer', ctaLabel: null, kind: 'none' },
      { title: 'Options', ctaLabel: null, kind: 'none' },
    ],
    hostDeletable: false,
  },

  {
    name: 'WebsitePanel',
    hostName: '',
    seed: async () => 'website',
    route: () => '/website',
    sections: [
      { title: 'Focus person', ctaLabel: null, kind: 'none' },
      { title: 'Data scope', ctaLabel: null, kind: 'none' },
      { title: 'Privacy', ctaLabel: null, kind: 'none' },
      { title: 'Include', ctaLabel: null, kind: 'none' },
      { title: 'Site', ctaLabel: null, kind: 'none' },
    ],
    hostDeletable: false,
  },

  {
    name: 'PlacePanel',
    hostName: 'Testplace',
    seed: async (driver) => {
      const place = await mutateViaMcp<{ id: string }>(driver, 'places.create', {
        name: 'Testplace',
        place_type: 'city',
      });
      // Pre-seed one event AT this place so Events / Timeline / People all
      // have a lifecycle-parity row.
      const person = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'Place',
        surname: 'Subject',
        sex: 'U',
      });
      const ev = await mutateViaMcp<{ id: string }>(driver, 'events.create', {
        event_type: 'birth',
        date_original: 'SEEDED-PLACE-EVENT',
        place_id: place.id,
      });
      await mutateViaMcp(driver, 'eventParticipants.add', {
        event_id: ev.id,
        person_id: person.id,
        role: 'primary',
      });
      // Pre-seed a research task linked to the place so Tasks section has a
      // lifecycle-parity row.
      const task = await mutateViaMcp<{ id: string }>(driver, 'researchTasks.create', {
        task: 'Seeded research task for PlacePanel',
      });
      await mutateViaMcp(driver, 'researchTasks.addLink', task.id, 'place', place.id);
      return place.id;
    },
    route: (id) => `/places/${id}`,
    sections: [
      { title: 'Place Details', ctaLabel: null, kind: 'none' },
      // Place's Events / Timeline open EventModal titled "New Event" — no host
      // name in the title. The placeId still flows in via prop, so the saved
      // event lands at this place; verified behaviourally by check 2 (count++).
      { title: 'Events', ctaLabel: '+ Event', kind: 'modal-anonymous' },
      // PlaceTimeline is a derived view of events-at-this-place — same
      // primitive as Events section, alternate layout (`.timeline-entry`
      // divs). Lifecycle lives on Events.
      {
        title: 'Timeline',
        ctaLabel: '+ Event',
        kind: 'modal-anonymous',
        skipLifecycleParity: {
          canonicalOwner: 'Events',
          reason: 'derived view of events-at-this-place as `.timeline-entry` divs; lifecycle lives on Events',
        },
      },
      // People = derived view from event participants. No CTA — Surface
      // Contract check #2 says CTA-less derived sections are correct (no
      // label-lie risk). The seed event above provides the parity row.
      { title: 'People', ctaLabel: null, kind: 'none' },
      { title: 'Media', ctaLabel: '+ Media', kind: 'media-attach' },
      { title: 'Media Timeline', ctaLabel: null, kind: 'none' },
      // Tasks opens ResearchTaskModal titled "New task" — host name is NOT in
      // the modal title, but the placeId flows in as a prop, so the saved task
      // is linked. fulfills-label proves linking via post-save count++.
      { title: 'Tasks', ctaLabel: '+ Task', kind: 'modal-anonymous' },
      { title: 'Quality', ctaLabel: null, kind: 'none' },
    ],
    hostDeletable: true,
  },
];
