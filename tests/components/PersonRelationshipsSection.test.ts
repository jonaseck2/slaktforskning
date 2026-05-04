import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PersonRelationshipsSection from '../../src/renderer/components/PersonRelationshipsSection.vue';
import { i18n } from './setup';

// Fixture: focal person F has bio mom + bio dad, two partners with shared
// children, plus a godparent. After the sort, the rendered DOM order must
// match the spec.

const FOCAL = 'F';

interface MockRel {
  id: string;
  type: string;
  subtype: string | null;
  person1_id: string | null;
  person2_id: string | null;
}

const RELS_BY_PERSON: Record<string, MockRel[]> = {
  // Focal's own relations
  [FOCAL]: [
    // Insertion order intentionally jumbled
    { id: 'r-mom',  type: 'parent_child', subtype: 'biological', person1_id: 'mom', person2_id: FOCAL },
    { id: 'r-p2',   type: 'couple',       subtype: 'marriage',   person1_id: FOCAL, person2_id: 'p2' },
    { id: 'r-c1',   type: 'parent_child', subtype: 'biological', person1_id: FOCAL, person2_id: 'c1' },
    { id: 'r-dad',  type: 'parent_child', subtype: 'biological', person1_id: 'dad', person2_id: FOCAL },
    { id: 'r-c2',   type: 'parent_child', subtype: 'biological', person1_id: FOCAL, person2_id: 'c2' },
    { id: 'r-p1',   type: 'couple',       subtype: 'marriage',   person1_id: FOCAL, person2_id: 'p1' },
    { id: 'r-gp',   type: 'godparent',    subtype: null,         person1_id: FOCAL, person2_id: 'gp' },
    { id: 'r-c3',   type: 'parent_child', subtype: 'biological', person1_id: FOCAL, person2_id: 'c3' },
  ],
  // Children's incoming parent_child rows — used to resolve "other parent"
  c1: [
    { id: 'r-c1-F',  type: 'parent_child', subtype: 'biological', person1_id: FOCAL, person2_id: 'c1' },
    { id: 'r-c1-p1', type: 'parent_child', subtype: 'biological', person1_id: 'p1',  person2_id: 'c1' },
  ],
  c2: [
    { id: 'r-c2-F',  type: 'parent_child', subtype: 'biological', person1_id: FOCAL, person2_id: 'c2' },
    { id: 'r-c2-p1', type: 'parent_child', subtype: 'biological', person1_id: 'p1',  person2_id: 'c2' },
  ],
  c3: [
    { id: 'r-c3-F',  type: 'parent_child', subtype: 'biological', person1_id: FOCAL, person2_id: 'c3' },
    { id: 'r-c3-p2', type: 'parent_child', subtype: 'biological', person1_id: 'p2',  person2_id: 'c3' },
  ],
};

const PERSONS: Record<string, { id: string; sex: 'M' | 'F' | 'U' }> = {
  dad: { id: 'dad', sex: 'M' },
  mom: { id: 'mom', sex: 'F' },
  p1:  { id: 'p1',  sex: 'F' },
  p2:  { id: 'p2',  sex: 'F' },
  c1:  { id: 'c1',  sex: 'M' },
  c2:  { id: 'c2',  sex: 'F' },
  c3:  { id: 'c3',  sex: 'M' },
  gp:  { id: 'gp',  sex: 'F' },
};

const NAMES: Record<string, Array<{ id: string; given_name: string; surname: string; preferred_name: null; nickname: null; name_prefix: null; name_suffix: null; sort_order: number; name_type: string; date_from: null }>> = {
  dad: [{ id: 'n-dad', given_name: 'Far', surname: 'Andersson', preferred_name: null, nickname: null, name_prefix: null, name_suffix: null, sort_order: 0, name_type: 'birth', date_from: null }],
  mom: [{ id: 'n-mom', given_name: 'Mor', surname: 'Andersson', preferred_name: null, nickname: null, name_prefix: null, name_suffix: null, sort_order: 0, name_type: 'birth', date_from: null }],
  p1:  [{ id: 'n-p1',  given_name: 'Anna', surname: 'Karlsson', preferred_name: null, nickname: null, name_prefix: null, name_suffix: null, sort_order: 0, name_type: 'birth', date_from: null }],
  p2:  [{ id: 'n-p2',  given_name: 'Berta', surname: 'Larsson', preferred_name: null, nickname: null, name_prefix: null, name_suffix: null, sort_order: 0, name_type: 'birth', date_from: null }],
  c1:  [{ id: 'n-c1',  given_name: 'Erik', surname: 'A', preferred_name: null, nickname: null, name_prefix: null, name_suffix: null, sort_order: 0, name_type: 'birth', date_from: null }],
  c2:  [{ id: 'n-c2',  given_name: 'Eva', surname: 'A', preferred_name: null, nickname: null, name_prefix: null, name_suffix: null, sort_order: 0, name_type: 'birth', date_from: null }],
  c3:  [{ id: 'n-c3',  given_name: 'Gustav', surname: 'A', preferred_name: null, nickname: null, name_prefix: null, name_suffix: null, sort_order: 0, name_type: 'birth', date_from: null }],
  gp:  [{ id: 'n-gp',  given_name: 'Hilda', surname: 'Svensson', preferred_name: null, nickname: null, name_prefix: null, name_suffix: null, sort_order: 0, name_type: 'birth', date_from: null }],
};

