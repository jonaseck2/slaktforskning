import { createI18n } from 'vue-i18n';
import en from './en';
import sv from './sv';

export type SupportedLocale = 'en' | 'sv';

const STORAGE_KEY = 'slaktforskning-locale';

function getSavedLocale(): SupportedLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'sv') return saved;
  } catch {
    // localStorage unavailable
  }
  // Default to Swedish — this is a Swedish genealogy app
  return 'sv';
}

export function saveLocale(locale: SupportedLocale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage unavailable
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: getSavedLocale(),
  fallbackLocale: 'en',
  messages: { en, sv },
  datetimeFormats: {
    en: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
    },
    sv: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
    },
  },
  numberFormats: {
    en: {
      decimal: { style: 'decimal' },
    },
    sv: {
      decimal: { style: 'decimal' },
    },
  },
});
