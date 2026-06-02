/**
 * Panel Surface Contract — pilot (Task 2 of e2e-expansion).
 *
 * Data-driven over PANELS (PersonPanel + PlacePanel). For each section in each
 * descriptor, exercises the four Surface Contract checks from CLAUDE.md:
 *
 *   (1) host flows in        — opening the CTA delivers the host context.
 *   (2) CTA fulfils its label — clicking CTA + filling + saving creates a row
 *                                of the primitive named in the section title.
 *   (3) lifecycle parity     — every section that lists rows must offer both
 *                                edit AND delete (or unlink) affordances.
 *   (4) no degradation       — collapsing the section then clicking the CTA
 *                                must still reveal the modal/picker (the
 *                                SectionHeader's onAction expands first).
 *
 * Also asserts the panel offers a Danger-zone delete affordance for hosts that
 * declare `hostDeletable: true`.
 */

import { test, expect } from '@playwright/test';
import {
  AppDriver,
  startApp,
  teardownApp,
  type AppInstance,
} from './fixture';
import { PANELS, type PanelDescriptor, type PanelSection } from './fixtures/panels';

// Port 19255: must be unique across e2e specs. 19200/19201/19202 are
// app.test/crud/website-export; 19252 is duplicates.spec.ts; 19253/19254
// are reactivity/imports. Sharing a port with duplicates was a latent
// bug — when test:e2e:full ran panels concurrently with the duplicates
// project (Playwright workers: 2), they raced to bind 19252 and the
// late spawner timed out on "Vue did not initialize in time".
const PORT = 19255;

// ---------------------------------------------------------------------------
// Tiny helpers — kept local until Task 3 generalises them.
// ---------------------------------------------------------------------------

/**
 * Get the visible row count under a named section. Returns 0 if the section
 * is collapsed (no body rendered) or has no rows.
 */
async function getSectionRowCount(driver: AppDriver, sectionTitle: string): Promise<number> {
  return driver.executeJs<number>(`
    (() => {
      const headers = Array.from(document.querySelectorAll('.section-header-bar'));
      const header = headers.find(h => h.querySelector('.section-title')?.textContent === ${JSON.stringify(sectionTitle)});
      if (!header) return -1;
      const body = header.parentElement?.querySelector('.panel-section-body');
      if (!body) return 0;
      // Tables (events, names) — count tbody rows. Lists (groups, tasks) —
      // count clickable-row. LinkedXSection (MediaPanel Linked Persons /
      // Places) renders one .linked-row per linked entity.
      //
      // NOT counted here: .timeline-entry. Timeline components are derived
      // views over the canonical Events section; per Surface Contract
      // check 3, the row-level edit/delete lifecycle lives on the canonical
      // primary section, not on every derived rendering of the same data.
      // Skipping check 3 for Timeline sections is the correct behaviour.
      const trRows = body.querySelectorAll('tbody tr').length;
      if (trRows > 0) return trRows;
      const clickableRows = body.querySelectorAll('.clickable-row').length;
      if (clickableRows > 0) return clickableRows;
      return body.querySelectorAll('.linked-row').length;
    })()
  `);
}

/** Read the count badge (e.g. "(3)") shown next to the section title. */
async function getSectionCountBadge(driver: AppDriver, sectionTitle: string): Promise<number | null> {
  return driver.executeJs<number | null>(`
    (() => {
      const headers = Array.from(document.querySelectorAll('.section-header-bar'));
      const header = headers.find(h => h.querySelector('.section-title')?.textContent === ${JSON.stringify(sectionTitle)});
      if (!header) return null;
      const txt = header.querySelector('.section-count')?.textContent ?? '';
      const m = txt.match(/\\((\\d+)\\)/);
      return m ? parseInt(m[1], 10) : null;
    })()
  `);
}

