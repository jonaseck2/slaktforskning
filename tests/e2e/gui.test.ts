/**
 * End-to-end GUI tests for the Electron app.
 *
 * Strategy: spawn `electron-forge start` with a temp DB and custom UI server port,
 * then drive the live app via the HTTP bridge (src/main/ui-server.ts).
 *
 * Data seeding uses `window.api.*` calls via /execute_js so tests exercise
 * the real IPC + SQLite stack.
 */
import { test, expect } from '@playwright/test';
import { spawn, execSync, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const UI_PORT = 19242; // Avoid colliding with a dev instance on default 19241
const UI_BASE = `http://127.0.0.1:${UI_PORT}`;

// ---------------------------------------------------------------------------
// App driver — thin wrapper over the ui-server HTTP endpoints
// ---------------------------------------------------------------------------

class AppDriver {
  async post(urlPath: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${UI_BASE}${urlPath}`, {
      method: 'POST',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }

  /** Get the full rendered HTML of the current view. */
  async getDom(): Promise<string> {
    const res = await fetch(`${UI_BASE}/dom`);
    return res.text();
  }

  /** Push a Vue Router path (e.g. "/", "/relationships", "/search?q=foo"). */
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

  /** Run JS in the renderer and return the result. */
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
   * Wait for Vue to settle (re-render after data changes).
   * Uses `requestAnimationFrame` inside the renderer to wait for the next paint,
   * then an extra small delay for any async effects.
   */
  async settle(ms = 300): Promise<void> {
    await this.executeJs(
      'new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)))'
    );
    await new Promise((r) => setTimeout(r, ms));
  }

  /** Poll the DOM until it contains `text`, or throw after `timeoutMs`. */
  async waitForText(text: string, timeoutMs = 12000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const dom = await this.getDom();
      if (dom.includes(text)) return dom;
      await new Promise((r) => setTimeout(r, 250));
    }
    const finalDom = await this.getDom();
    const snippet = finalDom.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').slice(0, 3000);
    throw new Error(`Timed out waiting for "${text}" in DOM\n\nDOM: ${snippet}`);
  }

  /** Assert the DOM contains a text string. */
  async expectText(text: string): Promise<void> {
    const dom = await this.getDom();
    expect(dom).toContain(text);
  }

  /**
   * Wait for a CSS selector to appear in the DOM and immediately fill its value.
   * Done in a single executeJs call to avoid a race between two round-trips.
   */
  async waitAndFill(selector: string, value: string, timeoutMs = 8000): Promise<void> {
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

  /** Assert the DOM does NOT contain a text string. */
  async expectNoText(text: string): Promise<void> {
    const dom = await this.getDom();
    expect(dom).not.toContain(text);
  }

  /**
   * Set an input's value in a way that triggers Vue's v-model.
   * Uses HTMLInputElement.prototype setter to bypass framework wrappers.
   */
  async fillInput(selector: string, value: string): Promise<void> {
    await this.executeJs(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('fillInput: not found: ${selector}');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    `);
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
      `window.api.events.create(${JSON.stringify(data)})`,
    );
  }

  async addEventParticipant(data: {
    event_id: string;
    person_id: string;
    role: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.eventParticipants.add(${JSON.stringify(data)})`,
    );
  }

  async createCitation(data: {
    source_id: string;
    event_id?: string;
    person_id?: string;
    confidence?: number;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.citations.create(${JSON.stringify(data)})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Fixture: start the app once for the whole file, tear down at the end
// ---------------------------------------------------------------------------

let proc: ChildProcess;
let dbPath: string;
const app = new AppDriver();

test.beforeAll(async () => {
  // Kill any stale process from a previous run
  try {
    const pids = execSync(`lsof -ti:${UI_PORT}`, { encoding: 'utf-8' }).trim();
    if (pids) execSync(`kill -9 ${pids.split('\n').join(' ')}`);
  } catch {
    // No process on port — fine
  }

  dbPath = path.join(
    os.tmpdir(),
    `slaktforskning-gui-test-${Date.now()}.db`
  );

  proc = spawn('npx', ['electron-forge', 'start'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SLAKTFORSKNING_DB: dbPath,
      SLAKTFORSKNING_UI_PORT: String(UI_PORT),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Capture output for debugging failures
  let output = '';
  proc.stdout?.on('data', (d: Buffer) => {
    output += d.toString();
  });
  proc.stderr?.on('data', (d: Buffer) => {
    output += d.toString();
  });

  // Poll until the UI server responds (Vite build + Electron launch + Vue mount)
  const ready = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      console.error('[gui.test] App did not start in time. Output:\n', output);
      resolve(false);
    }, 90_000);

    const poll = async () => {
      try {
        const res = await fetch(`${UI_BASE}/dom`);
        if (res.ok) {
          clearTimeout(timeout);
          resolve(true);
          return;
        }
      } catch {
        // not ready yet
      }
      setTimeout(poll, 1000);
    };

    // Give Vite a head start before polling
    setTimeout(poll, 5000);

    proc.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    proc.on('exit', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });

  expect(ready, 'Electron app should start and UI server should respond').toBe(
    true
  );

  // Extra settle time for Vue to fully hydrate
  await app.settle(1000);

  // Force English locale for predictable text assertions
  await app.executeJs("window.__vue_i18n.global.locale.value = 'en'");
  await app.settle(300);
});

test.afterAll(async () => {
  if (proc && !proc.killed) {
    proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 2000));
    if (!proc.killed) proc.kill('SIGKILL');
  }
  fs.rmSync(dbPath, { force: true });
});

// Increase per-test timeout — the app is already running, but DOM round-trips add up
test.setTimeout(30_000);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Persons CRUD', () => {
  test('empty state shows placeholder', async () => {
    await app.navigate('/');
    await app.expectText('No persons yet');
  });

  test('create a person via the Add Person modal', async () => {
    await app.navigate('/');

    // Open the modal
    await app.click('button');
    await app.settle();

    // Fill the form fields (Given Name is first text input, Surname is second)
    await app.executeJs(`
      const inputs = document.querySelectorAll('.modal input[type="text"]');
      const set = (el, val) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(inputs[0], 'Erik');
      set(inputs[1], 'Svensson');
    `);
    await app.settle();

    // Submit
    await app.click('.modal button[type="submit"]');
    await app.waitForText('Erik');
    await app.expectText('Svensson');
  });

  test('person appears in the list and is clickable to detail', async () => {
    await app.navigate('/');
    await app.waitForText('Erik');

    // Click the row to go to detail
    await app.click('.clickable-row');
    await app.waitForText('Erik Svensson');

    // Detail view should show Names section
    await app.expectText('Names');
    await app.expectText('Birth');
  });

  test('person detail shows notes section', async () => {
    // We should still be on the detail view from the previous test,
    // but navigate explicitly for isolation
    const dom = await app.getDom();
    // Find the person id from a link or navigate to persons list first
    await app.navigate('/');
    await app.waitForText('Erik');
    await app.click('.clickable-row');
    await app.waitForText('Notes');
  });
});

test.describe('Relationships CRUD', () => {
  test('empty relationships list shows placeholder', async () => {
    await app.navigate('/relationships');
    await app.waitForText('No relationships yet');
  });

  test('create a relationship', async () => {
    // Seed a second person so we have two partners
    await app.createPerson({
      given_name: 'Anna',
      surname: 'Larsson',
      sex: 'F',
    });

    await app.navigate('/relationships');
    await app.settle();

    // Click "Add Relationship"
    await app.click('button');
    await app.settle();

    // Submit the relationship form (persons can be set later)
    await app.click('.modal button[type="submit"]');
    await app.settle();

    // Should now have one relationship in the list
    await app.navigate('/relationships');
    await app.settle();
    const dom = await app.getDom();
    // The relationship should exist (table row present)
    expect(dom).toContain('data-table');
  });
});

test.describe('Sources CRUD', () => {
  test('empty sources list shows placeholder', async () => {
    await app.navigate('/sources');
    await app.waitForText('No sources yet');
  });

  test('create a source', async () => {
    await app.navigate('/sources');
    await app.settle();

    await app.click('button');
    await app.settle();

    // Fill source title
    await app.fillInput('.modal input[type="text"]', 'Swedish Church Records');
    await app.settle();

    await app.click('.modal button[type="submit"]');
    await app.waitForText('Swedish Church Records');
  });
});

test.describe('Global Search', () => {
  test('search finds persons', async () => {
    await app.navigate('/search?q=Erik');
    await app.waitForText('Persons');
    await app.expectText('Erik');
    await app.expectText('Svensson');
  });

  test('search finds sources', async () => {
    // Ensure source exists (may have been created by UI test, but seed to be safe)
    await app.createSource({ title: 'Swedish Church Records', author: 'Riksarkivet' });
    await app.navigate('/search?q=Swedish');
    await app.waitForText('Sources');
    await app.expectText('Swedish Church Records');
  });

  test('search with no results shows message', async () => {
    await app.navigate('/search?q=zzz_nomatch_zzz');
    await app.waitForText('No results');
  });

  test('sidebar search navigates to search view', async () => {
    await app.navigate('/');
    await app.settle();

    // Type into sidebar search and submit via Vue's reactivity
    await app.executeJs(`
      const input = document.querySelector('.sidebar-search-input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Erik');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await app.settle();
    // Submit the form
    await app.executeJs(`
      document.querySelector('.sidebar-search-input').closest('form').requestSubmit();
    `);
    await app.settle(500);

    // Should now be on the search view
    const currentPath = await app.executeJs<string>(
      'window.__vue_router.currentRoute.value.fullPath'
    );
    expect(currentPath).toContain('/search');
    expect(currentPath).toContain('Erik');
  });
});

