import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TimelineBar from '../../../../src/renderer/components/reports/primitives/TimelineBar.vue';

describe('TimelineBar', () => {
  it('renders items as markers', () => {
    const wrapper = mount(TimelineBar, {
      props: {
        items: [
          { id: '1', year: 1850, eventType: 'birth', label: 'Born 1850' },
          { id: '2', year: 1920, eventType: 'death', label: 'Died 1920' },
        ],
      },
    });
    expect(wrapper.findAll('.marker').length).toBe(2);
    expect(wrapper.text()).toContain('Born 1850');
  });

  it('positions markers proportionally', () => {
    const wrapper = mount(TimelineBar, {
      props: {
        items: [
          { id: '1', year: 1900, eventType: 'birth', label: 'A' },
          { id: '2', year: 1950, eventType: 'death', label: 'B' },
        ],
      },
    });
    const markers = wrapper.findAll('.marker');
    expect((markers[0].element as HTMLElement).style.left).toBe('0%');
    expect((markers[1].element as HTMLElement).style.left).toBe('100%');
  });

  it('renders nothing when items empty', () => {
    const wrapper = mount(TimelineBar, { props: { items: [] } });
    expect(wrapper.find('.timeline-bar').exists()).toBe(false);
  });

  it('respects rangeStart and rangeEnd overrides', () => {
    const wrapper = mount(TimelineBar, {
      props: {
        items: [{ id: '1', year: 1925, eventType: 'x', label: 'mid' }],
        rangeStart: 1900,
        rangeEnd: 1950,
      },
    });
    expect(wrapper.text()).toContain('1900');
    expect(wrapper.text()).toContain('1950');
    const marker = wrapper.find('.marker').element as HTMLElement;
    expect(marker.style.left).toBe('50%');
  });
});
