import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import AppSidebar from '../../src/renderer/components/AppSidebar.vue';
import type { NavSectionDef } from '../../src/renderer/components/AppSidebarTypes';

function makeI18n() {
  return createI18n({
    legacy: false,
    locale: 'sv',
    messages: {
      sv: {
        app: { title: 'Släktforskning' },
        a11y: { skipToMain: 'Hoppa till huvudinnehåll', settings: 'Inställningar' },
        nav: { research: 'Forska', people: 'Personer', search: 'Sök' },
        places: { title: 'Platser' }, media: { nav: 'Media' },
        settings: { appearance: 'Utseende', theme: 'Tema', textSize: 'Textstorlek', readAloud: 'Läs upp', language: 'Språk', menuLayout: 'Menyläge', addBtnStyle: 'Lägg till-knapp', menuVertical: 'V', menuHorizontal: 'H', textSizeSmall: 'S', textSizeMedium: 'M', textSizeLarge: 'L', off: 'Av', narrate: 'B', screenReaderMode: 'SR', lightMode: 'L', darkMode: 'D', contrastMode: 'HK', addBtnPlus: 'P', addBtnLeaf: 'L' },
      },
      en: {},
    },
  });
}

function makeRouter() {
  return createRouter({ history: createWebHashHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }] });
}

const STATIC_SECTIONS: NavSectionDef[] = [{
  key: 'main',
  items: [
    { to: '/', icon: '👤', labelKey: 'nav.people' },
    { to: '/places', icon: '📍', labelKey: 'places.title' },
    { to: '/media', icon: '📷', labelKey: 'media.nav' },
    { to: '/search', icon: '🔍', labelKey: 'nav.search' },
  ],
}];

const RENDERER_SECTIONS: NavSectionDef[] = [{
  key: 'research',
  labelKey: 'nav.research',
  items: [
    { to: '/', icon: '👤', labelKey: 'nav.people' },
    { to: '/places', icon: '📍', labelKey: 'places.title' },
    { to: '/media', icon: '📷', labelKey: 'media.nav' },
    { to: '/search', icon: '🔍', labelKey: 'nav.search' },
  ],
}];

describe('AppSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('renders the same outer chrome for renderer and static section sets', async () => {
    const router = makeRouter();
    await router.isReady();
    const w = mount(AppSidebar, {
      props: { sections: STATIC_SECTIONS, variant: 'static' },
      global: { plugins: [makeI18n(), router] },
    });
    expect(w.find('nav.sidebar').exists()).toBe(true);
    expect(w.find('.sidebar-header').exists()).toBe(true);
    expect(w.find('.sidebar-title').text()).toContain('Släktforskning');
    expect(w.find('.sidebar-spacer').exists()).toBe(true);
    expect(w.findAll('.nav-item').length).toBe(4);
    expect(w.findComponent({ name: 'AppSettingsPanel' }).exists()).toBe(true);
    w.unmount();
  });

  it('renders section labels when a section has labelKey', async () => {
    const router = makeRouter();
    await router.isReady();
    const w = mount(AppSidebar, {
      props: { sections: RENDERER_SECTIONS, variant: 'renderer' },
      global: { plugins: [makeI18n(), router] },
    });
    expect(w.findAll('.nav-section-label').map(n => n.text())).toEqual(['Forska']);
    w.unmount();
  });

  it('renders a #bottom slot consumer above the settings panel', async () => {
    const router = makeRouter();
    await router.isReady();
    const w = mount(AppSidebar, {
      props: { sections: STATIC_SECTIONS, variant: 'renderer' },
      slots: { bottom: '<div class="test-bottom-slot">undo</div>' },
      global: { plugins: [makeI18n(), router] },
    });
    expect(w.find('.test-bottom-slot').exists()).toBe(true);
    // settings panel must come AFTER the slot in DOM order
    const html = w.html();
    expect(html.indexOf('test-bottom-slot')).toBeLessThan(html.indexOf('settings-section'));
    w.unmount();
  });
});
