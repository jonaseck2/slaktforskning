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
// Stub Teleport as an inline passthrough so wrapper.find() can reach
// teleported dropdown DOM (PlacePicker/PersonPicker/SourcePicker dropdowns
// teleport to body, which detaches them from the test wrapper's subtree).
config.global.stubs = {
  RouterLink: { template: '<a><slot /></a>' },
  Teleport: { template: '<div><slot /></div>' },
};

// Register pinia globally so all mounted components can use stores.
config.global.plugins = [...(config.global.plugins ?? []), pinia];
