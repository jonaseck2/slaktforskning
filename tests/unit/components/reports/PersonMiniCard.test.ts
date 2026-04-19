import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PersonMiniCard from '../../../../src/renderer/components/reports/primitives/PersonMiniCard.vue';

describe('PersonMiniCard', () => {
  it('renders full name', () => {
    const wrapper = mount(PersonMiniCard, {
      props: { givenName: 'Anna', surname: 'Andersson', sex: 'F' },
    });
    expect(wrapper.text()).toContain('Anna Andersson');
  });

  it('renders years label', () => {
    const wrapper = mount(PersonMiniCard, {
      props: { givenName: 'E', surname: 'A', birthYear: 1850, deathYear: 1920 },
    });
    expect(wrapper.text()).toContain('1850–1920');
  });

  it('shows initials when no portrait', () => {
    const wrapper = mount(PersonMiniCard, {
      props: { givenName: 'Erik', surname: 'Andersson' },
    });
    expect(wrapper.text()).toContain('EA');
  });

  it('shows ahnentafel when provided', () => {
    const wrapper = mount(PersonMiniCard, {
      props: { givenName: 'X', surname: 'Y', ahnentafel: 4 },
    });
    expect(wrapper.text()).toContain('#4');
  });

  it('renders dash when no name parts', () => {
    const wrapper = mount(PersonMiniCard, { props: {} });
    expect(wrapper.text()).toContain('—');
  });
});