/** Click a section's CTA button by section title. Returns true if clicked. */
async function clickSectionCta(driver: AppDriver, sectionTitle: string): Promise<boolean> {
  return driver.executeJs<boolean>(`
    (() => {
      const headers = Array.from(document.querySelectorAll('.section-header-bar'));
      const header = headers.find(h => h.querySelector('.section-title')?.textContent === ${JSON.stringify(sectionTitle)});
      if (!header) return false;
      const btn = header.querySelector('button:not(.chevron-btn)');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
}

/** Toggle a section's collapse state by clicking the chevron. */
async function toggleSection(driver: AppDriver, sectionTitle: string): Promise<boolean> {
  return driver.executeJs<boolean>(`
    (() => {
      const headers = Array.from(document.querySelectorAll('.section-header-bar'));
      const header = headers.find(h => h.querySelector('.section-title')?.textContent === ${JSON.stringify(sectionTitle)});
      if (!header) return false;
      const chev = header.querySelector('.chevron-btn');
      if (!chev) return false;
      chev.click();
      return true;
    })()
  `);
}

/** True if a section is currently expanded (chevron aria-expanded=true). */
async function isSectionExpanded(driver: AppDriver, sectionTitle: string): Promise<boolean> {
  return driver.executeJs<boolean>(`
    (() => {
      const headers = Array.from(document.querySelectorAll('.section-header-bar'));
      const header = headers.find(h => h.querySelector('.section-title')?.textContent === ${JSON.stringify(sectionTitle)});
      if (!header) return false;
      return header.querySelector('.chevron-btn')?.getAttribute('aria-expanded') === 'true';
    })()
  `);
}

interface DialogProbe {
  hasDialog: boolean;
  title: string | null;
  body: string | null;
}

async function probeDialog(driver: AppDriver): Promise<DialogProbe> {
  return driver.executeJs<DialogProbe>(`
    (() => {
      const dialog = document.querySelector('[role=dialog]');
      if (!dialog) return { hasDialog: false, title: null, body: null };
      return {
        hasDialog: true,
        title: dialog.querySelector('.ep-title')?.textContent ?? null,
        body: dialog.querySelector('.ep-body')?.innerText?.slice(0, 800) ?? null,
      };
    })()
  `);
}

/** True if the panel has an inline picker / media-attach picker visible. */
async function hasInlinePicker(driver: AppDriver): Promise<boolean> {
  // `.add-row` covers LinkedPersonsSection / LinkedPlacesSection /
  // LinkedMediaSection (Group + ResearchTask panels). `.picker-wrap` covers
  // MediaPanel's PersonPicker / PlacePicker inline pickers. The older
  // `.panel-group-picker-wrap` / `.group-picker` / `.task-picker` /
  // `.media-picker` selectors stay for PersonPanel + PlacePanel coverage.
  return driver.executeJs<boolean>(`
    !!document.querySelector('.panel-group-picker-wrap, .group-picker, .task-picker, .media-picker, .add-row, .picker-wrap')
  `);
}

/** Close any open dialog via Escape key (BaseModal listens on window). */
async function closeDialog(driver: AppDriver): Promise<void> {
  await driver.executeJs(`
    (() => {
      if (document.querySelector('[role=dialog]')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
    })()
  `);
  await driver.settle(150);
}

/**
 * Cancel any open inline picker. Media picker has an explicit Cancel button;
 * Group/Task pickers in PersonPanel toggle their visibility via a `showXPicker`
 * ref that persists across navigation. Click the section's CTA again to
 * toggle them back to hidden so the next test starts clean.
 */
async function closePicker(driver: AppDriver): Promise<void> {
  await driver.executeJs(`
    (() => {
      // .add-row's ghost cancel button covers LinkedXSection pickers
      // (Group + ResearchTask panels). The first one found is enough.
      const cancel = document.querySelector('.add-row .app-btn--ghost');
      if (cancel) { cancel.click(); return; }
      // MediaPanel's picker-wrap has its own ghost cancel button.
      const mediaCancel = document.querySelector('.picker-wrap .app-btn--ghost');
      if (mediaCancel) { mediaCancel.click(); return; }
      // Group/Task pickers — find the visible picker, then toggle its section's
      // CTA to dismiss. Mirrors the panel's @action="showXPicker = !showXPicker".
      const picker = document.querySelector('.panel-group-picker-wrap');
      if (picker) {
        // Find the section header above this picker and click its CTA.
        const section = picker.closest('.panel-section');
        const cta = section?.querySelector('.section-header-bar button:not(.chevron-btn)');
        if (cta) cta.click();
      }
    })()
  `);
  await driver.settle(150);
}

/**
 * Fill the modal's first text input with the marker, then click Save.
 * Returns true if the dialog closed (i.e. save succeeded).
 *
 * For modals that require a categorical choice before Save is enabled (the
 * EventModal's `event_type` quick-segment row is the canonical example: on
 * PlacePanel `+ Event` the modal opens with no pre-selected type and Save
 * stays disabled until the user clicks one), pick the first available
 * segment option before filling text inputs. This mirrors what a real user
 * does — they click "Birth" or "Death" before typing the date.
 */
async function fillModalAndSave(driver: AppDriver, marker: string): Promise<boolean> {
  return driver.executeJs<boolean>(`
    (async () => {
      const dialog = document.querySelector('[role=dialog]');
      if (!dialog) return false;
      // If the modal has a quick-segment categorical picker with no option
      // currently selected (e.g. EventModal opened from PlacePanel where
      // defaultEventType is empty), click the first option. This is the
      // user-equivalent of "pick a type before saving."
      const segs = dialog.querySelectorAll('.ep-seg-opt');
      if (segs.length > 0) {
        const anySelected = Array.from(segs).some(b => b.classList.contains('ep-seg-opt--on'));
        if (!anySelected) {
          (segs[0]).click();
          await new Promise(r => setTimeout(r, 100));
        }
      }
      // Prefer "Original wording" text input (Event modal); fall back to the
      // first non-readonly text input that is NOT inside a combobox / picker.
      // Picker inputs (SourcePicker, PersonPicker) interpret synthetic
      // input events as the user typing a new search query and *clear* the
      // model value — which makes save() bail. Avoiding them keeps the saved
      // source/person id intact.
      const skipPickerInputs = (el) => {
        let cur = el;
        while (cur && cur !== dialog) {
          if (
            cur.getAttribute && (
              cur.getAttribute('role') === 'combobox' ||
              cur.classList?.contains('source-picker') ||
              cur.classList?.contains('person-picker') ||
              cur.classList?.contains('place-picker') ||
              cur.classList?.contains('picker-wrap')
            )
          ) return false;
          cur = cur.parentElement;
        }
        return true;
      };
      const allInputs = [
        ...dialog.querySelectorAll('input[placeholder*="Original"], input[type=text]:not([readonly]), input:not([type]):not([readonly]), textarea'),
      ].filter(skipPickerInputs);
      const orig = allInputs[0] ?? null;
      if (orig) {
        const proto = orig.tagName === 'TEXTAREA'
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(orig, ${JSON.stringify(marker)});
        orig.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise(r => setTimeout(r, 100));
      const save = dialog.querySelector('.ep-save-btn');
      if (!save || save.disabled) return false;
      save.click();
      // Wait up to 2s for the dialog to close.
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        if (!document.querySelector('[role=dialog]')) return true;
        await new Promise(r => setTimeout(r, 50));
      }
      return false;
    })()
  `);
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

for (const descriptor of PANELS) {
  test.describe.serial(`Panel surface: ${descriptor.name}`, () => {
    let app: AppInstance | undefined;
    let driver: AppDriver;
    let hostId: string;

    test.beforeAll(async () => {
      app = await startApp(PORT, descriptor.name.toLowerCase());
      driver = new AppDriver(PORT);
      await driver.setLocale('en');
      hostId = await descriptor.seed(driver);
      await driver.navigate(descriptor.route(hostId));
      await driver.settle(500);
      if (descriptor.selectAfterNavigate) {
        await descriptor.selectAfterNavigate(driver, hostId);
        await driver.settle(300);
      }
    });

    test.afterAll(async () => {
      await teardownApp(app);
    });

    test.beforeEach(async () => {
      // Re-navigate to host between tests so each starts in a known state.
      // Wrapped in a single eval so closeDialog + closePicker + push() share one
      // round-trip and don't accidentally await a router push() Promise that
      // can suspend on slow data loaders. Each helper call below is fire-and-
      // forget; we settle on the host side instead.
      try {
        await driver.executeJs(`
          (() => {
            if (document.querySelector('[role=dialog]')) {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
            const cancel = document.querySelector('.add-row .app-btn--ghost');
            if (cancel) cancel.click();
            // Toggle off any open group/task picker (PersonPanel only).
            const picker = document.querySelector('.panel-group-picker-wrap');
            if (picker) {
              const section = picker.closest('.panel-section');
              const cta = section?.querySelector('.section-header-bar button:not(.chevron-btn)');
              if (cta) cta.click();
            }
            window.__vue_router.push(${JSON.stringify(descriptor.route(hostId))});
          })()
        `);
        await driver.settle(400);
        if (descriptor.selectAfterNavigate) {
          await descriptor.selectAfterNavigate(driver, hostId);
          await driver.settle(300);
        }
      } catch (err) {
        console.error('[beforeEach]', err);
      }
    });

    // ---- Per-section tests --------------------------------------------------

    for (const section of descriptor.sections) {
      runSection(descriptor, section, () => driver);
    }

    // ---- Panel-level: Danger-zone delete affordance ------------------------

    if (descriptor.hostDeletable) {
      test('panel offers a Danger-zone delete affordance', async () => {
        const dom = await driver.getDom();
        expect(
          dom,
          `${descriptor.name} must include a .panel-danger-zone block per Surface Contract check #3 (host-level lifecycle).`,
        ).toMatch(/panel-danger-zone/);
      });
    }

    // ---- Panel-level: floor assertion (mount + visible header) -------------
    //
    // Every panel — including host-less config panels (Report / Website) that
    // don't have a Danger-zone — must mount with a visible `.panel-name`
    // header. This is the minimum a user can see; if the panel fails to
    // render, every other Surface Contract check is meaningless.
    test('panel mounts with a visible header', async () => {
      // `.panel-role-label` is owned by the EntityPanel shell — every panel
      // renders it from `:label`. It's the most robust mount-sanity probe
      // across panels with custom header slots (PersonPanel + MediaPanel
      // replace .panel-name with their own summary card / title input).
      const roleLabel = await driver.executeJs<string | null>(`
        document.querySelector('.panel-role-label')?.textContent?.trim() ?? null
      `);
      expect(
        roleLabel,
        `${descriptor.name} must render a non-empty .panel-role-label (panel mount sanity — EntityPanel shell rendered).`,
      ).toBeTruthy();
    });
  });
}

