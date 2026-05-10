import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import SectionEmpty from '../../src/renderer/components/ui/SectionEmpty.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'sv',
  messages: {
    sv: {
      onboarding: {
        empty: {
          test: { purpose: 'Här ser du saker. Klicka för att lägga till.', cta: 'Lägg till' },
        },
      },
    },
  },
});

const opts = { global: { plugins: [i18n] } };

describe('SectionEmpty', async () => {
  it('legacy message-only mode renders as before', () => {
    const w = mount(SectionEmpty, { props: { message: 'Inga poster.' }, ...opts });
    expect(w.text()).toContain('Inga poster.');
    expect(w.find('.section-empty--coaching').exists()).toBe(false);
  });

  it('purposeKey mode renders Purpose sentence + CTA button and emits action', async () => {
    const w = mount(SectionEmpty, {
      props: { purposeKey: 'onboarding.empty.test.purpose', actionLabelKey: 'onboarding.empty.test.cta' },
      ...opts,
    });
    expect(w.text()).toContain('Här ser du saker.');
    expect(w.find('.section-empty--coaching').exists()).toBe(true);
    (await w.get('button.section-empty__action')).trigger('click');
    expect(w.emitted('action')).toBeTruthy();
  });

  it('renders cta slot when provided (overrides actionLabelKey button)', () => {
    const w = mount(SectionEmpty, {
      props: { purposeKey: 'onboarding.empty.test.purpose' },
      slots: { cta: '<input data-test="picker" />' },
      ...opts,
    });
    expect(w.find('[data-test="picker"]').exists()).toBe(true);
    expect(w.find('button.section-empty__action').exists()).toBe(false);
  });
});
