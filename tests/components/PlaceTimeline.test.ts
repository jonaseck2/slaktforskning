import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PlaceTimeline from '../../src/renderer/components/PlaceTimeline.vue';
import { i18n } from './setup';

function makeApi(events: unknown[]) {
  return {
    events: {
      forPlace: vi.fn().mockResolvedValue(events),
    },
    onDataChanged: vi.fn().mockReturnValue(() => {}),
    db: { getSetting: vi.fn().mockResolvedValue(null) },
    citations: { forEvent: vi.fn().mockResolvedValue([]) },
  };
}

const eventBirth = {
  id: 'ev-1',
  event_type: 'birth',
  date_type: 'exact',
  date_value: '1850-04-12',
  date_value_end: null,
  date_original: '12 april 1850',
  place_id: 'place-1',
  place_name: 'Stockholm',
  description: '',
  cause: null,
  citation_count: 1,
  participant_names: 'Anders Eckerström',
};

const eventMarriageApprox = {
  id: 'ev-2',
  event_type: 'marriage',
  date_type: 'about',
  date_value: '1880-06-01',
  date_value_end: null,
  date_original: 'omkring 1880',
  place_id: 'place-1',
  place_name: 'Stockholm',
  description: '',
  cause: null,
  citation_count: 0,
  participant_names: 'Anders Eckerström & Greta Lindström',
};

const eventUndatedDeath = {
  id: 'ev-3',
  event_type: 'death',
  date_type: 'exact',
  date_value: null,
  date_value_end: null,
  date_original: '',
  place_id: 'place-1',
  place_name: 'Stockholm',
  description: 'Drunknad',
  cause: null,
  citation_count: 0,
  participant_names: 'Erik Andersson',
};

describe('PlaceTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fixture deliberately unsorted so the chronological-order assertion
     // proves the sort actually fires (a pre-sorted fixture would pass even
     // if the sort were a no-op).
    (window as unknown as { api: unknown }).api = makeApi([
      eventMarriageApprox,
      eventUndatedDeath,
      eventBirth,
    ]);
  });

  it('renders one timeline-entry per dated event in chronological order', async () => {
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    const dated = wrapper.findAll('.timeline-track .timeline-entry');
    expect(dated).toHaveLength(2);
    expect(dated[0].text()).toContain('Anders Eckerström');
    expect(dated[1].text()).toContain('Greta Lindström');
  });

  it('renders undated events in a separate bucket', async () => {
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    const undated = wrapper.findAll('.timeline-undated .timeline-entry');
    expect(undated).toHaveLength(1);
    expect(undated[0].text()).toContain('Erik Andersson');
    expect(undated[0].classes()).toContain('is-undated');
  });

  it('shows a gap marker when consecutive dated events are >20 years apart', async () => {
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    const gaps = wrapper.findAll('.timeline-gap');
    expect(gaps).toHaveLength(1);
    // 1850 → 1880 is 30 years
    expect(gaps[0].text()).toContain('30');
  });

  it('marks approximate-date events with is-approximate class', async () => {
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    const dated = wrapper.findAll('.timeline-track .timeline-entry');
    // eventMarriageApprox is the second dated entry, date_type 'about'
    expect(dated[1].classes()).toContain('is-approximate');
  });

  it('uses event-type-specific dot color class', async () => {
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    const dots = wrapper.findAll('.timeline-track .timeline-dot');
    expect(dots[0].classes()).toContain('dot-birth');
    expect(dots[1].classes()).toContain('dot-marriage');
  });

  it('renders empty state when no events', async () => {
    (window as unknown as { api: unknown }).api = makeApi([]);
    const wrapper = mount(PlaceTimeline, {
      global: { plugins: [i18n] },
      props: { placeId: 'place-1' },
    });
    await flushPromises();

    expect(wrapper.findAll('.timeline-entry')).toHaveLength(0);
  });
});
