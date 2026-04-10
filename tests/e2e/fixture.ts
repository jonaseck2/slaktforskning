/**
 * Shared E2E fixture: AppDriver class + process lifecycle helpers.
 *
 * Each gui-*.test.ts file imports these to start its own Electron instance
 * on a dedicated port, enabling parallel test execution.
 */
import { expect } from '@playwright/test';
import { spawn, execFileSync, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

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
 * Spawn electron-forge start with a temp DB and custom UI port.
 * Returns when the UI HTTP server is accepting connections.
 * Throws if the app doesn't start within 90 seconds.
 */
export async function startApp(port: number, tag = ''): Promise<AppInstance> {
  killPort(port);

  const dbPath = path.join(
    os.tmpdir(),
    `slaktforskning-e2e${tag ? '-' + tag : ''}-${Date.now()}.db`
  );

  const isWindows = process.platform === 'win32';
  // On Windows, npx is npx.cmd and cannot be spawned directly — use cmd /c.
  // On POSIX, use detached to form a process group so killProcessGroup(-pid) kills all children.
  const spawnCmd  = isWindows ? 'cmd'  : 'npx';
  const spawnArgs = isWindows
    ? ['/c', 'npx electron-forge start']
    : ['electron-forge', 'start'];
  const proc = spawn(spawnCmd, spawnArgs, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SLAKTFORSKNING_DB: dbPath,
      SLAKTFORSKNING_UI_PORT: String(port),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: !isWindows,
  });

  let output = '';
  proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
  proc.stderr?.on('data', (d: Buffer) => { output += d.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;

  // Phase 1: wait for the HTTP server to accept connections
  const httpReady = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      console.error(`[e2e:${port}] App did not start in time. Output:\n`, output);
      resolve(false);
    }, 90_000);

    const poll = async () => {
      try {
        const res = await fetch(`${baseUrl}/dom`, {
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

    // Give Vite a head start before polling (6 instances compile simultaneously)
    setTimeout(poll, 3000);

    proc.on('error', () => { clearTimeout(timeout); resolve(false); });
    proc.on('exit', () => { clearTimeout(timeout); resolve(false); });
  });

  if (!httpReady) {
    await killProcessGroup(proc);
    throw new Error(`Electron app on port ${port} did not start in time`);
  }

  // Phase 2: wait for the Vue app to mount (window.__vue_router set by renderer)
  const ready = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      console.error(`[e2e:${port}] Vue did not initialize in time.`);
      resolve(false);
    }, 60_000);

    const poll = async () => {
      try {
        const res = await fetch(`${baseUrl}/execute_js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: '!!window.__vue_router' }),
          signal: AbortSignal.timeout(5000),
        });
        const body = (await res.json()) as { result?: boolean };
        if (body.result === true) {
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
    throw new Error(`Vue app on port ${port} did not initialize in time`);
  }

  return { proc, dbPath };
}

/** Kill the app process group and clean up the temp DB. */
export async function teardownApp({ proc, dbPath }: AppInstance): Promise<void> {
  await killProcessGroup(proc);
  fs.rmSync(dbPath, { force: true });
  // Also clean up stale lock dirs left by node-sqlite3-wasm
  try { fs.rmSync(dbPath + '.lock', { force: true, recursive: true }); } catch { /* ok */ }
}

// ---------------------------------------------------------------------------
// AppDriver — thin wrapper over the ui-server HTTP bridge
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
    const res = await fetch(`${this.baseUrl}/dom`, {
      signal: AbortSignal.timeout(20_000),
    });
    return res.text();
  }

  /** Push a Vue Router path (e.g. "/", "/places", "/search?q=foo"). */
  async navigate(routePath: string): Promise<void> {
    await this.post('/navigate', { path: routePath });
    await this.settle();
  }

  /** Click an element by CSS selector. */
  async click(selector: string): Promise<void> {
    const result = (await this.post('/click', { selector })) as {
      ok?: boolean;
      error?: string;
    };
    if (result.error) throw new Error(`click(${selector}): ${result.error}`);
    await this.settle();
  }

  /** Run JavaScript in the renderer and return the serialized result. */
  async executeJs<T = unknown>(code: string): Promise<T> {
    const result = (await this.post('/execute_js', { code })) as {
      result?: T;
      error?: string;
    };
    if (result.error) throw new Error(`executeJs: ${result.error}`);
    return result.result as T;
  }

  /** Capture a PNG screenshot of the window. */
  async screenshot(): Promise<Buffer> {
    const result = (await this.post('/screenshot')) as { data: string };
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

  /** Assert the DOM contains a text string. */
  async expectText(text: string): Promise<void> {
    const dom = await this.getDom();
    expect(dom).toContain(text);
  }

  /** Assert the DOM does NOT contain a text string. */
  async expectNoText(text: string): Promise<void> {
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
}
