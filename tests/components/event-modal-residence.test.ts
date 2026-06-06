import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';
import { i18n } from './setup';

// Ben rapport 102 — C1, C2, C3: per-event-type date + participant labels for
// residence events.
//
// User goal: opening a residence-event form shows "Inflyttningsdatum" /
// "Eventuellt utflyttningsdatum" and "Övriga boende i bostaden" instead of
// the generic labels; the generic end-date hint is NOT rendered for residence.
// All other event types keep their existing generic labels.

function makeWindowApi(overrides: Record<string, unknown> = {}) {
  return {
    events: {
      create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
      update: vi.fn().mockResolvedValue({ id: 'evt-1' }),
      forPerson: vi.fn().mockResolvedValue([]),
    },
    eventParticipants: {
      getForEvent: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(null),
    },
    citations: {
      forEvent: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    },
    sources: {
      get: vi.fn().mockResolvedValue(null),
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
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
    ...overrides,
  };
}

// A residence event with an id so savedEventId is set and showSpanEndDate
// will be active (residence is a span event type).
function makeResidenceEvent() {
  return {
    id: 'evt-residence-1',
    event_type: 'residence',
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

function makeOccupationEvent() {
  return {
    id: 'evt-occupation-1',
    event_type: 'occupation',
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

describe('EventModal — residence-specific date + participant labels (Ben rapport 102)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = makeWindowApi();
  });

  it('C1 — residence shows "Move-in date" for start label', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeResidenceEvent() },
    });
    await flushPromises();
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('Move-in date');
    // Must NOT show the generic date label for residence
    // (generic label is 'Date' in en.ts events.date)
    // We check it does not appear in the start-date field context.
    // The simplest assertion: the residence-specific label is present.
    expect(text).not.toContain('End date (optional)');
    expect(text).toContain('Optional move-out date');
  });

  it('C2 — residence does NOT render the generic end-date hint', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeResidenceEvent() },
    });
    await flushPromises();
    await flushPromises();

    // The generic hint for en.ts: "Leave blank if the event happened at a
    // single point in time or has no known end."
    // A distinctive fragment that only appears in endDateHint:
    const genericHintFragment = 'single point in time';
    expect(wrapper.text()).not.toContain(genericHintFragment);
  });

  it('C3 — residence shows "Other residents" in participants section', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeResidenceEvent() },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain('Other residents');
    // Generic label must not be shown for residence
    expect(wrapper.text()).not.toContain('Participants');
  });

  it('control — occupation keeps generic date label "Date" (not "Move-in date")', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeOccupationEvent() },
    });
    await flushPromises();
    await flushPromises();

    const text = wrapper.text();
    // Generic start-date label is 'Date' (en.ts events.date)
    expect(text).toContain('Date');
    // Residence-specific label must not appear for occupation
    expect(text).not.toContain('Move-in date');
    expect(text).not.toContain('Optional move-out date');
  });

  it('control — occupation keeps generic participants label "Participants"', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeOccupationEvent() },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain('Participants');
    expect(wrapper.text()).not.toContain('Other residents');
  });

  it('control — occupation shows the generic end-date hint', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: { editingEvent: makeOccupationEvent() },
    });
    await flushPromises();
    await flushPromises();

    // The hint contains this distinctive fragment (en.ts events.endDateHint)
    expect(wrapper.text()).toContain('single point in time');
  });
});
