import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';
import IconTrash from '../../src/renderer/components/ui/IconTrash.vue';
import { i18n } from './setup';

// Ben rapport 101 — B1: citation section count in parens, B2: IconTrash on row delete.
//
// User goal: when Ben reads the EventModal header he sees "(1)" not "1" for the
// citation count, and the delete control is a trash icon not a ✕ close glyph.

describe('EventModal — citation section count + delete icon (Ben rapport 101)', () => {
  const EVENT_ID = 'event-1';
  const CITATION_ID = 'cit-1';
  const SOURCE_ID = 'src-1';

  beforeEach(() => {
    vi.clearAllMocks();

    // Stub window.api to provide one citation for an existing event.
    (window as unknown as { api: unknown }).api = {
      events: {
        create: vi.fn().mockResolvedValue({ id: EVENT_ID }),
        update: vi.fn().mockResolvedValue({ id: EVENT_ID }),
        forPerson: vi.fn().mockResolvedValue([]),
      },
      eventParticipants: {
        getForEvent: vi.fn().mockResolvedValue([]),
        add: vi.fn().mockResolvedValue(null),
      },
      citations: {
        // Returns one citation row for the event, matching the useEventCitations shape.
        forEvent: vi.fn().mockResolvedValue([
          {
            id: CITATION_ID,
            source_id: SOURCE_ID,
            page: 'p. 42',
            confidence: 3,
            transcription: '',
            notes: '',
            date_accessed: '',
          },
        ]),
        get: vi.fn().mockResolvedValue(null),
      },
      sources: {
        get: vi.fn().mockResolvedValue({ id: SOURCE_ID, title: 'Test Source', type: 'vital_record' }),
      },
      persons: {
        getNames: vi.fn().mockResolvedValue([]),
      },
      relationships: {
        getForPerson: vi.fn().mockResolvedValue([]),
      },
      db: {
        getSetting: vi.fn().mockResolvedValue(null),
      },
      // useEntityData subscribes to these
      onDataChanged: vi.fn(),
      offDataChanged: vi.fn(),
    };
  });

  // Minimal editing event that gives us a savedEventId so citations are loaded.
  function makeEditingEvent() {
    return {
      id: EVENT_ID,
      event_type: 'birth',
      date_type: 'exact' as const,
      date_value: '1900-01-01',
      date_value_end: null,
      date_original: '1900-01-01',
      place_id: null,
      cause: null,
      value: null,
      notes: '',
    };
  }

  it('B1 — citation section count is rendered with surrounding parentheses', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeEditingEvent() },
    });
    await flushPromises();
    // Give the useEventCitations composable a second tick to resolve the source title.
    await flushPromises();

    // The [data-entity="citation"] section header must show the count wrapped in parens.
    const citHeader = wrapper.find('[data-entity="citation"]');
    expect(citHeader.exists()).toBe(true);

    const countSpan = citHeader.find('.ep-sec-count');
    expect(countSpan.exists()).toBe(true);

    // B1: text must match "(N)" — parentheses are required.
    expect(countSpan.text()).toMatch(/^\(\d+\)$/);
  });

  it('B2 — citation row delete button renders IconTrash, not a ✕ glyph', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeEditingEvent() },
    });
    await flushPromises();
    await flushPromises();

    // Find all citation rows in the citations section.
    const citSection = wrapper.find('[data-entity="citation"]');
    expect(citSection.exists()).toBe(true);

    // The ep-sec-content immediately follows the header in the DOM.
    // Find all .ep-entity-row elements in the citation section content.
    // The citation section content is a sibling of the header in the template.
    const allRows = wrapper.findAll('.ep-entity-row');
    // At least one citation row must exist.
    expect(allRows.length).toBeGreaterThan(0);

    // Each row's delete button must render IconTrash, not raw ✕ text.
    for (const row of allRows) {
      const deleteBtn = row.find('.btn-delete');
      if (!deleteBtn.exists()) continue;

      // Must contain an IconTrash component instance.
      const trashIcon = deleteBtn.findComponent(IconTrash);
      expect(trashIcon.exists()).toBe(true);

      // Must NOT contain the raw ✕ glyph.
      expect(deleteBtn.text()).not.toContain('✕');
    }
  });
});
