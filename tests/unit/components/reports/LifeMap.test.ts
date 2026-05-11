import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LifeMap from '../../../../src/renderer/components/reports/primitives/LifeMap.vue';

describe('LifeMap', async () => {
  it('mounts without points (no map rendered)', async () => {
    const wrapper = mount(LifeMap, { props: { points: [] } });
    expect(wrapper.find('.life-map').exists()).toBe(true);
  });

  it('applies the requested height', async () => {
    const wrapper = mount(LifeMap, { props: { points: [], height: 420 } });
    const el = wrapper.find('.life-map').element as HTMLElement;
    expect(el.style.height).toBe('420px');
  });

  it('uses a default aria-label', async () => {
    const wrapper = mount(LifeMap, { props: { points: [] } });
    expect(wrapper.find('.life-map').attributes('aria-label')).toBe('Life map');
  });

  it('honors a custom aria-label', async () => {
    const wrapper = mount(LifeMap, { props: { points: [], ariaLabel: 'Anna\'s journey' } });
    expect(wrapper.find('.life-map').attributes('aria-label')).toBe('Anna\'s journey');
  });
});
