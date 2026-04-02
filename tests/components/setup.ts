import { createI18n } from 'vue-i18n';
import en from '../../src/renderer/i18n/en';

/**
 * A real i18n instance backed by the English translation file.
 * Import this into every component test and pass it as a global plugin.
 *
 * Usage:
 *   mount(MyComponent, { global: { plugins: [i18n] }, props: { ... } })
 */
export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
});
