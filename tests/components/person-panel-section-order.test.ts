/**
 * Asserts that PersonPanel renders section headers in the order that places
 * authored data first and derived/computed views (Timeline, Life Map) below
 * them, immediately before Research (Tasks) and Quality.
 *
 * Ben rapport 105: "authored data first and derived views (Tidslinje, Livskarta)
 * below them right before Fortsatt forskning and Kvalitet."
 *
 * Expected order fragment asserted here:
 *   Notes ("Notes") < Timeline ("Timeline") < Life map ("Life map") < Research ("Tasks")
 *
 * The real section-title CSS class is `.section-title` (from SectionHeader.vue
 * `<span class="section-title">{{ title }}</span>`).
 *
 * Mounting approach: personId must be non-null and the api stubs must return a
 * person object so that `<template v-if="person">` renders the section blocks.
 * All sections render their SectionHeader unconditionally (headers are always
 * visible; only the section body is gated by v-if/v-show). We await
 * flushPromises() so the async loader completes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { i18n } from './setup';
import PersonPanel from '../../src/renderer/components/PersonPanel.vue';

// PersonPanel uses useRouter() — stub it so the component mounts without
// "injection Symbol(router) not found" Vue warnings.
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const STUB_PERSON_ID = 'test-person-001';

// Minimal window.api stub: returns enough for the PersonPanel loader to
// resolve a non-null person, causing `v-if="person"` to render all sections.
function makeApi() {
  return {
    onDataChanged: vi.fn(),
    offDataChanged: vi.fn(),
    persons: {
      get: vi.fn().mockResolvedValue({
        id: STUB_PERSON_ID,
        sex: 'U',
        living: false,
        display_id: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      }),
      getNames: vi.fn().mockResolvedValue([]),
    },
    events: { forPerson: vi.fn().mockResolvedValue([]) },
    groups: { forPerson: vi.fn().mockResolvedValue([]) },
    relationships: { getForPerson: vi.fn().mockResolvedValue([]) },
    media: { forEntity: vi.fn().mockResolvedValue([]) },
    places: { get: vi.fn().mockResolvedValue(null) },
  };
}

describe('PersonPanel section order (Ben rapport 105)', () => {
  beforeEach(() => {
    (window as unknown as { api: unknown }).api = makeApi();
  });

  it('renders Notes before Timeline before Life map before Research (Tasks)', async () => {
    const w = mount(PersonPanel as unknown as Parameters<typeof mount>[0], {
      global: { plugins: [i18n] },
      props: { personId: STUB_PERSON_ID },
    });

    // Wait for the async loader to complete so v-if="person" becomes true
    // and all section headers render.
    await flushPromises();

    // Query all rendered section-title spans in document order.
    // SectionHeader.vue renders: <span class="section-title">{{ title }}</span>
    const titleEls = w.findAll('.section-title');
    const titles = titleEls.map(el => el.text());

    const idxNotes    = titles.indexOf('Notes');
    const idxTimeline = titles.indexOf('Timeline');
    const idxMap      = titles.indexOf('Life map');
    const idxResearch = titles.indexOf('Tasks');

    // All four must be present.
    expect(idxNotes,    'Notes section title not found').toBeGreaterThanOrEqual(0);
    expect(idxTimeline, 'Timeline section title not found').toBeGreaterThanOrEqual(0);
    expect(idxMap,      'Life map section title not found').toBeGreaterThanOrEqual(0);
    expect(idxResearch, 'Tasks (research) section title not found').toBeGreaterThanOrEqual(0);

    // Ordered: Notes < Timeline < Life map < Research.
    expect(idxNotes,    `Notes(${idxNotes}) must come before Timeline(${idxTimeline})`).toBeLessThan(idxTimeline);
    expect(idxTimeline, `Timeline(${idxTimeline}) must come before Life map(${idxMap})`).toBeLessThan(idxMap);
    expect(idxMap,      `Life map(${idxMap}) must come before Tasks/Research(${idxResearch})`).toBeLessThan(idxResearch);
  });
});