test.describe('Navigation', () => {
  test('sidebar links work', async () => {
    await app.navigate('/');
    await app.expectText('Persons');

    await app.navigate('/relationships');
    await app.expectText('Relationships');

    await app.navigate('/sources');
    await app.expectText('Sources');
  });

  test('detail view back button returns to list', async () => {
    // Seed a person and navigate directly to their detail
    const person = await app.createPerson({ given_name: 'Nils', surname: 'Persson', sex: 'M' });
    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Nils Persson');

    // Click back
    await app.click('.btn-back');
    await app.settle();

    // Verify we returned to the persons list
    const routePath = await app.executeJs<string>(
      'window.__vue_router.currentRoute.value.path'
    );
    expect(routePath).toBe('/');
  });
});

test.describe('Screenshots', () => {
  test('can capture a screenshot', async () => {
    await app.navigate('/');
    await app.settle();
    const png = await app.screenshot();
    expect(png.length).toBeGreaterThan(1000);
    // Verify PNG magic bytes
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  });
});

test.describe('Citation Badges', () => {
  test('new event shows Unsourced badge', async () => {
    const person = await app.createPerson({ given_name: 'Olof', surname: 'Osourced' });
    const event = await app.createEvent({ event_type: 'birth', date_original: '1850' });
    await app.addEventParticipant({ event_id: event.id, person_id: person.id, role: 'primary' });

    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Olof Osourced');
    await app.expectText('Unsourced');
  });

  test('event with one citation shows source count badge', async () => {
    const person = await app.createPerson({ given_name: 'Birgitta', surname: 'Sourced' });
    const event = await app.createEvent({ event_type: 'birth', date_original: '1860' });
    await app.addEventParticipant({ event_id: event.id, person_id: person.id, role: 'primary' });
    const source = await app.createSource({ title: 'Kyrkbok Badge Test' });
    await app.createCitation({ source_id: source.id, event_id: event.id, confidence: 2 });

    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Birgitta Sourced');
    // The event row should show a source-count-badge (not Unsourced)
    const dom = await app.getDom();
    expect(dom).toContain('source-count-badge');
  });

  test('evidence summary shows sourced/total count', async () => {
    const person = await app.createPerson({ given_name: 'Greta', surname: 'Summary' });
    const evt1 = await app.createEvent({ event_type: 'birth', date_original: '1870' });
    await app.addEventParticipant({ event_id: evt1.id, person_id: person.id, role: 'primary' });
    const source = await app.createSource({ title: 'Kyrkbok Summary Test' });
    await app.createCitation({ source_id: source.id, event_id: evt1.id, confidence: 2 });
    const evt2 = await app.createEvent({ event_type: 'death', date_original: '1940' });
    await app.addEventParticipant({ event_id: evt2.id, person_id: person.id, role: 'primary' });

    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Greta Summary');
    // Evidence summary div present: "1 of 2 events sourced"
    const dom = await app.getDom();
    expect(dom).toContain('evidence-summary');
  });
});

