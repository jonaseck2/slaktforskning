import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SourceModal from '../../src/renderer/components/modals/SourceModal.vue';
import PersonNameModal from '../../src/renderer/components/modals/PersonNameModal.vue';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';
import EventParticipantsSection from '../../src/renderer/components/EventParticipantsSection.vue';
import ResearchTaskModal from '../../src/renderer/components/modals/ResearchTaskModal.vue';
import RelationshipModal from '../../src/renderer/components/modals/RelationshipModal.vue';
import { i18n } from './setup';

/**
 * Plan: 2026-05-19-gedcom-alignment T14/T15/T16/T17/T18/T19.
 *
 * User goal: the user can author, view, edit, and remove every primitive the
 * data model owns. No silent data loss; columns that round-trip cleanly in the
 * GEDCOM fidelity registry must have a UI entry point. These tests assert
 * each newly-surfaced buried field renders + persists through save.
 */

function stubApi(extra: Record<string, unknown> = {}) {
  (window as unknown as { api: unknown }).api = {
    sources: {
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'src-1', title: '' }),
      update: vi.fn().mockResolvedValue({ id: 'src-1', title: '' }),
    },
    events: {
      forPerson: vi.fn().mockResolvedValue([]),
      forRelationship: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'ev-1' }),
      update: vi.fn().mockResolvedValue({ id: 'ev-1' }),
    },
    citations: {
      forEvent: vi.fn().mockResolvedValue([]),
      forPersonName: vi.fn().mockResolvedValue([]),
    },
    eventParticipants: {
      getForEvent: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue({ id: 'ep-1' }),
      update: vi.fn().mockResolvedValue({ id: 'ep-1' }),
      remove: vi.fn().mockResolvedValue(true),
    },
    persons: {
      getNames: vi.fn().mockResolvedValue([]),
      addName: vi.fn().mockResolvedValue({ id: 'pn-1' }),
    },
    relationships: {
      getForPerson: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    },
    db: {
      getSetting: vi.fn().mockResolvedValue(null),
    },
    researchTasks: {
      create: vi.fn().mockResolvedValue({ id: 'rt-1' }),
      update: vi.fn().mockResolvedValue({ id: 'rt-1' }),
      addLink: vi.fn().mockResolvedValue(null),
    },
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
    ...extra,
  };
}

describe('T14 — SourceModal surfaces call_number and abstract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('renders call_number and abstract fields and passes their values to sources.create', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 'src-1', title: 'A' });
    stubApi({ sources: { get: vi.fn(), create: createMock, update: vi.fn() } });

    const wrapper = mount(SourceModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    const callNumberInput = wrapper.find('#source-field-7');
    expect(callNumberInput.exists()).toBe(true);
    const abstractTextarea = wrapper.find('#source-field-8');
    expect(abstractTextarea.exists()).toBe(true);

    await wrapper.find('#source-field-1').setValue('My Source');
    await callNumberInput.setValue('Cit.123');
    await abstractTextarea.setValue('A brief summary');

    // Trigger save via the BaseSubPanel's save emit.
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save?.();
    await flushPromises();

    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.call_number).toBe('Cit.123');
    expect(payload.abstract).toBe('A brief summary');
  });
});

describe('T15 — PlaceFormFields exposes street/city/country/dates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('renders the address-details and lifecycle-dates collapsible inputs', async () => {
    // Import PlaceFormFields lazily so it picks up the test i18n.
    const PlaceFormFields = (await import('../../src/renderer/components/PlaceFormFields.vue')).default;
    const wrapper = mount(PlaceFormFields, {
      global: { plugins: [i18n] },
      props: {
        form: {
          place_type: null,
          parent_place_id: null,
          latitude: null,
          longitude: null,
          street: 'Main St',
          postal_code: '12345',
          city: 'Stockholm',
          country: 'Sweden',
          date_from: '1700',
          date_to: '1900',
        },
        resolvedMatch: null,
        resolvedTypeLabel: null,
        resolvedParentPath: null,
      },
    });
    await flushPromises();

    expect((wrapper.find('#place-street').element as HTMLInputElement).value).toBe('Main St');
    expect((wrapper.find('#place-postal-code').element as HTMLInputElement).value).toBe('12345');
    expect((wrapper.find('#place-city').element as HTMLInputElement).value).toBe('Stockholm');
    expect((wrapper.find('#place-country').element as HTMLInputElement).value).toBe('Sweden');
    expect((wrapper.find('#place-date-from').element as HTMLInputElement).value).toBe('1700');
    expect((wrapper.find('#place-date-to').element as HTMLInputElement).value).toBe('1900');
  });
});

