// Visible boot log so failures at module-init time aren't an invisible blank
// screen. Vue replaces #app's content on mount; this <pre> survives until
// then because we render it as a sibling.
const bootDiv = document.createElement('pre');
bootDiv.id = 'boot-log';
bootDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:8px;font:11px monospace;color:#222;background:#ffd;z-index:99999;white-space:pre-wrap;max-height:50vh;overflow:auto';
bootDiv.textContent = '[boot] main.ts entered\n';
document.body.appendChild(bootDiv);
const bootLog = (msg: string) => { bootDiv.textContent += '[boot] ' + msg + '\n'; };
window.addEventListener('error', (e) => bootLog('ERROR: ' + e.message + ' @ ' + e.filename + ':' + e.lineno));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  bootLog('UNHANDLED type=' + typeof r + ' name=' + (r?.name || '?') + ' msg=' + (r?.message || '?'));
  if (r?.stack) bootLog('STACK: ' + r.stack);
  if (r && typeof r === 'object') {
    try { bootLog('JSON: ' + JSON.stringify(r, Object.getOwnPropertyNames(r))); } catch { /* ignore */ }
  }
});

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { i18n } from './i18n';
import './styles/tokens.css';
import './styles/shared.css';
import App from './App.vue';
import { vNarrate } from './directives/narrate';
import { installComponentInspector } from './dev/component-inspector';
import { STORAGE_KEYS } from './utils/storage-keys';
bootLog('static imports done');

// Tauri-only: when running in a Tauri webview, mount window.api by walking
// the channel registry (no Electron contextBridge / preload world). Detect
// via the global __TAURI_INTERNALS__ marker that Tauri injects. The Electron
// build never enters this branch — it gets window.api from the preload.
if ('__TAURI_INTERNALS__' in window) {
  bootLog('tauri detected, dynamic imports starting');
  try {
    const [shimMod, apiMod, schemaMod] = await Promise.all([
      import('node-sqlite3-wasm').catch(e => { bootLog('shim import threw: ' + (e?.stack || e?.message || e)); throw e; }),
      import('./tauri-window-api').catch(e => { bootLog('window-api import threw: ' + (e?.stack || e?.message || e)); throw e; }),
      import('../api/schema').catch(e => { bootLog('schema import threw: ' + (e?.stack || e?.message || e)); throw e; }),
    ]);
    bootLog('dynamic imports done, opening db');
    const { Database } = shimMod;
    const { mountWindowApi } = apiMod;
    const { initializeSchema } = schemaMod;
    const db = new Database(':memory:');
    await db.opened;
    bootLog('db opened, initializing schema');
    await initializeSchema(db);
    bootLog('schema ready, mounting window.api');
    mountWindowApi(db);
    bootLog('window.api mounted');
  } catch (e: unknown) {
    const err = e as { stack?: string; message?: string };
    bootLog('FATAL caught: ' + (err?.stack || err?.message || String(e)));
  }
} else {
  bootLog('NOT a tauri build — __TAURI_INTERNALS__ missing');
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.directive('narrate', vNarrate);

installComponentInspector(i18n);

const lastRoute = localStorage.getItem(STORAGE_KEYS.lastRoute);
const hasHashRoute = window.location.hash && window.location.hash !== '#/';
if (lastRoute && lastRoute !== '/' && !hasHashRoute) {
  router.push(lastRoute).catch(() => router.push('/'));
}

bootLog('about to wait for router.isReady');
router.isReady().finally(() => {
  bootLog('router ready, mounting app');
  app.mount('#app');
  bootLog('app.mount returned');
});

// Expose router and i18n for MCP ui_navigate tool and E2E locale switching
(window as Window & { __vue_router: typeof router; __vue_i18n: typeof i18n }).__vue_router = router;
(window as Window & { __vue_router: typeof router; __vue_i18n: typeof i18n }).__vue_i18n = i18n;
