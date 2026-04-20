import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ReportCover from '../../../../src/renderer/components/reports/primitives/ReportCover.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { reports: { common: {
      compiledBy: 'Compiled by {name}',
      compiledByAnonymous: 'Compiled {date}',
    } } },
  },
});

describe('ReportCover', () => {
  it('renders title and subtitle', () => {
    const wrapper = mount(ReportCover, {
      props: { title: 'A Life', subtitle: 'Anna Andersson (1850-1920)' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('A Life');
    expect(wrapper.text()).toContain('Anna Andersson');
  });

  it('uses researcherName when provided', () => {
    const wrapper = mount(ReportCover, {
      props: { title: 'T', researcherName: 'Jonas Ahnstedt' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Compiled by Jonas Ahnstedt');
  });

  it('falls back to anonymous attribution', () => {
    const wrapper = mount(ReportCover, {
      props: { title: 'T', date: new Date('2026-04-19') },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Compiled');
  });

  it('renders hero image when provided', () => {
    const wrapper = mount(ReportCover, {
      props: { title: 'T', heroImageUrl: 'file://test.jpg' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.cover-hero img').exists()).toBe(true);
  });
});
