/**
 * Pilot panel descriptors — Task 2 of the e2e-expansion plan.
 *
 * Two panels (PersonPanel + PlacePanel) — the two with the most historical
 * Surface Contract bugs (`+ Add person` orphan, `+ Event` lying handler,
 * Persons-section derived-view confusion). Validates the data-driven shape
 * before fan-out in Task 3.
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
}

export interface PanelDescriptor {
  /** Display name in test output. */
  name: 'PersonPanel' | 'PlacePanel';
  /** Seed the host entity + one row per add-shaped section. Returns the host id. */
  seed: (driver: AppDriver) => Promise<string>;
  /** Build the panel route from the seeded host id. */
  route: (id: string) => string;
  /** What the host name reads as in-DOM (used for host-flows-in assertions). */
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
      // Pre-seed one event so Events / Timeline / Life-map all have a row.
      const ev = await mutateViaMcp<{ id: string }>(driver, 'events.create', {
        event_type: 'birth',
        date_original: 'SEEDED-EVENT-DATE',
      });
      await mutateViaMcp(driver, 'eventParticipants.add', {
        event_id: ev.id,
        person_id: p.id,
        role: 'primary',
      });
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
      { title: 'Timeline', ctaLabel: '+ Event', kind: 'modal-with-host' },
      // Life map's count badge tracks events-with-place-id, not just events.
      // The CTA truthfully adds an event, but a bare event (no place_id) is
      // invisible to the count. Treat as modal-with-host but skip check 2.
      // (Alternative would be a separate kind; this keeps the descriptor lean.)
      { title: 'Life map', ctaLabel: '+ Event', kind: 'modal-with-host-no-count-bump' },
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
      return place.id;
    },
    route: (id) => `/places/${id}`,
    sections: [
      { title: 'Place Details', ctaLabel: null, kind: 'none' },
      // Place's Events / Timeline open EventModal titled "New Event" — no host
      // name in the title. The placeId still flows in via prop, so the saved
      // event lands at this place; verified behaviourally by check 2 (count++).
      { title: 'Events', ctaLabel: '+ Event', kind: 'modal-anonymous' },
      { title: 'Timeline', ctaLabel: '+ Event', kind: 'modal-anonymous' },
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
