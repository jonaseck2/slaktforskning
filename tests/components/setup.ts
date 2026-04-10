import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { config } from '@vue/test-utils';
import { beforeEach } from 'vitest';
import en from '../../src/renderer/i18n/en';

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
});

export const pinia = createPinia();

// Reset pinia state before each test so stores don't bleed between tests.
beforeEach(() => {
  setActivePinia(createPinia());
});

// Stub router-link globally so components that use it don't warn in tests.
config.global.stubs = {
  RouterLink: { template: '<a><slot /></a>' },
};

// Register pinia globally so all mounted components can use stores.
config.global.plugins = [...(config.global.plugins ?? []), pinia];
