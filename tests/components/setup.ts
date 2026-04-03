import { createI18n } from 'vue-i18n';
import { config } from '@vue/test-utils';
import en from '../../src/renderer/i18n/en';

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
});

// Stub router-link globally so components that use it don't warn in tests.
config.global.stubs = {
  RouterLink: { template: '<a><slot /></a>' },
};
