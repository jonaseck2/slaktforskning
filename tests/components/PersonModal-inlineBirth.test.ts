import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonModal from '../../src/renderer/components/modals/PersonModal.vue';
import { i18n } from './setup';

/**
 * User goal: when adding a new person via "Hantera person → Lägg till
 * förälder → Ny person" (or any "+ Ny person" entry point), the genealogist
 * should be able to enter the new person's birth date and birth place IN THE
 * SAME modal step, before pressing Save. Birth is the most-likely-known fact
 * about a newly-added person; making it a separate step doubles the click
 * cost.
 *
 * The save handler routes both the person and the optional birth event
 * through `persons.createWithEvent`, the existing transactional workflow that
 * inserts the participant link automatically — exactly the shape the plan's
 * "two IPCs" verification asserts (one round-trip, atomic).
 */
describe('PersonModal — inline birth event on create', async () => {
  let createWithEventMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    createWithEventMock = vi.fn().mockResolvedValue({
      person: { id: 'new-person-id', sex: 'M', living: true },
      event: null,
      citation: null,
    });
    (window as unknown as { api: unknown }).api = {
      persons: {
        createWithEvent: createWithEventMock,
        get: vi.fn().mockResolvedValue({ id: 'existing-id', sex: 'U', living: true }),
        getNames: vi.fn().mockResolvedValue([]),
        listPage: vi.fn().mockResolvedValue({ persons: [], total: 0 }),
      },
      relationships: {
        create: vi.fn().mockResolvedValue({ id: 'r1' }),
        getForPerson: vi.fn().mockResolvedValue([]),
      },
      events: {
        forPerson: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'e1' }),
      },
      sources: { list: vi.fn().mockResolvedValue([]) },
      places: {
        search: vi.fn().mockResolvedValue([]),
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        getPath: vi.fn().mockResolvedValue(null),
      },
      gazetteers: {
        listMounted: vi.fn().mockResolvedValue([]),
        list: vi.fn().mockResolvedValue([]),
      },
      db: { getSetting: vi.fn().mockResolvedValue(null) },
    };
  });

  it('save fires createWithEvent with a birth-event payload when both date and place are filled', async () => {
    const wrapper = mount(PersonModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    // Fill given_name (gates Save).
    const nameInputs = wrapper.findAll('input.ep-input--name');
    expect(nameInputs.length).toBeGreaterThanOrEqual(2);
    await nameInputs[0].setValue('Anna');
    await flushPromises();

    // Fill the inline birth date field. SimpleDateInput renders a free-text
    // input below the .ep-birth-grid; find by class.
    const dateInput = wrapper.find('.ep-birth-grid input.date-text');
    expect(dateInput.exists()).toBe(true);
    await dateInput.setValue('1923-08-12');

    // Simulate the PlacePicker selecting a place by emitting update:modelValue.
    // Multiple PlacePickers may be present (sub-panels) — pick the one inside
    // the birth grid.
    const placePicker = wrapper.findComponent({ name: 'PlacePicker' });
    expect(placePicker.exists()).toBe(true);
    await placePicker.vm.$emit('update:modelValue', 'place-id-42');
    await flushPromises();

    // Click save.
    const saveBtn = wrapper.find('button.ep-save-btn');
    expect(saveBtn.exists()).toBe(true);
    expect(saveBtn.attributes('disabled')).toBeUndefined();
    await saveBtn.trigger('click');
    await flushPromises();

    expect(createWithEventMock).toHaveBeenCalledTimes(1);
    const payload = createWithEventMock.mock.calls[0][0];
    expect(payload.given_name).toBe('Anna');
    expect(payload.event).toBeDefined();
    expect(payload.event.event_type).toBe('birth');
    expect(payload.event.date_original).toBe('1923-08-12');
    // Full ISO date → both date_original and date_value are populated. The
    // workflow inserts the event participant (role: 'primary') automatically.
    expect(payload.event.date_value).toBe('1923-08-12');
    expect(payload.event.place_id).toBe('place-id-42');
  });

  it('save skips the event entirely when both birth fields are empty', async () => {
    const wrapper = mount(PersonModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    const nameInputs = wrapper.findAll('input.ep-input--name');
    await nameInputs[0].setValue('Bertil');
    await flushPromises();

    const saveBtn = wrapper.find('button.ep-save-btn');
    await saveBtn.trigger('click');
    await flushPromises();

    expect(createWithEventMock).toHaveBeenCalledTimes(1);
    const payload = createWithEventMock.mock.calls[0][0];
    expect(payload.given_name).toBe('Bertil');
    // Event is omitted entirely — no toast, no error, no empty event.
    expect(payload.event).toBeUndefined();
  });

  it('Prime Directive: free-text date keeps date_original verbatim and leaves date_value null', async () => {
    const wrapper = mount(PersonModal, {
      global: { plugins: [i18n] },
      props: { mode: 'standalone' },
    });
    await flushPromises();

    const nameInputs = wrapper.findAll('input.ep-input--name');
    await nameInputs[0].setValue('Carl');
    await flushPromises();

    // SimpleDateInput sanitises to digits + dashes, so feed a partial-ISO that
    // survives sanitisation but is not a full YYYY-MM-DD date.
    const dateInput = wrapper.find('.ep-birth-grid input.date-text');
    await dateInput.setValue('1850');
    await flushPromises();

    const saveBtn = wrapper.find('button.ep-save-btn');
    await saveBtn.trigger('click');
    await flushPromises();

    const payload = createWithEventMock.mock.calls[0][0];
    expect(payload.event).toBeDefined();
    expect(payload.event.date_original).toBe('1850');
    // We never invent a "best guess" ISO — that would be inferred persistence.
    expect(payload.event.date_value).toBeNull();
  });
});
