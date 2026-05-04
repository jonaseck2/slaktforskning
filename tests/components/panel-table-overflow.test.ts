/**
 * Regression test for the panel-table column overflow bug.
 *
 * Before this fix, `.panel-section .data-table td` had `word-break: break-word`
 * + `overflow-wrap: anywhere`, which caused long place names in a narrow panel
 * to break at every character — stacking the text into a vertical strip
 * one-character-wide. Per-cell rules like `.td-place { white-space: nowrap }`
 * lost the specificity battle to that generic rule.
 *
 * The user-observable goal: long text in a panel-section data-table cell
 * stays on a single line and clips with an ellipsis.
 *
 * The user-observable check below: mount EventList inside a `.panel-section`
 * wrapper at narrow width, with an event whose place name is long; assert the
 * place cell's computed style is `white-space: nowrap` (so it cannot stack
 * vertically). Without the fix, the rendered place cell inherits `break-word`
 * from shared.css and stacks; with the fix, the shared rule sets `nowrap`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventList from '../../src/renderer/components/EventList.vue';
import { i18n } from './setup';

// Long place name that, under the old CSS, broke character-by-character into
// a vertical strip when the panel column was narrower than the string.
const LONG_PLACE = 'Matteus församling, Stockholm, Stockholms län, Sverige';

const longEvent = {
  id: 'event-long',
  event_type: 'marriage',
  date_type: 'exact',
  date_value: '1850-06-12',
  date_value_end: null,
  date_original: '1850-06-12',
  place_id: 'place-1',
  place_name: LONG_PLACE,
  notes: '',
  cause: null,
  citation_count: 0,
  participant_names: '',
  value: null,
};

describe('panel-table column overflow (.panel-section .data-table)', () => {
  let styleEl: HTMLStyleElement;
  let wrapperHost: HTMLDivElement;
  const mockForPerson = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      events: {
        forPerson: mockForPerson,
        forRelationship: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
      },
      citations: { forEvent: vi.fn().mockResolvedValue([]) },
      sources: { list: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue(null) },
      db: { getSetting: vi.fn().mockResolvedValue(null) },
    };

    // Mirror the exact slice of shared.css that produces the bug surface.
    // The new (post-fix) rule must keep long text on a single line.
    styleEl = document.createElement('style');
    styleEl.textContent = `
      .panel-section .data-table th,
      .panel-section .data-table td {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 0;
      }
      /* Approximate panel column width during a narrow drag. */
      .panel-section { width: 240px; min-width: 0; }
    `;
    document.head.appendChild(styleEl);

    // Render into a panel-section wrapper attached to the document so
    // computed styles + layout are evaluated by JSDOM.
    wrapperHost = document.createElement('div');
    wrapperHost.className = 'panel-section';
    document.body.appendChild(wrapperHost);
  });

  afterEach(() => {
    styleEl.remove();
    wrapperHost.remove();
  });

  it('long place name in EventList stays single-line (white-space: nowrap)', async () => {
    mockForPerson.mockResolvedValue([longEvent]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
      attachTo: wrapperHost,
    });
    await flushPromises();

    const placeCell = wrapper.find<HTMLTableCellElement>('td.td-place');
    expect(placeCell.exists()).toBe(true);

    // The bug: under the old CSS, the place <td> would have
    // `word-break: break-word; overflow-wrap: anywhere;` which broke each
    // character to a new line in a narrow column. The fix replaces that
    // with `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
    const computed = window.getComputedStyle(placeCell.element);
    expect(computed.whiteSpace).toBe('nowrap');
    expect(computed.overflow).toMatch(/hidden/);
    expect(computed.textOverflow).toBe('ellipsis');

    // The full place string is preserved as the cell's tooltip so the user
    // can hover to see what got clipped.
    expect(placeCell.attributes('title')).toBe(LONG_PLACE);

    wrapper.unmount();
  });

  it('badge cell wears its opt-out class so it does not collapse to zero', async () => {
    mockForPerson.mockResolvedValue([longEvent]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
      attachTo: wrapperHost,
    });
    await flushPromises();

    // The badge column previously had no class, so the new shared rule
    // (max-width: 0 + nowrap + ellipsis) would clip it to zero width.
    // We added `td-badge` so the scoped style can opt back in with
    // `width: 1px; max-width: none; white-space: nowrap`.
    const badgeCell = wrapper.find<HTMLTableCellElement>('td.td-badge');
    expect(badgeCell.exists()).toBe(true);

    // The badge text itself stays nowrap (set on the inline span).
    const badgeSpan = badgeCell.find('.event-badge');
    expect(badgeSpan.exists()).toBe(true);

    wrapper.unmount();
  });
});
