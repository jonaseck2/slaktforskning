import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PlacePicker from '../../src/renderer/components/PlacePicker.vue';
import { i18n } from './setup';

const places = [
  { id: 'pl1', name: 'Stockholm', place_type: 'city', postal_code: null, city: null },
  { id: 'pl2', name: 'Strängnäs', place_type: 'socken', postal_code: null, city: null, parent_name: 'Södermanland' },
];

// Mock the gazetteer modules since PlacePicker uses usePlaceResolver
vi.mock('../../src/api/place-gazetteers/resolver', () => ({
  resolvePlace: vi.fn().mockReturnValue(null),
  resolveBoundary: vi.fn().mockReturnValue(null),
  searchGazetteer: vi.fn().mockReturnValue([]),
  resolveHierarchical: vi.fn().mockReturnValue({ best: null, candidates: [], tokens: [] }),
  tokenizePlaceString: vi.fn().mockImplementation((s: string) =>
    s ? s.split(',').map((p) => p.trim()).filter(Boolean) : [],
  ),
}));
vi.mock('../../src/api/place-gazetteers/index', () => ({
  loadGazetteers: vi.fn().mockReturnValue([]),
  getAllGazetteers: vi.fn().mockReturnValue([]),
}));

function mountPicker(props: Partial<{ modelValue: string | null; placeholder: string }> = {}) {
  return mount(PlacePicker, {
    global: { plugins: [i18n] },
    props: {
      modelValue: null,
      ...props,
    },
  });
}

describe('PlacePicker', async () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (window as unknown as { api: unknown }).api = {
      places: {
        search: vi.fn().mockResolvedValue(places),
        findOrCreate: vi.fn().mockResolvedValue({ id: 'pl-new', name: 'New Place' }),
        getPath: vi.fn().mockResolvedValue('Stockholm'),
        get: vi.fn().mockResolvedValue({ id: 'pl1', place_type: 'city', latitude: null, longitude: null }),
        update: vi.fn().mockResolvedValue({}),
      },
      db: {
        getSetting: vi.fn().mockResolvedValue(null),
        setSetting: vi.fn().mockResolvedValue(undefined),
      },
      gazetteers: {
        getImported: vi.fn().mockResolvedValue([]),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an input', () => {
    const wrapper = mountPicker({ placeholder: 'Pick a place' });
    expect(wrapper.find('input').attributes('placeholder')).toBe('Pick a place');
  });

  it('shows no dropdown initially', () => {
    const wrapper = mountPicker();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('searches after typing and debounce', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Sto');

    vi.advanceTimersByTime(200);
    await flushPromises();

    expect((window as any).api.places.search).toHaveBeenCalledWith('Sto');
    const options = wrapper.findAll('[role="option"]');
    // 2 db results + 1 "create new" option
    expect(options.length).toBeGreaterThanOrEqual(2);
  });

  it('emits update:modelValue on selection', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Sto');
    vi.advanceTimersByTime(200);
    await flushPromises();

    const options = wrapper.findAll('[role="option"]');
    await options[0].trigger('mousedown');
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')![0][0]).toBe('pl1');
  });

  it('shows "create new" option when query does not match existing', async () => {
    (window as any).api.places.search.mockResolvedValue([]);
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Nyköping');
    vi.advanceTimersByTime(200);
    await flushPromises();

    const createNew = wrapper.find('.create-new');
    expect(createNew.exists()).toBe(true);
  });

  it('creates new place when "create new" is clicked', async () => {
    (window as any).api.places.search.mockResolvedValue([]);
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Nyköping');
    vi.advanceTimersByTime(200);
    await flushPromises();

    const createNew = wrapper.find('.create-new');
    await createNew.trigger('mousedown');
    await flushPromises();

    expect((window as any).api.places.findOrCreate).toHaveBeenCalledWith('Nyköping');
  });

  it('keyboard ArrowDown/Enter selects option', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Sto');
    vi.advanceTimersByTime(200);
    await flushPromises();

    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
  });

  it('Escape closes dropdown', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Sto');
    vi.advanceTimersByTime(200);
    await flushPromises();

    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('loads place path when modelValue is set', async () => {
    const _wrapper = mountPicker({ modelValue: 'pl1' });
    await flushPromises();

    expect((window as any).api.places.getPath).toHaveBeenCalledWith('pl1');
  });

  it('preserves typed text when user edits the field after picking a suggestion (BENGT #73)', async () => {
    // User goal: type "Järf" → pick "Järfälla, Stockholms län, Sweden, Europe"
    // → place cursor at end → press Backspace once. Only the trailing
    // character is removed; the whole field MUST NOT clear.
    //
    // Reproduces the regression where the modelValue watcher cleared
    // `query.value` whenever the parent unbound the place id — including
    // when the unbind was caused by the user's own edit (handled by
    // onInput before the modelValue change reaches us).
    (window as any).api.places.getPath.mockResolvedValue('Järfälla, Stockholms län, Sweden, Europe');

    const wrapper = mountPicker({ modelValue: 'pl-jarfalla' });
    await flushPromises();

    const input = wrapper.find('input');
    expect((input.element as HTMLInputElement).value).toBe('Järfälla, Stockholms län, Sweden, Europe');

    // Simulate Backspace at the trailing edge: input value becomes the
    // resolved path minus its last character, the @input handler fires.
    const trimmed = 'Järfälla, Stockholms län, Sweden, Europ';
    await input.setValue(trimmed);
    await flushPromises();

    // onInput should have unbound modelValue (user is editing away from the
    // resolved path) — verify the unbind happened.
    const emits = wrapper.emitted('update:modelValue') ?? [];
    expect(emits.some(e => e[0] === null)).toBe(true);

    // Now propagate the unbind back through the modelValue prop, the way a
    // real parent (e.g. EventModal) would via v-model.
    await wrapper.setProps({ modelValue: null });
    await flushPromises();

    // CRITICAL: the visible field must still reflect what the user typed,
    // not be blanked by the modelValue=null watcher.
    expect((input.element as HTMLInputElement).value).toBe(trimmed);
  });

  it('clears the field when parent programmatically nulls modelValue (e.g. Reset button)', async () => {
    // Counterpart to the BENGT #73 test: when modelValue goes null and the
    // query still matches the last resolved path (i.e. the user did NOT
    // edit the field), clearing the field is the right behavior — that's
    // a parent-driven reset, not user typing.
    (window as any).api.places.getPath.mockResolvedValue('Stockholm');

    const wrapper = mountPicker({ modelValue: 'pl1' });
    await flushPromises();

    const input = wrapper.find('input');
    expect((input.element as HTMLInputElement).value).toBe('Stockholm');

    // Parent resets — query was untouched, equals lastResolvedPath.
    await wrapper.setProps({ modelValue: null });
    await flushPromises();

    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('shows parent name in subtitle', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Strä');
    vi.advanceTimersByTime(200);
    await flushPromises();

    const subtitles = wrapper.findAll('.place-subtitle');
    expect(subtitles.some(s => s.text().includes('Södermanland'))).toBe(true);
  });
});