const PERSON_EVENTS: Record<string, Array<{ event_type: string; date_value: string | null }>> = {
  dad: [{ event_type: 'birth', date_value: '1810-01-01' }],
  mom: [{ event_type: 'birth', date_value: '1812-01-01' }],
  p1:  [{ event_type: 'birth', date_value: '1838-04-04' }],
  p2:  [{ event_type: 'birth', date_value: '1840-09-09' }],
  c1:  [{ event_type: 'birth', date_value: '1841-01-01' }],  // p1's child
  c2:  [{ event_type: 'birth', date_value: '1843-06-15' }],  // p1's child (younger)
  c3:  [{ event_type: 'birth', date_value: '1862-03-03' }],  // p2's child
  gp:  [],
};

const REL_EVENTS: Record<string, Array<{ event_type: string; date_value: string | null }>> = {
  // Couple start dates
  'r-p1': [{ event_type: 'marriage', date_value: '1840-06-15' }],
  'r-p2': [{ event_type: 'marriage', date_value: '1861-09-01' }],
};

describe('PersonRelationshipsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      relationships: {
        getForPerson: vi.fn((id: string) => Promise.resolve(RELS_BY_PERSON[id] ?? [])),
        get: vi.fn((id: string) => Promise.resolve(RELS_BY_PERSON[FOCAL].find(r => r.id === id) ?? null)),
        delete: vi.fn().mockResolvedValue(true),
      },
      persons: {
        get: vi.fn((id: string) => Promise.resolve(PERSONS[id] ?? null)),
        getNames: vi.fn((id: string) => Promise.resolve(NAMES[id] ?? [])),
      },
      events: {
        forPerson: vi.fn((id: string) => Promise.resolve(PERSON_EVENTS[id] ?? [])),
        forRelationship: vi.fn((id: string) => Promise.resolve(REL_EVENTS[id] ?? [])),
      },
      onDataChanged: vi.fn(() => () => undefined),
    };
  });

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api;
  });

  async function mountAndLoad() {
    const wrapper = mount(PersonRelationshipsSection, {
      global: { plugins: [i18n] },
      props: { personId: FOCAL },
    });
    await flushPromises();
    await flushPromises();
    return wrapper;
  }

  it('renders parent groups in the spec order: bio father, bio mother', async () => {
    const wrapper = await mountAndLoad();

    const groups = wrapper.findAll('.rel-group');
    expect(groups.length).toBeGreaterThanOrEqual(4);

    // First group = bio father; second = bio mother; then partners; then "other"
    const headings = groups.map(g => g.find('.rel-group-heading').text());
    // We expect: Father, Mother, Partners, Partners, Other relations (no orphan bucket here)
    expect(headings[0]).toMatch(/^Father$/i);
    expect(headings[1]).toMatch(/^Mother$/i);
  });

  it('orders partners chronologically and groups children under each partner', async () => {
    const wrapper = await mountAndLoad();

    const groups = wrapper.findAll('.rel-group');
    // Partners are groups [2] and [3] (after the two parent groups).
    // Find the two partner groups by looking for `.rel-children-block` markers.
    const partnerGroups = groups.filter(g => g.find('.rel-children-block').exists());
    expect(partnerGroups.length).toBe(2);

    // Partner 1 marriage 1840-06-15 → comes before partner 2 (1861-09-01).
    // Render the partner row's display name from the avatar/personName slot.
    const p1Block = partnerGroups[0];
    const p2Block = partnerGroups[1];
    expect(p1Block.text()).toContain('Anna');
    expect(p2Block.text()).toContain('Berta');

    // Children order under p1: c1 (1841) then c2 (1843); only c3 under p2.
    const p1ChildText = p1Block.find('.rel-children-block').text();
    expect(p1ChildText.indexOf('Erik')).toBeLessThan(p1ChildText.indexOf('Eva'));
    expect(p2Block.find('.rel-children-block').text()).toContain('Gustav');
  });

  it('renders the godparent under "Other relations" (last group)', async () => {
    const wrapper = await mountAndLoad();

    const groups = wrapper.findAll('.rel-group');
    const lastGroup = groups[groups.length - 1];
    expect(lastGroup.find('.rel-group-heading').text()).toMatch(/Other relations/i);
    expect(lastGroup.text()).toContain('Hilda');
  });

  it('produces identical DOM order when remounted (same person, same order)', async () => {
    const w1 = await mountAndLoad();
    const order1 = w1.findAll('.rel-group').map(g => g.find('.rel-group-heading').text());
    w1.unmount();

    const w2 = await mountAndLoad();
    const order2 = w2.findAll('.rel-group').map(g => g.find('.rel-group-heading').text());

    expect(order2).toEqual(order1);
  });
});
