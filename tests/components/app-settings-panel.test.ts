import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import AppSettingsPanel from '../../src/renderer/components/AppSettingsPanel.vue';

function makeI18n() {
  return createI18n({
    legacy: false,
    locale: 'sv',
    messages: {
      sv: {
        settings: {
          appearance: 'Utseende', theme: 'Tema', textSize: 'Textstorlek',
          readAloud: 'Läs upp', language: 'Språk', menuLayout: 'Menyläge',
          addBtnStyle: 'Lägg till-knapp', menuVertical: 'Vertikal', menuHorizontal: 'Horisontell',
          textSizeSmall: 'Liten', textSizeMedium: 'Medel', textSizeLarge: 'Stor',
          off: 'Av', narrate: 'Berätta', screenReaderMode: 'Skärmläsarläge',
          lightMode: 'Ljus', darkMode: 'Mörk', contrastMode: 'Hög kontrast',
          addBtnPlus: 'Plus', addBtnLeaf: 'Löv',
        },
        a11y: { settings: 'Inställningar' },
      },
      en: { settings: {}, a11y: {} },
    },
  });
}

describe('AppSettingsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('renders the shared rows for both variants', async () => {
    for (const variant of ['renderer', 'static'] as const) {
      const w = mount(AppSettingsPanel, {
        props: { variant },
        global: { plugins: [makeI18n()] },
      });
      // Panel is collapsed by default; expand it before asserting rows.
      await w.find('.settings-toggle').trigger('click');
      const labels = w.findAll('.settings-group-label').map(n => n.text());
      expect(labels).toContain('Utseende');
      expect(labels).toContain('Tema');
      expect(labels).toContain('Textstorlek');
      expect(labels).toContain('Läs upp');
      expect(labels).toContain('Språk');
      w.unmount();
    }
  });

  it('renderer variant includes menu-layout + add-button-style rows; static variant does not', async () => {
    const wR = mount(AppSettingsPanel, { props: { variant: 'renderer' }, global: { plugins: [makeI18n()] } });
    const wS = mount(AppSettingsPanel, { props: { variant: 'static' }, global: { plugins: [makeI18n()] } });
    await wR.find('.settings-toggle').trigger('click');
    await wS.find('.settings-toggle').trigger('click');
    const rLabels = wR.findAll('.settings-group-label').map(n => n.text());
    const sLabels = wS.findAll('.settings-group-label').map(n => n.text());
    expect(rLabels).toContain('Menyläge');
    expect(rLabels).toContain('Lägg till-knapp');
    expect(sLabels).not.toContain('Menyläge');
    expect(sLabels).not.toContain('Lägg till-knapp');
  });

  it('clicking the dark appearance button persists to localStorage and adds the .dark class', async () => {
    const w = mount(AppSettingsPanel, { props: { variant: 'renderer' }, global: { plugins: [makeI18n()] } });
    // The settings panel needs to be open before its buttons are in the DOM.
    // The implementation opens it via the .settings-toggle button.
    const toggle = w.find('.settings-toggle');
    if (toggle.exists()) await toggle.trigger('click');
    const buttons = w.findAll('.settings-option');
    const dark = buttons.find(b => b.text() === '🌙');
    expect(dark).toBeDefined();
    await dark!.trigger('click');
    expect(localStorage.getItem('slaktforskning-appearance')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    w.unmount();
  });

  it('clicking the forest theme button persists and applies theme-forest class', async () => {
    const w = mount(AppSettingsPanel, { props: { variant: 'renderer' }, global: { plugins: [makeI18n()] } });
    const toggle = w.find('.settings-toggle');
    if (toggle.exists()) await toggle.trigger('click');
    const forest = w.findAll('.settings-option').find(b => b.text() === '🌲');
    expect(forest).toBeDefined();
    await forest!.trigger('click');
    expect(localStorage.getItem('slaktforskning-theme')).toBe('forest');
    expect(document.documentElement.classList.contains('theme-forest')).toBe(true);
    w.unmount();
  });
});
