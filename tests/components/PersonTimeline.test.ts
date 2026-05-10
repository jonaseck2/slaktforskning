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

  it('renders self birth as the bare event-type label (no relational prefix)', async () => {
    const wrapper = mount(PersonTimeline, {
      global: { plugins: [i18n] },
      props: { personId: 'subject' },
    });
    await flushPromises();

    const entries = wrapper.findAll('.timeline-entry');
    expect(entries.length).toBeGreaterThan(0);

    // Self entry is the row that is NOT marked is-family. It carries the
    // bare event type ("Birth") in its event-badge — no "—" separator
    // (no kin name to suffix).
    const selfRow = entries.find(e => !e.classes().includes('is-family'))!;
    expect(selfRow.exists()).toBe(true);
    expect(selfRow.find('.event-badge').text()).toBe('Birth');
  });

  it('renders kin death as relational prefix + kin name in the event-badge', async () => {
    const wrapper = mount(PersonTimeline, {
      global: { plugins: [i18n] },
      props: { personId: 'subject' },
    });
    await flushPromises();

    const entries = wrapper.findAll('.timeline-entry');
    // Mother death is the only is-family Death row.
    const motherRow = entries.find(e =>
      e.classes().includes('is-family') && e.text().includes('Maria'),
    )!;
    expect(motherRow.exists()).toBe(true);
    // Spec: "Förälders död — Maria Bergström" / "Parent's death — Maria Bergström".
    // Composer collapses father/mother/parent → parentDeath label.
    expect(motherRow.find('.event-badge').text()).toBe(
      "Parent's death — Maria Bergström",
    );
    // The bare "Death" event-type should NOT appear standalone — the
    // reader must see the relationship.
    expect(motherRow.find('.event-badge').text()).not.toBe('Death');
  });

  it('renders kin birth as son-birth phrase + kin name', async () => {
    const wrapper = mount(PersonTimeline, {
      global: { plugins: [i18n] },
      props: { personId: 'subject' },
    });
    await flushPromises();

    const entries = wrapper.findAll('.timeline-entry');
    const familyBirthRow = entries.find(
      e => e.classes().includes('is-family') && e.text().includes('Erik'),
    )!;
    expect(familyBirthRow.exists()).toBe(true);
    expect(familyBirthRow.find('.event-badge').text()).toBe(
      "Son's birth — Erik Andersson",
    );
  });

  it('clicking a family entry routes to that person, not EventModal', async () => {
    const wrapper = mount(PersonTimeline, {
      global: { plugins: [i18n] },
      props: { personId: 'subject' },
    });
    await flushPromises();

    expect(wrapper.find('.modal-overlay').exists()).toBe(false);

    const familyBirthRow = wrapper.findAll('.timeline-entry').find(
      e => e.classes().includes('is-family') && e.text().includes('Erik'),
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
