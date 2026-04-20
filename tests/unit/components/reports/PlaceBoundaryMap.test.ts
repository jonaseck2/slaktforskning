import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlaceBoundaryMap from '../../../../src/renderer/components/reports/primitives/PlaceBoundaryMap.vue';

describe('PlaceBoundaryMap', () => {
  it('mounts with null placeId without error', () => {
    const wrapper = mount(PlaceBoundaryMap, { props: { placeId: null } });
    expect(wrapper.find('.place-boundary-map').exists()).toBe(true);
  });

  it('renders at the given height', () => {
    const wrapper = mount(PlaceBoundaryMap, {
      props: { placeId: null, height: 600 },
    });
    const el = wrapper.find('.place-boundary-map').element as HTMLElement;
    expect(el.style.height).toBe('600px');
  });

  it('uses a default aria-label', () => {
    const wrapper = mount(PlaceBoundaryMap, { props: { placeId: null } });
    expect(wrapper.find('.place-boundary-map').attributes('aria-label')).toBe('Place map');
  });

  it('honors a custom aria-label', () => {
    const wrapper = mount(PlaceBoundaryMap, {
      props: { placeId: null, ariaLabel: 'Boundary of Uppsala' },
    });
    expect(wrapper.find('.place-boundary-map').attributes('aria-label')).toBe('Boundary of Uppsala');
  });
});