// ---------------------------------------------------------------------------
// Per-section runner — one Playwright `test.describe` per section.
// ---------------------------------------------------------------------------

function runSection(
  descriptor: PanelDescriptor,
  section: PanelSection,
  getDriver: () => AppDriver,
): void {
  test.describe(`section: ${section.title} (${section.kind})`, () => {
    test('section renders with its title', async () => {
      const driver = getDriver();
      const exists = await driver.executeJs<boolean>(`
        Array.from(document.querySelectorAll('.section-header-bar .section-title'))
          .some(el => el.textContent === ${JSON.stringify(section.title)})
      `);
      expect(exists, `Section "${section.title}" must render.`).toBe(true);
    });

    if (section.kind === 'none' || section.kind === 'relations-empty') {
      // No CTA to exercise. The section-renders test above covers it.
      return;
    }

    // Verify the CTA button label matches the descriptor (label-lie guard).
    test('CTA button shows the declared label', async () => {
      const driver = getDriver();
      const observedLabel = await driver.executeJs<string | null>(`
        (() => {
          const headers = Array.from(document.querySelectorAll('.section-header-bar'));
          const header = headers.find(h => h.querySelector('.section-title')?.textContent === ${JSON.stringify(section.title)});
          if (!header) return null;
          const btn = header.querySelector('button:not(.chevron-btn)');
          return btn?.textContent?.trim() ?? null;
        })()
      `);
      expect(observedLabel, `Section "${section.title}" CTA label`).toBe(section.ctaLabel);
    });

    // Check 1: host flows in (modal-shaped CTAs only).
    if (section.kind === 'modal-with-host' || section.kind === 'modal-with-host-no-count-bump') {
      test('check 1: host flows in (dialog title contains host name)', async () => {
        const driver = getDriver();
        await clickSectionCta(driver, section.title);
        await driver.settle(500);
        const probe = await probeDialog(driver);
        try {
          expect(probe.hasDialog, `Clicking "${section.ctaLabel}" must open a dialog.`).toBe(true);
          expect(
            probe.title ?? '',
            `Dialog title must contain host name "${descriptor.hostName}".`,
          ).toContain(descriptor.hostName);
        } finally {
          await closeDialog(driver);
        }
      });
    } else if (section.kind === 'modal-anonymous') {
      // Host name not in title — probe just verifies dialog opens.
      test('check 1: clicking CTA opens a dialog', async () => {
        const driver = getDriver();
        await clickSectionCta(driver, section.title);
        await driver.settle(500);
        const probe = await probeDialog(driver);
        try {
          expect(probe.hasDialog, `Clicking "${section.ctaLabel}" must open a dialog.`).toBe(true);
        } finally {
          await closeDialog(driver);
        }
      });
    } else if (section.kind === 'picker' || section.kind === 'media-attach') {
      test('check 1: clicking CTA reveals an inline picker scoped to this panel', async () => {
        const driver = getDriver();
        await clickSectionCta(driver, section.title);
        await driver.settle(400);
        const hasPicker = await hasInlinePicker(driver);
        try {
          expect(
            hasPicker,
            `Clicking "${section.ctaLabel}" must reveal an inline picker (group/task/media).`,
          ).toBe(true);
        } finally {
          await closePicker(driver);
        }
      });
    }

    // Check 2: CTA fulfils its label (modal-shaped sections only).
    if (section.kind === 'modal-with-host' || section.kind === 'modal-anonymous') {
      test('check 2: filling + saving creates a row (count goes +1)', async () => {
        const driver = getDriver();
        const before = await getSectionCountBadge(driver, section.title) ?? 0;
        await clickSectionCta(driver, section.title);
        await driver.settle(400);
        const marker = `MARKER-${section.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
        const saved = await fillModalAndSave(driver, marker);
        await driver.settle(500);
        try {
          expect(saved, `Save must close the dialog for "${section.ctaLabel}".`).toBe(true);
          const after = await getSectionCountBadge(driver, section.title) ?? 0;
          expect(
            after,
            `Section "${section.title}" count must increase from ${before} → ${before + 1} after save.`,
          ).toBeGreaterThanOrEqual(before + 1);
        } finally {
          await closeDialog(driver);
        }
      });
    }
    // TODO Task 3: media-attach fulfils-label requires real file fixture
    //   (tests/e2e/fixtures/imports/pixel.png). Skipping in pilot.
    // TODO Task 3: picker fulfils-label requires creating a target row first
    //   (existing group / existing task) and selecting it from the combobox.

    // Check 3: lifecycle parity — verified for sections with seeded rows.
    // Sections that legitimately don't have row-shaped lifecycle affordances
    // (derived views, map widgets) opt out via `skipLifecycleParity` in
    // their descriptor — see fixtures/panels.ts. The flag REQUIRES naming a
    // canonical sibling section that owns the primitive's lifecycle, so
    // reviewers can verify coverage isn't dropped.
    const hasLifecycleCheck = (
      section.kind === 'modal-with-host' ||
      section.kind === 'modal-with-host-no-count-bump' ||
      section.kind === 'modal-anonymous' ||
      section.kind === 'picker' ||
      section.title === 'People' ||
      section.title === 'Names'
    ) && !section.skipLifecycleParity;
    if (hasLifecycleCheck) {
      test('check 3: rows offer both edit and delete (or unlink) affordances', async () => {
        const driver = getDriver();
        // Ensure section is open so the body renders.
        if (!(await isSectionExpanded(driver, section.title))) {
          await toggleSection(driver, section.title);
          await driver.settle(200);
        }
        const rowCount = await getSectionRowCount(driver, section.title);
        // No rowCount-zero runtime skip: if a check-3-bearing section
        // produces zero rows, the seed is broken. The descriptor's
        // `seed` step is responsible for pre-populating a row; if it
        // isn't, the assertion below fails with a clear message and
        // the seed needs fixing. (Sections that legitimately can't be
        // seeded into a row-shaped UI carry `skipLifecycleParity`.)
        expect(
          rowCount,
          `Section "${section.title}" must have at least one seeded row for lifecycle-parity. ` +
            `If the section legitimately renders the primitive in a non-row UI (e.g. derived view, ` +
            `map widget), add \`skipLifecycleParity\` to the descriptor citing the canonical section ` +
            `that owns the lifecycle.`,
        ).toBeGreaterThan(0);
        const affordances = await driver.executeJs<{ edit: boolean; deleteOrUnlink: boolean }>(`
          (() => {
            const headers = Array.from(document.querySelectorAll('.section-header-bar'));
            const header = headers.find(h => h.querySelector('.section-title')?.textContent === ${JSON.stringify(section.title)});
            const body = header?.parentElement?.querySelector('.panel-section-body');
            if (!body) return { edit: false, deleteOrUnlink: false };
            // Edit: row is a button OR has aria-label starting with "Edit ", OR an
            // explicit edit button, OR (LinkedXSection pattern) a router-link
            // back to the linked entity — that's how Group/ResearchTask panels
            // surface "edit this row's entity" since the modal lives on the
            // navigated-to entity's panel.
            const editRow = body.querySelector('[aria-label^="Edit "], .clickable-row, [role=button][tabindex], .person-link, a[href^="#/persons/"], a[href^="#/places/"], a[href^="#/media"]');
            // Delete or unlink button. Accept either the "Delete <item>"
            // a11y shape (LinkedXSection rows) or the bare "Delete" /
            // "Remove" label (SourcePanel Citations: aria-label is just
            // common.delete = "Delete" with no item suffix). Also accept the
            // raw icon-trash class as a fallback for rows that render IconTrash
            // inside a ghost button.
            const delBtn = body.querySelector(
              '.btn-delete, button[aria-label^="Delete"], button[aria-label^="Unlink"], button[aria-label^="Remove"], .icon-trash, .icon-unlink'
            );
            return {
              edit: !!editRow,
              deleteOrUnlink: !!delBtn,
            };
          })()
        `);
        expect(affordances.edit, `Section "${section.title}" rows must offer an edit affordance.`).toBe(true);
        expect(
          affordances.deleteOrUnlink,
          `Section "${section.title}" rows must offer a delete-or-unlink affordance.`,
        ).toBe(true);
      });
    }

    // Check 4: no degradation across collapse/expand state.
    // Picker kinds (Groups / Tasks on PersonPanel; Linked Persons /
    // Linked Places on MediaPanel; People / Places / Media on GroupPanel
    // and ResearchTaskPanel) now use openXPicker() helpers that explicitly
    // expand the section before opening the picker — previously the CTA
    // either toggled the picker state or set-it-to-true without expanding,
    // which produced an invisible no-op when collapsed. Check 4 covers all
    // CTA-bearing sections; only `none` and `relations-empty` (no CTA) are
    // out.
    if (
      section.kind === 'modal-with-host' ||
      section.kind === 'modal-with-host-no-count-bump' ||
      section.kind === 'modal-anonymous' ||
      section.kind === 'media-attach' ||
      section.kind === 'picker'
    ) {
      test('check 4: CTA still works when section is collapsed', async () => {
        const driver = getDriver();
        // Make sure it's open first, then collapse.
        if (!(await isSectionExpanded(driver, section.title))) {
          await toggleSection(driver, section.title);
          await driver.settle(150);
        }
        await toggleSection(driver, section.title);
        await driver.settle(150);
        expect(
          await isSectionExpanded(driver, section.title),
          `Section "${section.title}" should be collapsed for this test.`,
        ).toBe(false);
        // Now click the CTA — SectionHeader.onAction must auto-expand and
        // trigger the action so a modal/picker appears.
        await clickSectionCta(driver, section.title);
        await driver.settle(500);
        const opened =
          (await probeDialog(driver)).hasDialog ||
          (await hasInlinePicker(driver));
        try {
          expect(
            opened,
            `Clicking "${section.ctaLabel}" while collapsed must still open a modal or picker.`,
          ).toBe(true);
        } finally {
          await closeDialog(driver);
          await closePicker(driver);
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Media → Source link round-trip (media-source-links plan, outcomes 2 + 5).
//
// User goal: a genealogist opens a media item, sees a "Källor" (Linked
// Sources) section, clicks "+ Source" to link an existing source, the source
// shows up in the Källor list — and the source's own panel reciprocally shows
// that media in its Media section.
//
// This drives the *real* add-link flow through the packaged UI: it clicks the
// section CTA, drives the teleported SourcePicker dropdown (the same
// `mousedown.prevent` select a user fires), and asserts the user-observable
// outcome at both ends of the reciprocal link. It's separate from the
// data-driven PANELS loop above because it walks a specific cross-panel
// journey, not a generic Surface Contract check. It reuses PORT 19255 and runs
// after the PANELS loop in the same worker (each describe owns its own
// startApp/teardownApp lifecycle).
// ---------------------------------------------------------------------------

test.describe.serial('Media → Source link reciprocal', () => {
  let app: AppInstance | undefined;
  let driver: AppDriver;
  let mediaId: string;
  let sourceId: string;

  const MEDIA_TITLE = 'Vigselattest 1887';
  const SOURCE_TITLE = 'Husförhörslängd Väster 1887';

  test.beforeAll(async () => {
    app = await startApp(PORT, 'media-source-link');
    driver = new AppDriver(PORT);
    await driver.setLocale('en');
    // Seed one media item and one source via the same window.api the UI uses.
    ({ id: mediaId } = await driver.createMedia({ title: MEDIA_TITLE }));
    ({ id: sourceId } = await driver.createSource({ title: SOURCE_TITLE }));
  });

  test.afterAll(async () => {
    await teardownApp(app);
  });

  test('link a source from the Källor section, then see the media on the source panel', async () => {
    // ── 1. Open the media library and select the seeded media so its panel
    //       mounts. The list row carries data-media-id. ───────────────────
    await driver.navigate('/media');
    await driver.settle(600);
    await driver.click(`[data-media-id="${mediaId}"]`);
    await driver.settle(400);

    // The MediaPanel must be showing our media — confirm the Källor section
    // renders (en: "Linked Sources").
    const SECTION_TITLE = 'Linked Sources';
    await driver.waitForText(SECTION_TITLE);

    // ── 2. Expand the Källor section if collapsed, then click "+ Source". ──
    if (!(await isSectionExpanded(driver, SECTION_TITLE))) {
      await toggleSection(driver, SECTION_TITLE);
      await driver.settle(200);
    }
    const clicked = await clickSectionCta(driver, SECTION_TITLE);
    expect(clicked, 'The "+ Source" CTA must be present and clickable.').toBe(true);
    await driver.settle(400);

    // The inline SourcePicker should now be visible inside the section.
    const pickerVisible = await driver.executeJs<boolean>(
      `!!document.querySelector('.picker-wrap .source-picker input[role=combobox]')`,
    );
    expect(pickerVisible, 'Clicking "+ Source" must reveal the SourcePicker.').toBe(true);

    // ── 3. Drive the picker: focus + type the source title, wait for the
    //       debounced search (~150 ms) to populate the teleported dropdown,
    //       then fire the real `mousedown.prevent` select on the matching
    //       option. This is exactly what a user does. ─────────────────────
    await driver.executeJs(`
      (() => {
        const input = document.querySelector('.picker-wrap .source-picker input[role=combobox]');
        if (!input) throw new Error('SourcePicker input not found');
        input.focus();
        input.dispatchEvent(new Event('focus', { bubbles: true }));
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(SOURCE_TITLE)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await driver.settle(600); // > 150 ms debounce + search round-trip

    // Find the dropdown option whose title matches and fire mousedown (the
    // SourcePicker selects on `@mousedown.prevent`, not click).
    const selected = await driver.executeJs<boolean>(`
      (() => {
        const items = Array.from(document.querySelectorAll('.dropdown .dropdown-item'));
        const match = items.find(li =>
          li.querySelector('.source-title')?.textContent?.trim() === ${JSON.stringify(SOURCE_TITLE)}
        );
        if (!match) return false;
        match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        return true;
      })()
    `);
    expect(selected, 'The seeded source must appear in the SourcePicker dropdown and be selectable.').toBe(true);
    await driver.settle(600);

    // ── 4. Outcome 2: the source title now appears as a linked row in the
    //       Källor section of the media panel. ─────────────────────────────
    const linkedRowText = await driver.executeJs<string | null>(`
      (() => {
        const headers = Array.from(document.querySelectorAll('.section-header-bar'));
        const header = headers.find(h => h.querySelector('.section-title')?.textContent === ${JSON.stringify(SECTION_TITLE)});
        if (!header) return null;
        const body = header.parentElement?.querySelector('.panel-section-body');
        if (!body) return null;
        const rows = Array.from(body.querySelectorAll('.linked-row'));
        const row = rows.find(r => r.textContent?.includes(${JSON.stringify(SOURCE_TITLE)}));
        return row ? row.textContent?.trim() ?? null : null;
      })()
    `);
    expect(
      linkedRowText,
      'After linking, the source title must show as a linked row in the Källor (Linked Sources) section.',
    ).toContain(SOURCE_TITLE);

    // ── 5. Outcome 5 (reciprocal): navigate to the source's own panel and
    //       assert the media appears in its Media section (served by
    //       EntityMediaSection via media.forEntity('source', id)). ─────────
    await driver.navigate(`/sources/${sourceId}`);
    await driver.settle(600);
    // The source panel's "Media" section may default to collapsed on a narrow
    // panel — expand it so EntityMediaSection's table renders.
    const MEDIA_SECTION_TITLE = 'Media';
    await driver.waitForText(MEDIA_SECTION_TITLE);
    if (!(await isSectionExpanded(driver, MEDIA_SECTION_TITLE))) {
      await toggleSection(driver, MEDIA_SECTION_TITLE);
      await driver.settle(300);
    }
    // The media title (rendered via mediaDisplayName for our titled media)
    // must now be present — the reciprocal of the link we just made.
    await driver.waitForText(MEDIA_TITLE);
  });
});
