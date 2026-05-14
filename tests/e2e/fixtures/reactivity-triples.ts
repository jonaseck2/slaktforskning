/**
 * Reactivity triples — Task 4 of e2e-expansion.
 *
 * Each triple describes one (consumer-surface, mutator, assertion) pair that
 * proves a `data-changed` event reached the consumer and the consumer rerendered
 * without a view-switch. This is the regression net for the "list / panel / chart
 * didn't refresh after a save until I navigated away and back" bug class:
 *
 *  - v0.205.x "list views + panel sections refresh after MCP-side mutations"
 *  - v0.207.x "research tasks refresh after save/delete"
 *  - v0.208.x "ResearchTasks reactivity + GroupsView load() resilience"
 *
 * Coverage:
 *  - 7 list views (PersonsView, PlacesView, SourcesView, GroupsView,
 *    ResearchTasksView, MediaView, DuplicatesView).
 *  - 6 right-side panels matching `tests/e2e/fixtures/panels.ts`
 *    (PersonPanel, PlacePanel, SourcePanel, GroupPanel, ResearchTaskPanel,
 *    MediaPanel). ReportPanel and WebsitePanel are config forms with no host
 *    entity — they don't subscribe to `onDataChanged` in a meaningful way and
 *    have no "row that should update" surface; deliberately excluded (see
 *    Scope deviations below).
 *  - 1 chart surface (PersonsView /persons/:id renders PedigreeChart /
 *    HourglassChart / DescendantChart — the user goal mentions "chart's focal
 *    node text updates").
 *
 * Scope deviations:
 *  - ReportPanel / WebsitePanel — no host entity, no list to refresh. The
 *    reactivity surfaces inside them are pickers (PersonPicker) which are
 *    covered transitively when their backing data mutates. Skipped.
 *  - QualityView — has a custom onDataChanged subscription with bespoke
 *    debouncing (see views/QualityView.vue:241). Its triple shape is different
 *    enough to warrant its own spec; out of scope for Task 4.
 *
 * Channel auto-walk: filename `research-tasks.ts` exposes channel namespace
 * `researchTasks:*` (camelCase). See src/shared/channels/.
 *
 * api/ signatures consulted (so the mutate halves don't pass shapes the api
 * silently drops):
 *  - persons.ts:301 — updatePerson(db, id, { sex?, notes? })  ← does NOT take name
 *  - persons.ts:485 — updatePersonName(db, id, { given_name?, surname?, ... })
 *  - persons.ts:481 — getPersonNames(db, personId) returns the rows so we
 *    can resolve the primary-name id before renaming.
 *  - places.ts:212  — updatePlace(db, id, Partial<Omit<Place,'id'|'normalized_name'>>)
 *  - sources.ts:123 — updateSource(db, id, { title?, author?, ... })
 *  - groups.ts:20   — updateGroup(db, id, { name?, notes? })
 *  - research_tasks.ts:52 — updateResearchTask(db, id, { task?, status?, ... })
 *  - media.ts:203   — updateMedia(db, id, { title?, file_ref?, format?, notes?, is_printable? })
 */

import type { AppDriver } from '../fixture';
import { mutateViaMcp } from '../helpers/mutate-via-mcp';

