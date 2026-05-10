import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import PersonMiniCard from '../../../../src/renderer/components/reports/primitives/PersonMiniCard.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { common: { bornAbbrev: 'b.' } },
  },
});

const globalPlugins = { plugins: [i18n] };

describe('PersonMiniCard', async () => {
  it('renders full name', async () => {
    const wrapper = mount(PersonMiniCard, {
      global: globalPlugins,
      props: { givenName: 'Anna', surname: 'Andersson', sex: 'F' },
    });
    expect(wrapper.text()).toContain('Anna Andersson');
  });

  it('renders years label', async () => {
    const wrapper = mount(PersonMiniCard, {
      global: globalPlugins,
      props: { givenName: 'E', surname: 'A', birthYear: 1850, deathYear: 1920 },
    });
    expect(wrapper.text()).toContain('1850–1920');
  });

  it('shows initials when no portrait', async () => {
    const wrapper = mount(PersonMiniCard, {
      global: globalPlugins,
      props: { givenName: 'Erik', surname: 'Andersson' },
    });
    expect(wrapper.text()).toContain('EA');
  });

  it('shows ahnentafel when provided', async () => {
    const wrapper = mount(PersonMiniCard, {
      global: globalPlugins,
      props: { givenName: 'X', surname: 'Y', ahnentafel: 4 },
    });
    expect(wrapper.text()).toContain('#4');
  });

  it('renders dash when no name parts', async () => {
    const wrapper = mount(PersonMiniCard, { global: globalPlugins, props: {} });
    expect(wrapper.text()).toContain('—');
  });

  it('appends "(b. …)" when birthSurname differs from surname and toggle is on', async () => {
    const wrapper = mount(PersonMiniCard, {
      global: globalPlugins,
      props: {
        givenName: 'Anna',
        surname: 'Andersson',
        birthSurname: 'Svensson',
        showBirthNameParenthetical: true,
      },
    });
    expect(wrapper.text()).toContain('(b. Svensson)');
  });

  it('omits "(b. …)" when toggle is off', async () => {
    const wrapper = mount(PersonMiniCard, {
      global: globalPlugins,
      props: {
        givenName: 'Anna',
        surname: 'Andersson',
        birthSurname: 'Svensson',
        showBirthNameParenthetical: false,
      },
    });
    expect(wrapper.text()).not.toContain('(b. Svensson)');
  });

  it('omits "(b. …)" when birthSurname matches surname', async () => {
    const wrapper = mount(PersonMiniCard, {
      global: globalPlugins,
      props: {
        givenName: 'Anna',
        surname: 'Andersson',
        birthSurname: 'Andersson',
        showBirthNameParenthetical: true,
      },
    });
    expect(wrapper.text()).not.toContain('(b.');
  });
});
