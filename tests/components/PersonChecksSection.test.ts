import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonChecksSection from '../../src/renderer/components/PersonChecksSection.vue';
import { i18n } from './setup';

describe('PersonChecksSection fix actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      checks: {
        forPerson: vi.fn().mockResolvedValue([
          { code: 'NO_BIRTH_EVENT', severity: 'notice', message: 'No birth event', personIds: ['p1'] },
          { code: 'NO_PARENTS', severity: 'notice', message: 'No parents', personIds: ['p1'] },
          { code: 'BIRTH_AFTER_DEATH', severity: 'error', message: 'Birth after death', personIds: ['p1'] },
        ]),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mountAndLoad(personId = 'p1') {
    const wrapper = mount(PersonChecksSection, {
      global: { plugins: [i18n] },
      props: { personId },
    });
    vi.advanceTimersByTime(1500);
    await flushPromises();
    return wrapper;
  }

  it('emits fix event when clicking a row with a fix action', async () => {
    const wrapper = await mountAndLoad();

    const rows = wrapper.findAll('tbody tr');
    expect(rows.length).toBe(3);

    // First row: NO_BIRTH_EVENT — has fix action, should be clickable
    await rows[0].trigger('click');
    expect(wrapper.emitted('fix')).toBeTruthy();
    expect(wrapper.emitted('fix')![0]).toEqual(['add-birth-event']);
  });

  it('emits correct fix action for NO_PARENTS', async () => {
    const wrapper = await mountAndLoad();

    const rows = wrapper.findAll('tbody tr');
    // Second row: NO_PARENTS
    await rows[1].trigger('click');
    expect(wrapper.emitted('fix')![0]).toEqual(['add-father']);
  });

  it('does not emit fix for checks without a fix action', async () => {
    const wrapper = await mountAndLoad();

    const rows = wrapper.findAll('tbody tr');
    // Third row: BIRTH_AFTER_DEATH — no fix action
    await rows[2].trigger('click');
    expect(wrapper.emitted('fix')).toBeFalsy();
  });

  it('clickable rows have the clickable-row class', async () => {
    const wrapper = await mountAndLoad();

    const rows = wrapper.findAll('tbody tr');
    expect(rows[0].classes()).toContain('clickable-row'); // NO_BIRTH_EVENT
    expect(rows[1].classes()).toContain('clickable-row'); // NO_PARENTS
    expect(rows[2].classes()).not.toContain('clickable-row'); // BIRTH_AFTER_DEATH
  });
});
