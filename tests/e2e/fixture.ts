/**
 * Shared E2E fixture: AppDriver class + process lifecycle helpers.
 *
 * Each gui-*.test.ts file imports these to start its own Tauri instance on a
 * dedicated port, enabling parallel test execution.
 *
 * Tauri bridge architecture (see src-tauri/src/ui_server.rs):
 *   GET  /            — health probe
 *   GET  /db_path     — current rusqlite-open DB path
 *   POST /eval        — run a JS expression in the renderer; response is the
 *                       raw JS value (or `{ "__error": "..." }` on throw).
 *                       NOT wrapped in `{ result: ... }` like the Electron
 *                       /execute_js endpoint was.
 *   POST /screenshot  — native window capture (returns `{ data: <base64> }`)
 *
 * AppDriver primitives (`getDom`, `click`, `fillInput`, `navigate`,
 * `setLocale`, `executeJs`, `screenshot`) all run on top of these four
 * endpoints — most of them ship a JS string through `/eval`.
 */
import { spawn, execFileSync, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { expect } from '@playwright/test';

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Process lifecycle helpers
// ---------------------------------------------------------------------------

/** Kill any process currently listening on the given port (stale run cleanup). */
export function killPort(port: number): void {
  if (process.platform === 'win32') {
    try {
      // netstat -ano lists TCP connections with PIDs; find LISTENING on the target port
      const out = execFileSync(
        'cmd', ['/c', `netstat -ano -p TCP 2>nul`],
        { encoding: 'utf-8' }
      );
      const pids = new Set<string>();
      for (const line of out.split('\n')) {
        if (!line.includes('LISTENING')) continue;
        const cols = line.trim().split(/\s+/);
        const addr = cols[1] ?? '';
        const pid  = cols[cols.length - 1] ?? '';
        if (addr.endsWith(':' + String(port)) && /^\d+$/.test(pid) && pid !== '0') {
          pids.add(pid);
        }
      }
      for (const pid of pids) {
        try { execFileSync('taskkill', ['/F', '/PID', pid], { stdio: 'ignore' }); } catch { /* ok */ }
      }
    } catch { /* Nothing on port — fine */ }
  } else {
    try {
      // -i:PORT must be a single argument for lsof to parse it as a port filter
      const pids = execFileSync('lsof', ['-t', '-i:' + String(port)], {
        encoding: 'utf-8',
      }).trim();
      if (pids) {
        const pidList = pids.split('\n').filter(Boolean);
        execFileSync('kill', ['-9', ...pidList]);
      }
    } catch {
      // Nothing on port — fine
    }
  }
}

/**
 * Kill the entire process group rooted at proc.pid.
 * - POSIX: detached:true creates a process group; process.kill(-pid) signals it.
 * - Windows: taskkill /F /T /PID kills the whole process tree.
 */
export async function killProcessGroup(proc: ChildProcess): Promise<void> {
  if (!proc.pid) return;
  const pid = proc.pid;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' }); } catch { /* already dead */ }
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch { /* already dead */ }
    await new Promise<void>((r) => setTimeout(r, 500));
    try { process.kill(-pid, 'SIGKILL'); } catch { /* already dead */ }
  }
}

export interface AppInstance {
  proc: ChildProcess;
  dbPath: string;
}

/**
 * Resolve the path to the packaged Tauri binary for the current platform.
 * Throws with a helpful message if the binary is missing — the e2e script is
 * expected to run `npm run tauri:build` (or the test-friendly
 * `npm run tauri:build:test` once it lands) before invoking Playwright.
 */
export function packagedBinaryPath(): string {
  const { platform } = process;
  const targetDir = path.join(PROJECT_ROOT, 'src-tauri', 'target', 'release');

  let binary: string;
  if (platform === 'darwin') {
    // The Tauri bundle ships two .app variants — `Släktforskning (Tauri).app`
    // (productName-derived) and `slaktforskning.app` (executable name fallback).
    // The first one is what users install; the second mirrors the inner
    // executable used by both. Inner binary is `slaktforskning` per
    // src-tauri/Cargo.toml `[[bin]]`.
    binary = path.join(
      targetDir, 'bundle', 'macos',
      'Släktforskning (Tauri).app', 'Contents', 'MacOS', 'slaktforskning',
    );
  } else if (platform === 'linux') {
    // Linux ships AppImage. Look at the appimage dir; fall back to the raw
    // binary in `target/release/` if the AppImage hasn't been built yet
    // (handy for `cargo build --release` runs).
    const appimageDir = path.join(targetDir, 'bundle', 'appimage');
    if (fs.existsSync(appimageDir)) {
      const entries = fs.readdirSync(appimageDir).filter(f => f.endsWith('.AppImage'));
      if (entries.length > 0) {
        binary = path.join(appimageDir, entries[0]);
      } else {
        binary = path.join(targetDir, 'slaktforskning');
      }
    } else {
      binary = path.join(targetDir, 'slaktforskning');
    }
  } else if (platform === 'win32') {
    binary = path.join(targetDir, 'slaktforskning.exe');
  } else {
    throw new Error(`Unsupported platform for Tauri e2e: ${platform}`);
  }

  if (!fs.existsSync(binary)) {
    throw new Error(
      `Packaged Tauri binary not found at:\n  ${binary}\n` +
      `Run \`npm run tauri:build\` first ` +
      `(eventually replaced by \`npm run tauri:build:test\` — see the test-migration plan).`
    );
  }
  return binary;
}