describe('T16 — PersonNameModal surfaces prefix/suffix/qualifier out of <details>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('renders prefix, suffix and qualifier outside any open=false <details> block', async () => {
    const wrapper = mount(PersonNameModal, {
      global: { plugins: [i18n] },
      props: { personId: 'p-1' },
    });
    await flushPromises();

    // Each of prefix / suffix / qualifier is in the DOM at all (not v-if hidden).
    const prefix = wrapper.find('#personname-field-5');
    const suffix = wrapper.find('#personname-field-6');
    const qualifier = wrapper.find('#personname-field-3');
    expect(prefix.exists()).toBe(true);
    expect(suffix.exists()).toBe(true);
    expect(qualifier.exists()).toBe(true);

    // None of them are nested inside a <details> ancestor — they're surfaced.
    function hasDetailsAncestor(el: Element | null): boolean {
      let cur = el?.parentElement ?? null;
      while (cur) {
        if (cur.tagName.toLowerCase() === 'details') return true;
        cur = cur.parentElement;
      }
      return false;
    }
    expect(hasDetailsAncestor(prefix.element)).toBe(false);
    expect(hasDetailsAncestor(suffix.element)).toBe(false);
    expect(hasDetailsAncestor(qualifier.element)).toBe(false);
  });
});

describe('T17 — EventModal exposes place_address and unconditional cause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('renders place_address textarea and cause input for any (non-death) event type', async () => {
    const wrapper = mount(EventModal, {
      global: { plugins: [i18n] },
      props: {
        mode: 'standalone',
        editingEvent: {
          id: 'ev-1',
          event_type: 'birth',
          date_type: 'exact',
          date_value: null,
          date_value_end: null,
          date_original: '',
          place_id: null,
          place_address: '12 Main St',
          cause: null,
          value: null,
          notes: '',
        },
      },
    });
    await flushPromises();

    const placeAddress = wrapper.find('[data-testid="event-place-address-field"] textarea');
    expect(placeAddress.exists()).toBe(true);
    expect((placeAddress.element as HTMLTextAreaElement).value).toBe('12 Main St');

    // cause field is visible even for non-death events now (T17).
    const causeField = wrapper.find('[data-testid="event-cause-field"]');
    expect(causeField.exists()).toBe(true);
  });
});

describe('T18 — EventParticipantsSection renders a role picker per participant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi({
      eventParticipants: {
        getForEvent: vi.fn().mockResolvedValue([
          { id: 'p-row-1', event_id: 'ev-1', person_id: 'person-a', role: 'godparent' },
        ]),
        add: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 'p-row-1', role: 'witness' }),
        remove: vi.fn(),
      },
      persons: {
        getNames: vi.fn().mockResolvedValue([{
          id: 'n-1', given_name: 'Anna', surname: 'Andersson',
          preferred_name: null, nickname: null,
          sort_order: 0, name_type: 'birth', date_from: null,
        }]),
      },
      events: { forPerson: vi.fn().mockResolvedValue([]) },
    });
  });

  it('shows a <select> bound to the participant role with all role values', async () => {
    const wrapper = mount(EventParticipantsSection, {
      global: { plugins: [i18n] },
      props: { eventId: 'ev-1', excludePersonIds: [] },
    });
    await flushPromises();

    const roleSelect = wrapper.find('select.ep-participant-role');
    expect(roleSelect.exists()).toBe(true);
    expect((roleSelect.element as HTMLSelectElement).value).toBe('godparent');

    // Eight role values surfaced as options.
    const options = roleSelect.findAll('option');
    expect(options.length).toBe(8);
    const values = options.map(o => (o.element as HTMLOptionElement).value);
    expect(values).toEqual(expect.arrayContaining([
      'primary', 'spouse', 'parent', 'child', 'witness', 'godparent', 'officiant', 'other',
    ]));

    // Changing the value calls eventParticipants.update with the new role.
    await roleSelect.setValue('witness');
    await flushPromises();
    const updateMock = (window as unknown as { api: { eventParticipants: { update: ReturnType<typeof vi.fn> } } })
      .api.eventParticipants.update;
    expect(updateMock).toHaveBeenCalledWith('p-row-1', { role: 'witness' });
  });
});

describe('T19.1 — ResearchTaskModal shows result regardless of status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('renders the result textarea even when status is "open"', async () => {
    const wrapper = mount(ResearchTaskModal, {
      global: { plugins: [i18n] },
      props: {
        mode: 'standalone',
        editingTask: {
          id: 'rt-1',
          task: 'Hunt the missing birth record',
          status: 'open',
          priority: 1,
          notes: '',
          result: 'Interim: searched ArkivDigital, no match.',
        },
      },
    });
    await flushPromises();

    const resultTextarea = wrapper.find('#researchtask-field-3');
    expect(resultTextarea.exists()).toBe(true);
    expect((resultTextarea.element as HTMLTextAreaElement).value).toContain('ArkivDigital');
  });
});

describe('T19.2 — RelationshipModal exposes subtype for non-couple/non-parent_child types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('shows a free-text subtype input when the type is "sibling"', async () => {
    const wrapper = mount(RelationshipModal, {
      global: { plugins: [i18n] },
      props: {
        mode: 'standalone',
        editingRelationship: {
          id: 'rel-1',
          type: 'sibling',
          person1_id: 'p-1',
          person2_id: 'p-2',
          subtype: 'half',
          notes: null,
        },
      },
    });
    await flushPromises();

    const subtypeFree = wrapper.find('#relationship-field-subtype-free');
    expect(subtypeFree.exists()).toBe(true);
    expect((subtypeFree.element as HTMLInputElement).value).toBe('half');
  });
});
