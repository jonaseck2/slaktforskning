// Boot log goes to console only — devtools (right-click → Inspect Element)
// is the canonical surface. Cargo.toml has features = ["devtools"] so it
// works in release builds too. Errors that crash before mount surface via
// console.error in the inspector.
const bootLog = (msg: string) => { console.log('[boot]', msg); };
bootLog('main.ts entered');

// Capture console + errors into a ring buffer the dev MCP /console endpoint
// drains. Lets the agent see what went wrong on the last navigate without
// poking at devtools.
type ConsoleEntry = { ts: number; level: 'log'|'warn'|'error'|'info'; args: string };
const buf: ConsoleEntry[] = [];
const MAX = 500;
const push = (level: ConsoleEntry['level'], args: unknown[]) => {
  try {
    const s = args.map(a => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
      return String(a);
    }).join(' ');
    buf.push({ ts: Date.now(), level, args: s });
    if (buf.length > MAX) buf.shift();
  } catch { /* ignore */ }
};
const wrap = <K extends ConsoleEntry['level']>(k: K) => {
  const orig = console[k];
  console[k] = (...args: unknown[]) => { push(k, args); orig.apply(console, args as never); };
};
wrap('log'); wrap('warn'); wrap('error'); wrap('info');
window.addEventListener('error', (e) => push('error', [`${e.message} @ ${e.filename}:${e.lineno}`]));
window.addEventListener('unhandledrejection', (e) => push('error', ['unhandledrejection:', e.reason]));
(window as Window & { __taurisConsole?: { drain: () => ConsoleEntry[] } }).__taurisConsole = {
  drain: () => buf.splice(0, buf.length),
};

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
    const [shimMod, apiMod, schemaMod, coreMod] = await Promise.all([
      import('node-sqlite3-wasm').catch(e => { bootLog('shim import threw: ' + (e?.stack || e?.message || e)); throw e; }),
      import('./tauri-window-api').catch(e => { bootLog('window-api import threw: ' + (e?.stack || e?.message || e)); throw e; }),
      import('../api/schema').catch(e => { bootLog('schema import threw: ' + (e?.stack || e?.message || e)); throw e; }),
      import('@tauri-apps/api/core'),
    ]);
    bootLog('dynamic imports done, resolving db path');
    const { Database } = shimMod;
    const { mountWindowApi } = apiMod;
    const { initializeSchema } = schemaMod;
    // Honour any DB the user already switched to via window.api.db.switchTo.
    // App.vue's onSwitched handler triggers window.location.reload() to
    // re-initialise per-DB state, but the Tauri *process* doesn't restart —
    // db::CURRENT_PATH lives across the reload. Without checking it first,
    // every reload would reopen the bundled default and silently undo the
    // user's switch, leaving a divergence where MCP / sqlite3 see one DB
    // and the renderer sees another.
    // Resolution order across an app restart:
    //   1. `db::CURRENT_PATH` (Rust in-memory) — survives a renderer reload
    //      but is reset on a full process restart. Honours window.api.db.switchTo
    //      done since the process started.
    //   2. `localStorage["slaktforskning-last-db-path"]` — written by switchDbTo
    //      so the app reopens whatever DB the user was last using. Falls
    //      through to (3) if the file no longer exists on disk.
    //   3. `default_db_path()` — bundled `family.db` (portable or app data dir).
    const currentPath = await coreMod.invoke<string | null>('db_current_path');
    let lastDbPath: string | null = null;
    let lastDbSource: 'rust' | 'localStorage' | 'default' = 'default';
    if (currentPath) {
      lastDbPath = currentPath;
      lastDbSource = 'rust';
    } else {
      try {
        const stored = localStorage.getItem('slaktforskning-last-db-path');
        if (stored && stored.length > 0) {
          const exists = await coreMod.invoke<boolean>('fs_exists', { path: stored }).catch(() => false);
          if (exists) {
            lastDbPath = stored;
            lastDbSource = 'localStorage';
          }
        }
      } catch { /* localStorage unavailable; fall through */ }
    }
    const dbPath = lastDbPath ?? (await coreMod.invoke<string>('default_db_path'));
    bootLog('db path: ' + dbPath + ' (' + lastDbSource + ')');
    // UI-server callback bridge for the dev MCP. Rust sends scripts via the
    // webview that end with window.__taurisUiCallback(id, value), routing the
    // value back to a pending oneshot on the Rust side.
    (window as Window & { __taurisUiCallback?: (id: string, value: unknown) => void }).__taurisUiCallback =
      (id: string, value: unknown) => {
        coreMod.invoke('ui_eval_response', { id, value }).catch((e: unknown) => console.error('[ui-callback]', e));
      };
    const db = new Database(dbPath);
    await db.opened;
    bootLog('db opened, initializing schema');
    await initializeSchema(db);
    bootLog('schema ready, mounting window.api');
    mountWindowApi(db);
    bootLog('window.api mounted');

    // Forward Rust menu events to renderer actions. Each menu item id
    // dispatches to a window.api method or a router push.
    const eventMod = await import('@tauri-apps/api/event');
    await eventMod.listen('menu:item', async (e) => {
      const id = String(e.payload);
      try {
        switch (id) {
          case 'open-db': {
            const result = await (window.api.db as { openExisting: () => Promise<unknown> }).openExisting();
            console.log('[menu] open-db:', result);
            break;
          }
          case 'new-db': {
            const result = await (window.api.db as { createNew: () => Promise<unknown> }).createNew();
            console.log('[menu] new-db:', result);
            break;
          }
          case 'undo': await (window.api.undo as { undo: () => Promise<unknown> }).undo(); break;
          case 'redo': await (window.api.undo as { redo: () => Promise<unknown> }).redo(); break;
          case 'about': window.dispatchEvent(new CustomEvent('app:openAbout')); break;
          case 'settings': window.location.hash = '#/settings'; break;
          case 'nav-persons': window.location.hash = '#/persons'; break;
          case 'nav-places': window.location.hash = '#/places'; break;
          case 'nav-sources': window.location.hash = '#/sources'; break;
          case 'nav-media': window.location.hash = '#/media'; break;
          case 'nav-quality': window.location.hash = '#/quality'; break;
          case 'nav-reports': window.location.hash = '#/reports'; break;
          case 'close-window': window.close(); break;
        }
      } catch (err) {
        console.error('[menu] handler failed for', id, err);
      }
    });
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
  // Updater boot check + UI are owned by App.vue / useAppUpdater.
});

// Expose router and i18n for MCP ui_navigate tool and E2E locale switching
(window as Window & { __vue_router: typeof router; __vue_i18n: typeof i18n }).__vue_router = router;
(window as Window & { __vue_router: typeof router; __vue_i18n: typeof i18n }).__vue_i18n = i18n;
