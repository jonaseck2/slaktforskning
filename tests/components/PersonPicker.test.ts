import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonPicker from '../../src/renderer/components/PersonPicker.vue';
import { i18n } from './setup';

const people = [
  { id: 'p1', given_name: 'Anders', surname: 'Nilsson', preferred_name: null, nickname: null, sex: 'M' },
  { id: 'p2', given_name: 'Anna', surname: 'Svensson', preferred_name: null, nickname: null, sex: 'F' },
];

function mountPicker(props: Partial<{ modelValue: string | null; placeholder: string }> = {}) {
  return mount(PersonPicker, {
    global: { plugins: [i18n] },
    props: {
      modelValue: null,
      ...props,
    },
  });
}

describe('PersonPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (window as unknown as { api: unknown }).api = {
      persons: {
        search: vi.fn().mockResolvedValue(people),
        getNames: vi.fn().mockResolvedValue([{ given_name: 'Anders', surname: 'Nilsson', preferred_name: null }]),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an input with placeholder', () => {
    const wrapper = mountPicker({ placeholder: 'Pick a person' });
    const input = wrapper.find('input');
    expect(input.attributes('placeholder')).toBe('Pick a person');
  });

  it('shows no dropdown initially', () => {
    const wrapper = mountPicker();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('searches after typing and debounce', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    (input.element as HTMLInputElement).value = 'And';
    await input.trigger('input');

    // Advance past debounce (100ms)
    vi.advanceTimersByTime(150);
    await flushPromises();

    expect((window as any).api.persons.search).toHaveBeenCalledWith('And');
    expect(wrapper.findAll('[role="option"]')).toHaveLength(2);
  });

  it('does not search for queries shorter than 2 chars', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    (input.element as HTMLInputElement).value = 'A';
    await input.trigger('input');

    vi.advanceTimersByTime(150);
    await flushPromises();

    expect((window as any).api.persons.search).not.toHaveBeenCalled();
  });

  it('emits update:modelValue and select on selection', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    (input.element as HTMLInputElement).value = 'And';
    await input.trigger('input');
    vi.advanceTimersByTime(150);
    await flushPromises();

    const options = wrapper.findAll('[role="option"]');
    await options[0].trigger('mousedown');

    expect(wrapper.emitted('update:modelValue')![0][0]).toBe('p1');
    expect(wrapper.emitted('select')![0][0]).toMatchObject({ id: 'p1' });
  });

  it('keyboard ArrowDown/ArrowUp navigates options', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    (input.element as HTMLInputElement).value = 'An';
    await input.trigger('input');
    vi.advanceTimersByTime(150);
    await flushPromises();

    await input.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.find('.highlighted').exists()).toBe(true);

    await input.trigger('keydown', { key: 'ArrowDown' });
    const highlighted = wrapper.findAll('.highlighted');
    expect(highlighted).toHaveLength(1);

    await input.trigger('keydown', { key: 'ArrowUp' });
    // Should move back to first item
    const firstOption = wrapper.findAll('[role="option"]')[0];
    expect(firstOption.classes()).toContain('highlighted');
  });

  it('Enter selects highlighted option', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    (input.element as HTMLInputElement).value = 'An';
    await input.trigger('input');
    vi.advanceTimersByTime(150);
    await flushPromises();

    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
  });

  it('Escape closes dropdown', async () => {
    const wrapper = mountPicker();
    const input = wrapper.find('input');
    await input.trigger('focus');
    (input.element as HTMLInputElement).value = 'An';
    await input.trigger('input');
    vi.advanceTimersByTime(150);
    await flushPromises();

    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('clear button resets selection', async () => {
    const wrapper = mountPicker({ modelValue: 'p1' });
    await flushPromises();

    const clearBtn = wrapper.find('.picker-clear');
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger('click');

    expect(wrapper.emitted('update:modelValue')![0][0]).toBeNull();
  });

  it('loads person name when modelValue is set externally', async () => {
    const wrapper = mountPicker({ modelValue: 'p1' });
    await flushPromises();

    expect((window as any).api.persons.getNames).toHaveBeenCalledWith('p1');
  });
});
