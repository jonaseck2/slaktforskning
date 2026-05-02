import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonTimeline from '../../src/renderer/components/PersonTimeline.vue';
import { i18n } from './setup';

const routerPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}));

// Stub onDataChanged: useEntityData calls it; return a no-op unsubscribe.
// Stubs for EventModal's onMounted calls are included so the modal can mount
// without errors when a 'self' entry is clicked.
function makeApi(timelineEntries: unknown[]) {
  return {
    reports: {
      timeline: vi.fn().mockResolvedValue(timelineEntries),
    },
    onDataChanged: vi.fn().mockReturnValue(() => {}),
    db: {
      getSetting: vi.fn().mockResolvedValue(null),
    },
    relationships: {
      getForPerson: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    },
    persons: {
      getNames: vi.fn().mockResolvedValue([]),
    },
    citations: {
      forEvent: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    },
    sources: {
      get: vi.fn().mockResolvedValue(null),
    },
    events: {
      forPerson: vi.fn().mockResolvedValue([]),
    },
  };
}

const subjectBirth = {
  id: 'ev-self-birth',
  event_type: 'birth',
  date_type: 'exact',
  date_value: '1850-01-01',
  date_value_end: null,
  date_original: '1 januari 1850',
  place_id: null,
  place_name: null,
  place_address: null,
  description: '',
  cause: null,
  citation_count: 0,
  relationship_id: null,
  created_at: '',
  updated_at: '',
  place_path: null,
};

const motherDeath = {
  id: 'ev-mother-death',
  event_type: 'death',
  date_type: 'exact',
  date_value: '1880-06-15',
  date_value_end: null,
  date_original: '15 juni 1880',
  place_id: null,
  place_name: null,
  place_address: null,
  description: '',
  cause: null,
  citation_count: 0,
  relationship_id: null,
  created_at: '',
  updated_at: '',
  place_path: null,
};

const sonBirth = {
  id: 'ev-son-birth',
  event_type: 'birth',
  date_type: 'exact',
  date_value: '1885-04-04',
  date_value_end: null,
  date_original: '4 april 1885',
  place_id: null,
  place_name: null,
  place_address: null,
  description: '',
  cause: null,
  citation_count: 0,
  relationship_id: null,
  created_at: '',
  updated_at: '',
  place_path: null,
};

const timelineFixture = [
  {
    event: subjectBirth,
    person_id: 'subject',
    person_given_name: 'Anna',
    person_surname: 'Andersson',
    relationship_label: 'self',
  },
  {
    event: motherDeath,
    person_id: 'mom',
    person_given_name: 'Maria',
    person_surname: 'Bergström',
    relationship_label: 'mother',
  },
  {
    event: sonBirth,
    person_id: 'kid',
    person_given_name: 'Erik',
    person_surname: 'Andersson',
    relationship_label: 'son',
  },
];

describe('PersonTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerPush.mockClear();
    (window as unknown as { api: unknown }).api = makeApi(timelineFixture);
  });

  it('renders self entries with no relationship suffix', async () => {
    const wrapper = mount(PersonTimeline, {
      global: { plugins: [i18n] },
      props: { personId: 'subject' },
    });
    await flushPromises();

    // Find the self entry — its row should NOT contain "(mother)" or "(son)" suffixes.
    const entries = wrapper.findAll('.timeline-entry');
    expect(entries.length).toBeGreaterThan(0);

    // Birth row is the subject's own; it should have no .timeline-relationship span.
    const birthRow = entries.find(e => e.text().includes('Birth'))!;
    expect(birthRow.exists()).toBe(true);
    expect(birthRow.find('.timeline-relationship').exists()).toBe(false);
    expect(birthRow.classes()).not.toContain('is-family');
  });

  it('renders mother entry with name and (mother) suffix', async () => {
    const wrapper = mount(PersonTimeline, {
      global: { plugins: [i18n] },
      props: { personId: 'subject' },
    });
    await flushPromises();

    const entries = wrapper.findAll('.timeline-entry');
    // Mother death is the only "Death" row in the fixture.
    const motherRow = entries.find(e => e.text().includes('Death'))!;
    expect(motherRow.exists()).toBe(true);
    expect(motherRow.classes()).toContain('is-family');
    expect(motherRow.find('.timeline-family-name').text()).toContain('Maria');
    expect(motherRow.find('.timeline-relationship').text()).toBe('(mother)');
  });

  it('renders son entry with name and (son) suffix', async () => {
    const wrapper = mount(PersonTimeline, {
      global: { plugins: [i18n] },
      props: { personId: 'subject' },
    });
    await flushPromises();

    const entries = wrapper.findAll('.timeline-entry');
    // Two "Birth" rows: subject's own (1850) and son's (1885). Pick the family one.
    const familyBirthRow = entries.find(
      e => e.text().includes('Birth') && e.classes().includes('is-family'),
    )!;
    expect(familyBirthRow.exists()).toBe(true);
    expect(familyBirthRow.find('.timeline-family-name').text()).toContain('Erik');
    expect(familyBirthRow.find('.timeline-relationship').text()).toBe('(son)');
  });

  it('clicking a family entry routes to that person, not EventModal', async () => {
    const wrapper = mount(PersonTimeline, {
      global: { plugins: [i18n] },
      props: { personId: 'subject' },
    });
    await flushPromises();

    expect(wrapper.find('.modal-overlay').exists()).toBe(false);

    const familyBirthRow = wrapper.findAll('.timeline-entry').find(
      e => e.classes().includes('is-family') && e.text().includes('Birth'),
    )!;
    await familyBirthRow.trigger('click');
    await wrapper.vm.$nextTick();

    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith({
      name: 'persons',
      params: { personId: 'kid' },
    });
    // Family clicks must NOT open the event modal.
    expect(wrapper.find('.modal-overlay').exists()).toBe(false);
  });

  it('clicking a self entry opens EventModal, not the router', async () => {
    const wrapper = mount(PersonTimeline, {
      global: { plugins: [i18n] },
      props: { personId: 'subject' },
    });
    await flushPromises();

    const selfRow = wrapper.findAll('.timeline-entry').find(
      e => !e.classes().includes('is-family'),
    )!;
    await selfRow.trigger('click');
    await wrapper.vm.$nextTick();

    expect(routerPush).not.toHaveBeenCalled();
    // EventModal renders a .modal-overlay when shown.
    expect(wrapper.find('.modal-overlay').exists()).toBe(true);
  });

  it('calls reports.timeline (not events.forPerson) to load data', async () => {
    const apiObj = (window as unknown as { api: { reports: { timeline: ReturnType<typeof vi.fn> } } }).api;
    mount(PersonTimeline, {
      global: { plugins: [i18n] },
      props: { personId: 'subject' },
    });
    await flushPromises();
    expect(apiObj.reports.timeline).toHaveBeenCalledWith('subject');
  });
});