/**
 * Spawn the packaged Tauri binary with a temp DB and custom UI port.
 * Returns when the UI HTTP server is accepting connections AND the Vue app
 * has mounted (`window.__vue_router` set by the renderer entry point).
 * Throws if the app doesn't start within ~50 seconds (30 + 20).
 */
export async function startApp(port: number, tag = ''): Promise<AppInstance> {
  killPort(port);

  const dbPath = path.join(
    os.tmpdir(),
    `slaktforskning-e2e${tag ? '-' + tag : ''}-${Date.now()}.db`
  );

  const isWindows = process.platform === 'win32';
  // Spawn the packaged Tauri binary directly. Tests run against the same
  // build users get, with no Vite dev-server contention. On POSIX, detached
  // forms a process group so killProcessGroup(-pid) kills all children.
  const spawnCmd  = packagedBinaryPath();
  const spawnArgs: string[] = [];
  const proc = spawn(spawnCmd, spawnArgs, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      // Honoured by `default_db_path` in src-tauri/src/lib.rs — overrides the
      // per-user `app_data_dir/family.db` so each test run is isolated.
      SLAKTFORSKNING_DB: dbPath,
      // Honoured by `ui_server.rs::spawn` — picks the bridge port.
      SLAKTFORSKNING_UI_PORT: String(port),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: !isWindows,
  });

  let output = '';
  proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
  proc.stderr?.on('data', (d: Buffer) => { output += d.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;

  // Phase 1: wait for the HTTP server to accept connections. Tauri's
  // `ui_server.rs` exposes `GET /` as the health probe — returns
  // `{ ok: true, server: "tauri-ui-bridge" }` once axum is bound.
  const httpReady = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      console.error(`[e2e:${port}] App did not start in time. Output:\n`, output);
      resolve(false);
    }, 30_000);

    const poll = async () => {
      try {
        const res = await fetch(`${baseUrl}/`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          clearTimeout(timeout);
          resolve(true);
          return;
        }
      } catch {
        // not ready yet
      }
      setTimeout(poll, 250);
    };

    // Brief delay before first poll so Tauri has time to bind the UI server.
    setTimeout(poll, 500);

    proc.on('error', () => { clearTimeout(timeout); resolve(false); });
    proc.on('exit', () => { clearTimeout(timeout); resolve(false); });
  });

  if (!httpReady) {
    await killProcessGroup(proc);
    const tail = output.slice(-2000).trim();
    throw new Error(
      `Tauri app on port ${port} did not start in time (30s). ` +
      `Last 2000 chars of output:\n${tail || '(no output captured)'}`
    );
  }

  // Phase 2: wait for the Vue app to mount (window.__vue_router set by renderer).
  // Tauri's POST /eval returns the raw JS value (or { __error: "..." } on throw),
  // not the Electron-style { result: <value> } wrapper.
  const ready = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      console.error(`[e2e:${port}] Vue did not initialize in time.`);
      resolve(false);
    }, 20_000);

    const poll = async () => {
      try {
        const res = await fetch(`${baseUrl}/eval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: '!!window.__vue_router' }),
          signal: AbortSignal.timeout(5000),
        });
        const body = (await res.json()) as boolean | { __error?: string } | null;
        if (body === true) {
          clearTimeout(timeout);
          resolve(true);
          return;
        }
      } catch {
        // not ready yet
      }
      setTimeout(poll, 100);
    };

    poll();
  });

  if (!ready) {
    await killProcessGroup(proc);
    const tail = output.slice(-2000).trim();
    throw new Error(
      `Vue app on port ${port} did not initialize in time (20s after HTTP up). ` +
      `Last 2000 chars of output:\n${tail || '(no output captured)'}`
    );
  }

  return { proc, dbPath };
}

/**
 * Kill the app process group and clean up the temp DB.
 *
 * Tolerates `undefined` so that when `startApp` throws in `beforeAll`, the
 * `afterAll` cleanup doesn't crash with a destructure error that masks the
 * real startup failure in the Playwright report.
 */
export async function teardownApp(instance: AppInstance | undefined): Promise<void> {
  if (!instance) return;
  const { proc, dbPath } = instance;
  await killProcessGroup(proc);
  fs.rmSync(dbPath, { force: true });
  // Also clean up stale lock dirs left by node-sqlite3-wasm
  try { fs.rmSync(dbPath + '.lock', { force: true, recursive: true }); } catch { /* ok */ }
}

// ---------------------------------------------------------------------------
// AppDriver — thin wrapper over the Tauri ui-bridge HTTP surface
//
// Every primitive (getDom, click, fillInput, navigate, setLocale) is
// implemented on top of `executeJs` (= POST /eval). The Tauri bridge
// exposes only /eval, /screenshot, /db_path, and /. We push DOM/click/fill
// logic into the renderer as JS strings, mirroring the same retries and
// settle semantics the Electron-era endpoints had.
// ---------------------------------------------------------------------------

export class AppDriver {
  private baseUrl: string;

  constructor(port: number) {
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async post(urlPath: string, body?: unknown): Promise<unknown> {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${urlPath}`, {
          method: 'POST',
          headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(20_000),
        });
        return res.json();
      } catch (err) {
        // Retry on network errors (connection reset, ECONNREFUSED) and on
        // AbortError from AbortSignal.timeout (renderer temporarily busy).
        // Re-throw immediately on other errors or on the last attempt.
        const isRetryable = err instanceof TypeError ||
          (err instanceof Error && err.name === 'TimeoutError');
        if (!isRetryable || attempt === MAX_RETRIES - 1) throw err;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    // Unreachable — the loop always throws or returns, but TypeScript needs this.
    throw new Error('post: exhausted retries');
  }

  /** Get the full rendered HTML of the current view. */
  async getDom(): Promise<string> {
    return await this.executeJs<string>('document.documentElement.outerHTML');
  }

  /** Push a Vue Router path (e.g. "/", "/places", "/search?q=foo"). */
  async navigate(routePath: string): Promise<void> {
    await this.executeJs(
      `window.__vue_router.push(${JSON.stringify(routePath)})`,
    );
    await this.settle();
  }

  /** Click an element by CSS selector. Polls until the element exists (up to timeoutMs). */
  async click(selector: string, timeoutMs = 8000): Promise<void> {
    // The poll runs entirely in the renderer — one /eval round-trip instead
    // of one per attempt. Returns { ok: true } on hit, { ok: false } on
    // deadline. Throws to surface the same error message as the old shape.
    const result = await this.executeJs<{ ok: boolean; error?: string }>(`
      new Promise((resolve) => {
        const sel = ${JSON.stringify(selector)};
        const deadline = Date.now() + ${timeoutMs};
        const tick = () => {
          const el = document.querySelector(sel);
          if (el && typeof el.click === 'function') {
            try { el.click(); resolve({ ok: true }); }
            catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); }
            return;
          }
          if (Date.now() >= deadline) {
            resolve({ ok: false, error: 'Element not found after ' + ${timeoutMs} + 'ms' });
            return;
          }
          setTimeout(tick, 100);
        };
        tick();
      })
    `);
    if (!result?.ok) {
      throw new Error(`click(${selector}): ${result?.error ?? 'unknown error'}`);
    }
    await this.settle();
  }

  /**
   * Run JavaScript in the renderer and return the serialized result.
   *
   * The Tauri /eval endpoint returns the JS value directly (or
   * `{ __error: "..." }` if the script threw). The Electron-era
   * /execute_js wrapped this as `{ result, error }` — older AppDriver
   * callers used `result.result`, so we unwrap consistently here.
   */
  async executeJs<T = unknown>(code: string): Promise<T> {
    const raw = await this.post('/eval', { script: code });
    if (raw && typeof raw === 'object' && '__error' in (raw as object)) {
      throw new Error(`executeJs: ${(raw as { __error: string }).__error}`);
    }
    // Tauri ui_server may also wrap a server-side bridge error as `{ error }`
    // (e.g. timeout, no main window). Surface those too.
    if (raw && typeof raw === 'object' && 'error' in (raw as object) && Object.keys(raw as object).length === 1) {
      throw new Error(`executeJs: ${(raw as { error: string }).error}`);
    }
    return raw as T;
  }

  /** Capture a PNG screenshot of the window. */
  async screenshot(): Promise<Buffer> {
    const result = (await this.post('/screenshot', {})) as { data: string };
    return Buffer.from(result.data, 'base64');
  }

  /**
   * Wait for Vue to settle after a data change.
   * Uses requestAnimationFrame in the renderer, then a small host-side delay.
   */
  async settle(ms = 50): Promise<void> {
    await this.executeJs(
      'new Promise(r => requestAnimationFrame(r))'
    );
    await new Promise((r) => setTimeout(r, ms));
  }

  /** Poll the DOM until it contains `text`, or throw after `timeoutMs`. */
  async waitForText(text: string, timeoutMs = 12000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const dom = await this.getDom();
      if (dom.includes(text)) return dom;
      await new Promise((r) => setTimeout(r, 100));
    }
    const finalDom = await this.getDom();
    const snippet = finalDom
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .slice(0, 3000);
    throw new Error(
      `Timed out waiting for "${text}" in DOM\n\nDOM snippet: ${snippet}`
    );
  }

  /** Assert the DOM contains a text string. Waits up to 5s for it to appear. */
  async expectText(text: string): Promise<void> {
    await this.waitForText(text, 5000);
  }

  /** Assert the DOM does NOT contain a text string. Settles first to ensure latest state. */
  async expectNoText(text: string): Promise<void> {
    await this.settle(100);
    const dom = await this.getDom();
    expect(dom).not.toContain(text);
  }

  /**
   * Wait for a CSS selector to appear and fill its value in one round-trip.
   * Triggers Vue's v-model via the native HTMLInputElement setter.
   */
  async waitAndFill(
    selector: string,
    value: string,
    timeoutMs = 8000
  ): Promise<void> {
    await this.executeJs(`
      new Promise((resolve, reject) => {
        const deadline = Date.now() + ${timeoutMs};
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        function check() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (el) {
            setter.call(el, ${JSON.stringify(value)});
            el.dispatchEvent(new Event('input', { bubbles: true }));
            resolve(null);
          } else if (Date.now() > deadline) {
            reject(new Error('waitAndFill: selector not found: ' + ${JSON.stringify(selector)}));
          } else {
            setTimeout(check, 100);
          }
        }
        check();
      })
    `);
  }

  /**
   * Set an input's value in a way that triggers Vue's v-model reactivity.
   * Uses the native HTMLInputElement prototype setter to bypass framework wrappers.
   */
  async fillInput(selector: string, value: string): Promise<void> {
    await this.executeJs(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('fillInput: not found: ' + ${JSON.stringify(selector)});
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
  }

  /**
   * Set the UI locale directly via the vue-i18n global.
   * The app exposes window.__vue_i18n (set in main.ts).
   * This is cross-platform and works regardless of sidebar state.
   */
  async setLocale(locale: 'en' | 'sv'): Promise<void> {
    await this.executeJs(`
      (() => {
        const i18n = window.__vue_i18n;
        if (i18n && i18n.global) {
          i18n.global.locale.value = ${JSON.stringify(locale)};
        }
      })()
    `);
    await this.settle(200);
  }

  // -- Data helpers: seed via window.api in the renderer -------------------

  async createPerson(data: {
    given_name: string;
    surname: string;
    sex?: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.persons.create(${JSON.stringify(data)})`
    );
  }

  async createRelationship(data: {
    type: string;
    person1_id?: string;
    person2_id?: string;
    subtype?: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.relationships.create(${JSON.stringify(data)})`
    );
  }

  async createSource(data: {
    title: string;
    author?: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.sources.create(${JSON.stringify(data)})`
    );
  }

  async createEvent(data: {
    event_type: string;
    date_original?: string;
    relationship_id?: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.events.create(${JSON.stringify(data)})`
    );
  }

  async addEventParticipant(data: {
    event_id: string;
    person_id: string;
    role: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.eventParticipants.add(${JSON.stringify(data)})`
    );
  }

  async createCitation(data: {
    source_id: string;
    event_id?: string;
    person_id?: string;
    confidence?: number;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.citations.create(${JSON.stringify(data)})`
    );
  }

  async createPlace(data: {
    name: string;
    place_type?: string;
    street?: string;
    postal_code?: string;
    city?: string;
    country?: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.places.create(${JSON.stringify(data)})`
    );
  }

  async createResearchTask(data: {
    task: string;
    person_id?: string;
    priority?: number;
    status?: string;
    notes?: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.researchTasks.create(${JSON.stringify(data)})`
    );
  }

  async createMedia(data: {
    title: string;
    file_ref?: string;
    format?: string;
    notes?: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.media.create(${JSON.stringify(data)})`
    );
  }

  async addMediaLink(data: {
    media_id: string;
    entity_type: string;
    entity_id: string;
    sort_order?: number;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.media.addLink(${JSON.stringify(data)})`
    );
  }

  async createGroup(data: {
    name: string;
    notes?: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.groups.create(${JSON.stringify(data)})`
    );
  }

  async addGroupMember(groupId: string, personId: string): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.groups.addLink(${JSON.stringify(groupId)}, 'person', ${JSON.stringify(personId)})`
    );
  }
}