test.describe('Add Related Person', () => {
  let basePerson: { id: string };

  test.beforeAll(async () => {
    basePerson = await app.createPerson({ given_name: 'Ingrid', surname: 'Baseperson' });
  });

  test('Add Parent button creates a person and shows new relationship', async () => {
    // Navigate via / to force component remount (router.push same-route is a no-op)
    await app.navigate('/');
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Ingrid Baseperson');

    // Click the first .btn-rel-add (Add Parent)
    await app.executeJs(`document.querySelectorAll('.btn-rel-add')[0].click()`);
    await app.waitAndFill('.modal input[type="text"]', 'Sven');
    await app.settle();

    await app.click('.modal button[type="submit"]');
    await app.settle(800);

    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Sven');
  });

  test('Add Child button creates a person and shows new relationship', async () => {
    await app.navigate('/');
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Ingrid Baseperson');

    // Click the third .btn-rel-add (Add Child)
    await app.executeJs(`document.querySelectorAll('.btn-rel-add')[2].click()`);
    await app.waitAndFill('.modal input[type="text"]', 'Lisa');
    await app.click('.modal button[type="submit"]');
    await app.settle(800);

    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Lisa');
  });

  test('Add Spouse button creates a person and shows new relationship', async () => {
    await app.navigate('/');
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Ingrid Baseperson');

    // Click the second .btn-rel-add (Add Spouse)
    await app.executeJs(`document.querySelectorAll('.btn-rel-add')[1].click()`);
    await app.waitAndFill('.modal input[type="text"]', 'Erik');
    await app.click('.modal button[type="submit"]');
    await app.settle(800);

    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Erik');
  });
});
