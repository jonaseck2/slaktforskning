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

describe('PlacePicker', () => {
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
    const wrapper = mountPicker({ modelValue: 'pl1' });
    await flushPromises();

    expect((window as any).api.places.getPath).toHaveBeenCalledWith('pl1');
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
