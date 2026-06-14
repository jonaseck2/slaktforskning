import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PersonsListTab from '../../src/renderer/views/PersonsListTab.vue';
import { i18n } from './setup';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/**
 * Regression: searching the embedded persons list down to zero matches must
 * NOT swap the whole list for the "add your first person" welcome empty state.
 * The user has to be able to clear/retype their search — so the filter input
 * stays, and a distinct "no matches" message is shown instead.
 */
describe('PersonsListTab — search with zero matches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
    (window as unknown as { api: unknown }).api = {
      persons: {
        // Empty query → the DB has people. Any non-empty query → no matches.
        listPage: vi.fn(async (_l: number, _o: number, _sb: string, _sd: string, query: string) => {
          if (query && query.trim() !== '') return { persons: [], total: 0 };
          return {
            persons: [
              { id: 'p1', sex: 'M', display_id: 1, given_name: 'Anders', surname: 'Andersson', preferred_name: null, nickname: null, birth_surname: null, birth_date: null, birth_place: null, death_date: null, death_place: null, name_count: 1, event_count: 0, relationship_count: 0, media_count: 0, group_count: 0, task_count: 0, quality_count: 0 },
            ],
            total: 1,
          };
        }),
      },
      onDataChanged: vi.fn(),
      offDataChanged: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the filter input and shows a no-matches message, not the welcome empty state', async () => {
    const wrapper = mount(PersonsListTab, {
      props: { embedded: true },
      global: { plugins: [i18n, createPinia()] },
    });
    await flushPromises();

    // Initial load: filter input present, one row.
    const input = wrapper.find('.list-filter-input');
    expect(input.exists()).toBe(true);

    // Type a query that matches nobody.
    await input.setValue('zzzzz');
    await vi.advanceTimersByTimeAsync(300); // past the 200 ms debounce
    await flushPromises();

    // Filter input must still be present so the user can clear/retype.
    expect(wrapper.find('.list-filter-input').exists()).toBe(true);

    // The "add your first person" welcome CTA must NOT be shown.
    const text = wrapper.text();
    expect(text).not.toContain('Add your first person to start building your family tree.');

    // A distinct "no matches" message must be shown.
    expect(text.toLowerCase()).toContain('no');
  });
});
