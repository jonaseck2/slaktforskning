import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ConsolidationStep from '../../src/renderer/components/import/ConsolidationStep.vue';
import type { DuplicateCluster } from '../../src/api/duplicates/clusters';
import { i18n } from './setup';

/**
 * The review surface: one row per volume, not 8256 pairs. Measured on the four
 * ArkivDigital exports, 2776 source records represent 1496 volumes — a review
 * needing 1496 clicks has not met the goal, so "join all exact matches" is ONE
 * control.
 */
describe('ConsolidationStep', () => {
  const exact = (n: number, id: string): DuplicateCluster => ({
    entityType: 'source',
    memberIds: Array.from({ length: n }, (_, i) => `${id}-${i}`),
    representativeId: `${id}-0`,
    reason: `arkivdigital ${id}`,
    kind: 'exact',
  });
  const fuzzy = (id: string): DuplicateCluster => ({
    entityType: 'person',
    memberIds: [`${id}-a`, `${id}-b`],
    representativeId: `${id}-a`,
    reason: 'similarity_88',
    kind: 'fuzzy',
  });

  function mountStep(clusters: DuplicateCluster[]) {
    return mount(ConsolidationStep, {
      props: { clusters },
      global: { plugins: [i18n] },
    });
  }

  it('renders one row per cluster, not one per pair', () => {
    // 129 copies of one volume is 8256 pairs and exactly one decision.
    const wrapper = mountStep([exact(129, 'v191316'), exact(2, 'v135435')]);
    expect(wrapper.findAll('.cluster-row')).toHaveLength(2);
  });

  it('shows how many records each row stands for', () => {
    const wrapper = mountStep([exact(129, 'v191316')]);
    expect(wrapper.find('.cluster-row').text()).toContain('129');
  });

  it('names why the rows were grouped', () => {
    const wrapper = mountStep([exact(3, 'v191316')]);
    expect(wrapper.find('.cluster-row').text()).toContain('v191316');
  });

  it('ticks exact clusters by default and leaves fuzzy ones untouched', () => {
    const wrapper = mountStep([exact(2, 'v1'), fuzzy('p1')]);
    const boxes = wrapper.findAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect((boxes[0].element as HTMLInputElement).checked, 'exact cluster not pre-ticked').toBe(true);
    expect((boxes[1].element as HTMLInputElement).checked, 'fuzzy cluster must not be pre-ticked').toBe(false);
  });

  it('offers approve-all-exact as ONE control naming the count', async () => {
    const wrapper = mountStep([exact(2, 'v1'), exact(3, 'v2'), fuzzy('p1')]);
    const btn = wrapper.find('.approve-all-exact');
    expect(btn.exists(), 'no single control to approve every exact cluster').toBe(true);
    expect(btn.text()).toContain('2');
    await btn.trigger('click');
    expect(wrapper.emitted('approveAllExact')).toHaveLength(1);
  });

  it('does not offer approve-all-exact when nothing is exact', () => {
    const wrapper = mountStep([fuzzy('p1')]);
    expect(wrapper.find('.approve-all-exact').exists()).toBe(false);
  });

  it('emits the cluster when a single row is approved', async () => {
    const c = exact(2, 'v1');
    const wrapper = mountStep([c]);
    await wrapper.find('.cluster-approve').trigger('click');
    expect(wrapper.emitted('approve')?.[0]).toEqual([c]);
  });

  it('declining removes the row and emits the cluster', async () => {
    const c = exact(2, 'v1');
    const wrapper = mountStep([c, exact(2, 'v2')]);
    await wrapper.findAll('.cluster-decline')[0].trigger('click');
    expect(wrapper.emitted('decline')?.[0]).toEqual([c]);
    expect(wrapper.findAll('.cluster-row')).toHaveLength(1);
  });

  it('an approved row also leaves the list, so the same decision is not asked twice', async () => {
    const wrapper = mountStep([exact(2, 'v1'), exact(2, 'v2')]);
    await wrapper.findAll('.cluster-approve')[0].trigger('click');
    expect(wrapper.findAll('.cluster-row')).toHaveLength(1);
  });

  it('renders the nothing-arrived-twice message and no controls for an empty list', () => {
    const wrapper = mountStep([]);
    expect(wrapper.text()).toContain('Nothing arrived twice');
    expect(wrapper.findAll('.cluster-row')).toHaveLength(0);
    expect(wrapper.find('.approve-all-exact').exists()).toBe(false);
  });

  it('offers a way out that does not decide anything', async () => {
    const wrapper = mountStep([exact(2, 'v1')]);
    await wrapper.find('.consolidate-close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('approve')).toBeUndefined();
    expect(wrapper.emitted('decline')).toBeUndefined();
  });
});