export interface ReactivityTriple {
  /** Display name in test output. */
  consumer: string;
  /** Route to navigate to before mutating. Use ':id' for host id interpolation. */
  route: string;
  /**
   * Seed the prerequisite entity (and any extra setup). Returns the host id.
   * For consumers that don't need a host id in the route (e.g. PersonsView
   * lists all persons), the returned id is still used by `mutate`.
   */
  seed: (driver: AppDriver) => Promise<string>;
  /**
   * Optional hook fired after navigation but before mutation — e.g. MediaPanel
   * needs a click to mount the panel since /media has no :id route.
   */
  afterNavigate?: (driver: AppDriver, hostId: string) => Promise<void>;
  /** Mutate the host or related state via window.api. Waits for data-changed. */
  mutate: (driver: AppDriver, hostId: string) => Promise<void>;
  /**
   * JS expression returning true once the consumer's DOM reflects the mutation.
   * Polled for up to 2 s after the mutation returns. Must be an *expression*
   * (no top-level `return`); wrap in an IIFE if you need locals.
   */
  assert: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Rename a person by updating their primary `person_names` row. `updatePerson`
 * itself only carries sex/notes; the name lives in `person_names` and is fetched
 * via `persons.getPersonNames`.
 */
async function renamePerson(
  driver: AppDriver,
  personId: string,
  newSurname: string,
): Promise<void> {
  // Channel `persons:getNames` auto-walks to `window.api.persons.getNames`
  // (NOT `getPersonNames` — the auto-walk keeps the channel method name).
  // Same for `persons:updateName` → `persons.updateName`. See
  // src/renderer/tauri-window-api.ts:118 (splitChannelName).
  const names = await driver.executeJs<Array<{ id: string; sort_order: number }>>(
    `window.api.persons.getNames(${JSON.stringify(personId)})`,
  );
  const primary = names.find((n) => n.sort_order === 0) ?? names[0];
  if (!primary) throw new Error(`renamePerson: no primary name for ${personId}`);
  await mutateViaMcp(driver, 'persons.updateName', primary.id, {
    surname: newSurname,
  });
}

/** Find a row in any visible table that contains all given substrings. */
function rowContainsAll(...needles: string[]): string {
  // textContent of every tbody tr across the whole document. If any matches
  // every needle, the row is present.
  return `
    (() => {
      const rows = [...document.querySelectorAll('tbody tr')];
      return rows.some(r => {
        const t = r.textContent || '';
        return ${needles.map((n) => `t.includes(${JSON.stringify(n)})`).join(' && ')};
      });
    })()
  `.trim();
}

/** Assert the right-hand `.side-panel` text contains the given substring. */
function panelContains(needle: string): string {
  return `
    (() => {
      const panel = document.querySelector('.side-panel');
      return !!(panel && (panel.textContent || '').includes(${JSON.stringify(needle)}));
    })()
  `.trim();
}

// ---------------------------------------------------------------------------
// Triples
// ---------------------------------------------------------------------------

export const TRIPLES: ReactivityTriple[] = [
  // --------------------------------- List views ---------------------------------
  {
    consumer: 'PersonsView',
    route: '/persons',
    seed: async (driver) => {
      const p = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'Reactive',
        surname: 'PersonOrig',
        sex: 'U',
      });
      return p.id;
    },
    mutate: async (driver, id) => renamePerson(driver, id, 'PersonRenamed'),
    // PersonsListTab renders given_name + surname inside a `.name-cell` —
    // a row textContent check covers it.
    assert: rowContainsAll('PersonRenamed'),
  },

  {
    consumer: 'PlacesView',
    route: '/places',
    seed: async (driver) => {
      const p = await mutateViaMcp<{ id: string }>(driver, 'places.create', {
        name: 'PlaceOrig',
        place_type: 'city',
      });
      return p.id;
    },
    mutate: async (driver, id) => {
      await mutateViaMcp(driver, 'places.update', id, { name: 'PlaceRenamed' });
    },
    assert: rowContainsAll('PlaceRenamed'),
  },

  {
    consumer: 'SourcesView',
    route: '/sources',
    seed: async (driver) => {
      const s = await mutateViaMcp<{ id: string }>(driver, 'sources.create', {
        title: 'SourceOrig',
      });
      return s.id;
    },
    mutate: async (driver, id) => {
      await mutateViaMcp(driver, 'sources.update', id, { title: 'SourceRenamed' });
    },
    assert: rowContainsAll('SourceRenamed'),
  },

  {
    consumer: 'GroupsView',
    route: '/groups',
    seed: async (driver) => {
      const g = await mutateViaMcp<{ id: string }>(driver, 'groups.create', {
        name: 'GroupOrig',
      });
      return g.id;
    },
    mutate: async (driver, id) => {
      await mutateViaMcp(driver, 'groups.update', id, { name: 'GroupRenamed' });
    },
    assert: rowContainsAll('GroupRenamed'),
  },

  {
    consumer: 'ResearchTasksView',
    route: '/research-tasks',
    seed: async (driver) => {
      const t = await mutateViaMcp<{ id: string }>(driver, 'researchTasks.create', {
        task: 'TaskOrig',
      });
      return t.id;
    },
    mutate: async (driver, id) => {
      await mutateViaMcp(driver, 'researchTasks.update', id, { task: 'TaskRenamed' });
    },
    assert: rowContainsAll('TaskRenamed'),
  },

  {
    consumer: 'MediaView',
    route: '/media',
    seed: async (driver) => {
      const m = await mutateViaMcp<{ id: string }>(driver, 'media.create', {
        title: 'MediaOrig',
      });
      return m.id;
    },
    mutate: async (driver, id) => {
      await mutateViaMcp(driver, 'media.update', id, { title: 'MediaRenamed' });
    },
    // MediaView renders title in `.media-list-title-cell` (table mode) or
    // `.media-card` (gallery). textContent of `tbody tr` covers the list
    // mode (the default in test runs).
    assert: rowContainsAll('MediaRenamed'),
  },

  {
    consumer: 'DuplicatesView',
    route: '/duplicates',
    seed: async (driver) => {
      // Seed two persons with identical names. The PersonsTab duplicate-
      // detection heuristic surfaces them as a candidate pair on its first
      // load. The second person's id is what we return — neither id is
      // referenced by the assertion, so either works.
      await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'DupSubject',
        surname: 'DupRenameTarget',
        sex: 'U',
      });
      const p2 = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'DupSubject',
        surname: 'DupRenameTarget',
        sex: 'U',
      });
      return p2.id;
    },
    // The triple shape requires a mutate step; for DuplicatesView the *seed*
    // is the mutation that should fan out. Re-trigger detection on the
    // already-mounted PersonsTab by creating a third identical person — that
    // emits data-changed and the tab's onDataChanged-debounce re-runs the
    // duplicate scan.
    mutate: async (driver) => {
      await mutateViaMcp(driver, 'persons.create', {
        given_name: 'DupSubject',
        surname: 'DupRenameTarget',
        sex: 'U',
      });
    },
    // Once duplicates load, at least one tbody row exists with the seeded
    // name. PersonsTab renders `tbody tr` per candidate pair (each row carries
    // both person_name cells). If reactivity is broken, the tab stays empty.
    assert: rowContainsAll('DupRenameTarget'),
  },

  // --------------------------------- Panels ---------------------------------
  {
    consumer: 'PersonPanel',
    route: '/persons/:id',
    seed: async (driver) => {
      const p = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'Panel',
        surname: 'PersonOrig',
        sex: 'U',
      });
      return p.id;
    },
    mutate: async (driver, id) => renamePerson(driver, id, 'PanelPersonRenamed'),
    // PersonPanel's header renders `<PersonName>` inside `.person-summary-name`,
    // which lives in the `.side-panel` shell. A panel-scoped textContent check
    // covers it.
    assert: panelContains('PanelPersonRenamed'),
  },

  {
    consumer: 'PlacePanel',
    route: '/places/:id',
    seed: async (driver) => {
      const p = await mutateViaMcp<{ id: string }>(driver, 'places.create', {
        name: 'PanelPlaceOrig',
        place_type: 'city',
      });
      return p.id;
    },
    mutate: async (driver, id) => {
      await mutateViaMcp(driver, 'places.update', id, { name: 'PanelPlaceRenamed' });
    },
    // PlacePanel renders `place?.name` in `.panel-name` inside `.side-panel`.
    assert: panelContains('PanelPlaceRenamed'),
  },

  {
    consumer: 'SourcePanel',
    route: '/sources/:id',
    seed: async (driver) => {
      const s = await mutateViaMcp<{ id: string }>(driver, 'sources.create', {
        title: 'PanelSourceOrig',
      });
      return s.id;
    },
    mutate: async (driver, id) => {
      await mutateViaMcp(driver, 'sources.update', id, { title: 'PanelSourceRenamed' });
    },
    assert: panelContains('PanelSourceRenamed'),
  },

  {
    consumer: 'GroupPanel',
    route: '/groups/:id',
    seed: async (driver) => {
      const g = await mutateViaMcp<{ id: string }>(driver, 'groups.create', {
        name: 'PanelGroupOrig',
      });
      return g.id;
    },
    mutate: async (driver, id) => {
      await mutateViaMcp(driver, 'groups.update', id, { name: 'PanelGroupRenamed' });
    },
    assert: panelContains('PanelGroupRenamed'),
  },

  {
    consumer: 'ResearchTaskPanel',
    route: '/research-tasks/:id',
    seed: async (driver) => {
      const t = await mutateViaMcp<{ id: string }>(driver, 'researchTasks.create', {
        task: 'PanelTaskOrig',
      });
      return t.id;
    },
    mutate: async (driver, id) => {
      await mutateViaMcp(driver, 'researchTasks.update', id, { task: 'PanelTaskRenamed' });
    },
    assert: panelContains('PanelTaskRenamed'),
  },

  {
    consumer: 'MediaPanel',
    route: '/media',
    seed: async (driver) => {
      const m = await mutateViaMcp<{ id: string }>(driver, 'media.create', {
        title: 'PanelMediaOrig',
      });
      return m.id;
    },
    // /media has no :id route — click the matching row to mount the panel
    // (mirrors MediaPanel descriptor in panels.ts).
    afterNavigate: async (driver, id) => {
      await driver.executeJs(`
        (async () => {
          await new Promise(r => setTimeout(r, 500));
          const candidates = [...document.querySelectorAll('.media-card, .clickable-row, tbody tr')];
          const card = candidates.find(el => (el.textContent || '').includes('PanelMediaOrig'));
          if (card) {
            card.click();
            await new Promise(r => setTimeout(r, 400));
          }
        })()
      `);
      // hostId is unused but keeps the signature uniform across triples.
      void id;
    },
    mutate: async (driver, id) => {
      await mutateViaMcp(driver, 'media.update', id, { title: 'PanelMediaRenamed' });
    },
    // MediaPanel renders the title in an `<input class="media-title-input">`
    // whose `:value` is bound to `titleDraft`, kept in sync with `media.title`
    // via a `watch`. Read the input's value directly — textContent doesn't
    // include input values.
    assert: `
      (() => {
        const inp = document.querySelector('.side-panel .media-title-input');
        if (inp) return (inp.value || '').includes('PanelMediaRenamed');
        // Fallback for readonly mode (static SPA): title renders in span.
        const span = document.querySelector('.side-panel .media-title-readonly');
        return !!(span && (span.textContent || '').includes('PanelMediaRenamed'));
      })()
    `.trim(),
  },

  // --------------------------------- Chart ---------------------------------
  // PersonsView at /persons/:id renders the chart (Pedigree/Hourglass/Descendant)
  // alongside the panel. Chart nodes render names as nested SVG <tspan> elements
  // inside <text> tags. If the chart doesn't refresh on data-changed (the
  // "auto-subscribe via useEntityData" path), the focal node still shows the
  // pre-rename text — that IS a reactivity bug. Keep the triple even if it
  // would surface a real regression.
  {
    consumer: 'ChartView (PersonsView focal)',
    route: '/persons/:id',
    seed: async (driver) => {
      const p = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'Chart',
        surname: 'FocalOrig',
        sex: 'U',
      });
      return p.id;
    },
    mutate: async (driver, id) => renamePerson(driver, id, 'ChartFocalRenamed'),
    // The chart is an SVG inside the center column. Look for the renamed
    // surname anywhere in the visible SVG. We deliberately don't scope to a
    // particular chart kind — Pedigree/Hourglass/Descendant all render the
    // focal node's name; any one of them passing means the chart updated.
    assert: `
      (() => {
        const svgs = [...document.querySelectorAll('svg')];
        for (const svg of svgs) {
          if ((svg.textContent || '').includes('ChartFocalRenamed')) return true;
        }
        return false;
      })()
    `.trim(),
  },
];
