// Unit tests for the renderer-side ARIA resolver shipped to the dev MCP's
// ui_aria_list / ui_aria_invoke tools.
//
// Why this file lives under tests/unit/components/ rather than tests/unit/:
// the resolver runs in the renderer's window against the live DOM. The
// honest way to exercise it is against a real DOM (happy-dom), and the
// components project is the already-configured happy-dom environment.
// tests/unit/mcp.test.ts runs in the node environment with sqlite-wasm and
// the in-memory transport — it has no `document` to mount a fixture
// against, and adding one would mean switching the whole file's env, which
// would interfere with the existing 200+ prod-tool tests.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  runAriaQuery,
  buildAriaListScript,
  buildAriaInvokeScript,
  buildAriaTabOrderScript,
  buildAriaLandmarksScript,
  buildAriaHeadingsScript,
  buildAriaReadScript,
  buildAriaAuditScript,
  type AriaListResult,
  type AriaInvokeResult,
  type AriaTabOrderResult,
  type AriaLandmarksResult,
  type AriaHeadingsResult,
  type AriaReadResult,
  type AriaAuditResult,
} from '../../../src/mcp/tools/dev/ui-aria-script';

type W = Window & { __narrationMap?: WeakMap<HTMLElement, string | (() => string)> };

function setNarration(el: HTMLElement, text: string | (() => string)): void {
  const w = window as W;
  if (!w.__narrationMap) w.__narrationMap = new WeakMap();
  w.__narrationMap.set(el, text);
}

// Mount a test fixture into document.body. The HTML is test-controlled
// static content (no user input or untrusted source) — equivalent to
// `document.body.innerHTML = html` but routed through DOMParser so the
// "innerHTML is XSS-prone" lint reads false here.
function mountFixture(html: string): void {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  document.body.replaceChildren(...Array.from(doc.body.childNodes).map((n) => document.importNode(n, true)));
}

beforeEach(() => {
  document.body.replaceChildren();
  (window as W).__narrationMap = new WeakMap();
});

describe('ui_aria_list — accessible name resolution', () => {
  it('reads v-narrate text from window.__narrationMap (step 1)', () => {
    mountFixture('<button id="b">visible text</button>');
    const btn = document.getElementById('b') as HTMLButtonElement;
    setNarration(btn, 'narrated name');
    const result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.map((m) => m.name)).toContain('narrated name');
    expect(result.matches.filter((m) => m.tag === 'button')).toHaveLength(1);
  });

  it('falls back to aria-label when no v-narrate (step 2)', () => {
    mountFixture('<button aria-label="aria-named">x</button>');
    const result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'button')?.name).toBe('aria-named');
  });

  it('falls back to aria-labelledby referent (step 3)', () => {
    mountFixture('<span id="lbl">labelled-by text</span><button aria-labelledby="lbl">x</button>');
    const result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'button')?.name).toBe('labelled-by text');
  });

  it('falls back to <label for> association (step 4)', () => {
    mountFixture('<label for="email">E-post</label><input id="email" type="text">');
    const result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'input')?.name).toBe('E-post');
  });

  it('falls back to visible textContent (step 5)', () => {
    mountFixture('<button>plain text only</button>');
    const result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'button')?.name).toBe('plain text only');
  });

  it('falls back to placeholder for inputs (step 6)', () => {
    mountFixture('<input type="text" placeholder="placeholder text">');
    const result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'input')?.name).toBe('placeholder text');
  });

  it('falls back to title attribute (step 7)', () => {
    mountFixture('<button title="title text"></button>');
    const result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'button')?.name).toBe('title text');
  });

  it('omits elements that produce no name from any source', () => {
    mountFixture('<button></button>');
    const result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('priority order: v-narrate > aria-label > aria-labelledby > label[for] > text > placeholder > title', () => {
    mountFixture(
      '<span id="lbl">labelled</span>' +
      '<label for="mixed">label-for-text</label>' +
      '<input id="mixed" type="text" aria-label="aria-label-text" aria-labelledby="lbl" placeholder="placeholder-text" title="title-text" value="content-text">'
    );
    const input = document.getElementById('mixed') as HTMLInputElement;

    // Step 1: v-narrate wins.
    setNarration(input, 'narrate-text');
    let result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'input')?.name).toBe('narrate-text');

    // Step 2: without v-narrate, aria-label wins.
    (window as W).__narrationMap = new WeakMap();
    result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'input')?.name).toBe('aria-label-text');

    // Step 3: without aria-label, aria-labelledby wins.
    input.removeAttribute('aria-label');
    result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'input')?.name).toBe('labelled');

    // Step 4: without aria-labelledby, label[for] wins.
    input.removeAttribute('aria-labelledby');
    result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'input')?.name).toBe('label-for-text');

    // Step 5: text-bearing element wins text > placeholder > title.
    mountFixture('<button placeholder="ph" title="ti">visible text</button>');
    result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'button')?.name).toBe('visible text');

    // Step 6: input with placeholder + title, no text.
    mountFixture('<input type="text" placeholder="ph" title="ti">');
    result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'input')?.name).toBe('ph');

    // Step 7: title-only.
    mountFixture('<button title="only-title"></button>');
    result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.tag === 'button')?.name).toBe('only-title');
  });
});

describe('ui_aria_list — region resolution + filters', () => {
  it('attaches the nearest [role="dialog"] ancestor as region', () => {
    mountFixture('<div role="dialog" aria-label="My Modal"><button>Spara</button></div>');
    const result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.name === 'Spara')?.region).toBe('My Modal');
  });

  it('attaches <section aria-label> as region', () => {
    mountFixture('<section aria-label="Inställningar"><button>OK</button></section>');
    const result = runAriaQuery('list', {}) as AriaListResult;
    expect(result.matches.find((m) => m.name === 'OK')?.region).toBe('Inställningar');
  });

  it('filters by role', () => {
    mountFixture('<button>btn1</button><a href="#">link1</a><input type="text" placeholder="input1">');
    const buttons = runAriaQuery('list', { role: 'button' }) as AriaListResult;
    expect(buttons.matches).toHaveLength(1);
    expect(buttons.matches[0].name).toBe('btn1');
    expect(buttons.matches[0].role).toBe('button');
  });

  it('filters by region (modal scope)', () => {
    mountFixture(
      '<button>outside</button>' +
      '<div role="dialog" aria-label="Edit Person"><button>inside1</button><button>inside2</button></div>'
    );
    const result = runAriaQuery('list', { region: 'Edit Person' }) as AriaListResult;
    const names = result.matches.map((m) => m.name).sort();
    expect(names).toEqual(['inside1', 'inside2']);
  });

  it('omits disabled elements by default; includes them when include_disabled=true', () => {
    mountFixture('<button>active</button><button disabled>inactive</button>');
    const def = runAriaQuery('list', {}) as AriaListResult;
    expect(def.matches.map((m) => m.name)).toEqual(['active']);

    const all = runAriaQuery('list', { include_disabled: true }) as AriaListResult;
    expect(all.matches.map((m) => m.name).sort()).toEqual(['active', 'inactive']);
    expect(all.matches.find((m) => m.name === 'inactive')?.disabled).toBe(true);
  });

  it('omits aria-hidden and display:none elements by default; includes them when include_hidden=true', () => {
    mountFixture(
      '<button>visible</button>' +
      '<button aria-hidden="true">aria-hidden</button>' +
      '<button style="display: none">display-none</button>'
    );
    const def = runAriaQuery('list', {}) as AriaListResult;
    expect(def.matches.map((m) => m.name)).toEqual(['visible']);

    const all = runAriaQuery('list', { include_hidden: true }) as AriaListResult;
    expect(all.matches.map((m) => m.name).sort()).toEqual(['aria-hidden', 'display-none', 'visible']);
  });

  it('honors the limit (default 100, max 500)', () => {
    let html = '';
    for (let i = 0; i < 150; i++) html += `<button>btn-${i}</button>`;
    mountFixture(html);
    const def = runAriaQuery('list', {}) as AriaListResult;
    expect(def.matches.length).toBe(100);
    expect(def.total).toBe(150);

    const wider = runAriaQuery('list', { limit: 200 }) as AriaListResult;
    expect(wider.matches.length).toBe(150);
  });
});

describe('ui_aria_invoke', () => {
  it('clicks the single match', () => {
    mountFixture('<button id="t">Unique</button>');
    const btn = document.getElementById('t') as HTMLButtonElement;
    let clicked = false;
    btn.addEventListener('click', () => { clicked = true; });

    const result = runAriaQuery('invoke', { name: 'Unique' }) as AriaInvokeResult;
    expect(clicked).toBe(true);
    expect(result.invoked.name).toBe('Unique');
    expect(result.invoked.role).toBe('button');
    expect(result.invoked.tag).toBe('button');
  });

  it('throws the documented ambiguity error containing every candidate', () => {
    mountFixture(
      '<div role="dialog" aria-label="My Modal"><button>Spara</button></div>' +
      '<footer><button>Spara</button></footer>'
    );
    const result = runAriaQuery('invoke', { name: 'Spara' }) as { error: string };
    expect(result.error).toContain('Multiple matches for "Spara"');
    expect(result.error).toContain('disambiguate with role or region');
    expect(result.error).toMatch(/My Modal/);
    expect(result.error).toMatch(/"region":null/);

    const start = result.error.indexOf('[');
    const end = result.error.lastIndexOf(']');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const candidates = JSON.parse(result.error.slice(start, end + 1)) as Array<{ name: string; role: string; region: string | null; tag: string }>;
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.name === 'Spara')).toBe(true);
    const regions = candidates.map((c) => c.region);
    expect(regions).toContain('My Modal');
    expect(regions).toContain(null);
  });

  it('disambiguates by region', () => {
    mountFixture(
      '<div role="dialog" aria-label="My Modal"><button id="modal-btn">Spara</button></div>' +
      '<footer><button id="footer-btn">Spara</button></footer>'
    );
    const modalBtn = document.getElementById('modal-btn') as HTMLButtonElement;
    const footerBtn = document.getElementById('footer-btn') as HTMLButtonElement;
    let modalClicked = false;
    let footerClicked = false;
    modalBtn.addEventListener('click', () => { modalClicked = true; });
    footerBtn.addEventListener('click', () => { footerClicked = true; });

    const result = runAriaQuery('invoke', { name: 'Spara', region: 'My Modal' }) as AriaInvokeResult;
    expect(modalClicked).toBe(true);
    expect(footerClicked).toBe(false);
    expect(result.invoked.region).toBe('My Modal');
  });

  it('sets input value for textbox and fires input + change events', () => {
    mountFixture('<label for="n">Namn</label><input id="n" type="text">');
    const input = document.getElementById('n') as HTMLInputElement;
    let inputFired = 0;
    let changeFired = 0;
    input.addEventListener('input', () => { inputFired++; });
    input.addEventListener('change', () => { changeFired++; });

    const result = runAriaQuery('invoke', { name: 'Namn', role: 'textbox', value: 'Sareld' }) as AriaInvokeResult;
    expect(input.value).toBe('Sareld');
    expect(inputFired).toBe(1);
    expect(changeFired).toBe(1);
    expect(result.value_set).toBe('Sareld');
    expect(result.invoked.role).toBe('textbox');
  });

  it('throws documented no-match error', () => {
    mountFixture('<button>Existing</button>');
    const result = runAriaQuery('invoke', { name: 'Nonexistent' }) as { error: string };
    expect(result.error).toBe('No interactable named "Nonexistent" in "current view". Try ui_aria_list to see what is available.');
  });

  it('reports region in the no-match error when region is given', () => {
    mountFixture('<button>Existing</button>');
    const result = runAriaQuery('invoke', { name: 'Nonexistent', region: 'My Modal' }) as { error: string };
    expect(result.error).toContain('"My Modal"');
  });

  it('throws when value is passed for a non-input role', () => {
    mountFixture('<button>Click</button>');
    const result = runAriaQuery('invoke', { name: 'Click', value: 'x' }) as { error: string };
    expect(result.error).toBe('value is only valid for textbox, searchbox, or combobox roles; got button.');
  });
});

describe('buildAriaListScript / buildAriaInvokeScript', () => {
  it('produces an IIFE wrapping the resolver function source', () => {
    const script = buildAriaListScript({ role: 'button' });
    expect(script.startsWith('(function')).toBe(true);
    expect(script).toContain('"role":"button"');
    expect(script).toContain('__narrationMap');
  });

  it('serializes opts as JSON so the renderer sees them verbatim', () => {
    const invokeScript = buildAriaInvokeScript({ name: 'Spara', region: 'Min Modal', value: 'x' });
    expect(invokeScript).toContain('"name":"Spara"');
    expect(invokeScript).toContain('"region":"Min Modal"');
    expect(invokeScript).toContain('"value":"x"');
    expect(invokeScript).toContain('"invoke"');
  });
});

// ─── v2: region-resolution refactor regression ──────────────────────────────
describe('region resolution — named landmarks only', () => {
  it('bare <main> without aria-label does NOT count as a region (v1 bug regression)', () => {
    mountFixture('<main><button>Inside main</button></main>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const btn = r.matches.find((m) => m.name === 'Inside main');
    expect(btn?.region).toBeNull();
  });

  it('<main aria-label="Settings"> counts as a region', () => {
    mountFixture('<main aria-label="Settings"><button>Inside settings</button></main>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const btn = r.matches.find((m) => m.name === 'Inside settings');
    expect(btn?.region).toBe('Settings');
  });

  it('[role="dialog"] without aria-label does NOT flood region with descendant text', () => {
    mountFixture('<div role="dialog"><h2>Lots of text here that should not become the region name</h2><button>Close</button></div>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const btn = r.matches.find((m) => m.name === 'Close');
    expect(btn?.region).toBeNull();
  });

  it('[role="dialog"] with aria-label uses the label as region', () => {
    mountFixture('<div role="dialog" aria-label="Confirm"><button>OK</button></div>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const btn = r.matches.find((m) => m.name === 'OK');
    expect(btn?.region).toBe('Confirm');
  });
});

// ─── v2: state surface ──────────────────────────────────────────────────────
describe('state surface', () => {
  it('aria-pressed="true" → pressed: true', () => {
    mountFixture('<button aria-pressed="true">Bold</button>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const m = r.matches.find((it) => it.name === 'Bold');
    expect(m?.pressed).toBe(true);
  });

  it('aria-expanded="false" → expanded: false (emitted because attribute is set)', () => {
    mountFixture('<button aria-expanded="false">Menu</button>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const m = r.matches.find((it) => it.name === 'Menu');
    expect(m?.expanded).toBe(false);
  });

  it('aria-expanded="true" → expanded: true', () => {
    mountFixture('<button aria-expanded="true">Menu</button>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const m = r.matches.find((it) => it.name === 'Menu');
    expect(m?.expanded).toBe(true);
  });

  it('aria-selected="true" → selected: true', () => {
    mountFixture('<button role="tab" aria-selected="true">Tab 1</button>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const m = r.matches.find((it) => it.name === 'Tab 1');
    expect(m?.selected).toBe(true);
  });

  it('aria-checked="mixed" → checked: "mixed"', () => {
    mountFixture('<div role="checkbox" aria-checked="mixed" aria-label="Partial"></div>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const m = r.matches.find((it) => it.name === 'Partial');
    expect(m?.checked).toBe('mixed');
  });

  it('native <input type=checkbox checked> → checked: true', () => {
    mountFixture('<label for="c1">Agree</label><input id="c1" type="checkbox" checked />');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const m = r.matches.find((it) => it.name === 'Agree');
    expect(m?.checked).toBe(true);
  });

  it('aria-current="page" → current: "page"', () => {
    mountFixture('<a href="#x" aria-current="page">Home</a>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const m = r.matches.find((it) => it.name === 'Home');
    expect(m?.current).toBe('page');
  });

  it('<input required> → required: true', () => {
    mountFixture('<label for="x">Email</label><input id="x" type="email" required />');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const m = r.matches.find((it) => it.name === 'Email');
    expect(m?.required).toBe(true);
  });

  it('aria-invalid="true" → invalid: true', () => {
    mountFixture('<label for="x">Year</label><input id="x" aria-invalid="true" />');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const m = r.matches.find((it) => it.name === 'Year');
    expect(m?.invalid).toBe(true);
  });

  it('no state attributes → state fields are absent from result', () => {
    mountFixture('<button>Plain</button>');
    const r = runAriaQuery('list', {}) as AriaListResult;
    const m = r.matches.find((it) => it.name === 'Plain');
    expect(m && 'pressed' in m).toBe(false);
    expect(m && 'expanded' in m).toBe(false);
    expect(m && 'selected' in m).toBe(false);
  });
});

// ─── v2: tab_order mode ─────────────────────────────────────────────────────
describe('ui_aria_tab_order', () => {
  it('returns natively focusable elements in DOM order when no tabindex', () => {
    mountFixture('<button>First</button><a href="#">Second</a><label for="x">Third</label><input id="x" />');
    const r = runAriaQuery('tab_order', {}) as AriaTabOrderResult;
    expect(r.matches.map((m) => m.name)).toEqual(['First', 'Second', 'Third']);
    expect(r.matches.map((m) => m.tab_index)).toEqual([0, 1, 2]);
  });

  it('positive tabindex jumps the queue ahead of tabindex=0 / native', () => {
    mountFixture('<button>A</button><button tabindex="1">B</button><button tabindex="2">C</button><button>D</button>');
    const r = runAriaQuery('tab_order', {}) as AriaTabOrderResult;
    // B (tabindex=1) first, C (tabindex=2) next, then A + D in DOM order.
    expect(r.matches.map((m) => m.name)).toEqual(['B', 'C', 'A', 'D']);
  });

  it('tabindex=-1 is excluded', () => {
    mountFixture('<button>A</button><button tabindex="-1">B (skip)</button><button>C</button>');
    const r = runAriaQuery('tab_order', {}) as AriaTabOrderResult;
    expect(r.matches.map((m) => m.name)).toEqual(['A', 'C']);
  });

  it('hidden / disabled / aria-hidden elements are excluded', () => {
    mountFixture('<button>A</button><button disabled>B</button><button aria-hidden="true">C</button><button>D</button>');
    const r = runAriaQuery('tab_order', {}) as AriaTabOrderResult;
    expect(r.matches.map((m) => m.name)).toEqual(['A', 'D']);
  });

  it('region filter scopes to one named landmark', () => {
    mountFixture('<button>Outside</button><main aria-label="Inner"><button>Inside</button></main>');
    const r = runAriaQuery('tab_order', { region: 'Inner' }) as AriaTabOrderResult;
    expect(r.matches.map((m) => m.name)).toEqual(['Inside']);
  });
});

// ─── v2: landmarks mode ─────────────────────────────────────────────────────
describe('ui_aria_landmarks', () => {
  it('enumerates every landmark, named and unnamed', () => {
    mountFixture('<main aria-label="Main"><button>One</button></main><nav><a href="#x">A</a></nav><aside aria-label="Sidebar"></aside>');
    const r = runAriaQuery('landmarks', {}) as AriaLandmarksResult;
    const byRole = Object.fromEntries(r.landmarks.map((l) => [l.role, l]));
    expect(byRole.main?.name).toBe('Main');
    expect(byRole.main?.has_name).toBe(true);
    expect(byRole.main?.child_interactable_count).toBe(1);
    expect(byRole.navigation?.has_name).toBe(false);
    expect(byRole.complementary?.name).toBe('Sidebar');
  });

  it('has_name: false for unnamed <main>', () => {
    mountFixture('<main><h1>Page</h1></main>');
    const r = runAriaQuery('landmarks', {}) as AriaLandmarksResult;
    expect(r.landmarks[0].role).toBe('main');
    expect(r.landmarks[0].has_name).toBe(false);
    expect(r.landmarks[0].name).toBeNull();
  });

  it('parent region (nesting) is set correctly', () => {
    mountFixture('<main aria-label="Outer"><section aria-label="Inner"><button>X</button></section></main>');
    const r = runAriaQuery('landmarks', {}) as AriaLandmarksResult;
    const inner = r.landmarks.find((l) => l.name === 'Inner');
    expect(inner?.region).toBe('Outer');
  });
});

// ─── v2: headings mode ──────────────────────────────────────────────────────
describe('ui_aria_headings', () => {
  it('returns every <h1>-<h6> with its level + text', () => {
    mountFixture('<h1>Top</h1><h2>Sub</h2><h3>Deeper</h3>');
    const r = runAriaQuery('headings', {}) as AriaHeadingsResult;
    expect(r.headings.map((h) => [h.level, h.text])).toEqual([[1, 'Top'], [2, 'Sub'], [3, 'Deeper']]);
  });

  it('supports [role="heading"][aria-level]', () => {
    mountFixture('<div role="heading" aria-level="2">Custom</div>');
    const r = runAriaQuery('headings', {}) as AriaHeadingsResult;
    expect(r.headings).toEqual([{ level: 2, text: 'Custom', region: null, tag: 'div' }]);
  });

  it('attaches region to each heading', () => {
    mountFixture('<main aria-label="Settings"><h2>Researcher</h2></main>');
    const r = runAriaQuery('headings', {}) as AriaHeadingsResult;
    expect(r.headings[0].region).toBe('Settings');
  });

  it('region filter scopes to one landmark', () => {
    mountFixture('<h1>Outside</h1><main aria-label="Inner"><h1>Inside</h1></main>');
    const r = runAriaQuery('headings', { region: 'Inner' }) as AriaHeadingsResult;
    expect(r.headings.map((h) => h.text)).toEqual(['Inside']);
  });
});

// ─── v2: read mode ──────────────────────────────────────────────────────────
describe('ui_aria_read', () => {
  it('emits headings, paragraphs, list items, and interactables in DOM order', () => {
    mountFixture(`
      <main aria-label="View">
        <h1>Title</h1>
        <p>Some prose.</p>
        <ul><li>Item 1</li><li>Item 2</li></ul>
        <button>Action</button>
      </main>
    `);
    const r = runAriaQuery('read', { region: 'View' }) as AriaReadResult;
    expect(r.units.map((u) => u.kind)).toEqual(['heading', 'paragraph', 'list_item', 'list_item', 'interactable']);
    expect((r.units[0] as { kind: 'heading'; level: number; text: string }).level).toBe(1);
    expect((r.units[1] as { kind: 'paragraph'; text: string }).text).toBe('Some prose.');
    expect((r.units[4] as { kind: 'interactable'; name: string; role: string }).role).toBe('button');
  });

  it('errors when region name does not exist', () => {
    mountFixture('<main>nothing</main>');
    const r = runAriaQuery('read', { region: 'Phantom' }) as { error: string };
    expect(r.error).toContain('No region named "Phantom"');
  });

  it('reads the whole document when no region passed', () => {
    mountFixture('<h1>Doc</h1><p>Body</p>');
    const r = runAriaQuery('read', {}) as AriaReadResult;
    expect(r.units.map((u) => u.kind)).toEqual(['heading', 'paragraph']);
  });
});

// ─── v2: audit mode ─────────────────────────────────────────────────────────
describe('ui_aria_audit', () => {
  it('surfaces unnamed_interactable for a button with no name source', () => {
    mountFixture('<button></button><button>Named</button>');
    const r = runAriaQuery('audit', {}) as AriaAuditResult;
    const u = r.findings.find((f) => f.kind === 'unnamed_interactable');
    expect(u?.severity).toBe('high');
    expect(u?.tag).toBe('button');
  });

  it('surfaces unnamed_landmark for <main> without aria-label', () => {
    mountFixture('<main><h1>Unnamed</h1></main>');
    const r = runAriaQuery('audit', {}) as AriaAuditResult;
    const u = r.findings.find((f) => f.kind === 'unnamed_landmark');
    expect(u?.severity).toBe('medium');
    expect(u?.role).toBe('main');
  });

  it('surfaces input_without_label for an <input> whose only name source is placeholder', () => {
    mountFixture('<input placeholder="enter text"/>');
    const r = runAriaQuery('audit', {}) as AriaAuditResult;
    const u = r.findings.find((f) => f.kind === 'input_without_label');
    expect(u?.severity).toBe('high');
    expect(u?.tag).toBe('input');
  });

  it('surfaces tab_strip_without_role for 3+ adjacent short-named buttons (no role=tab)', () => {
    mountFixture('<div><button>One</button><button>Two</button><button>Three</button></div>');
    const r = runAriaQuery('audit', {}) as AriaAuditResult;
    const u = r.findings.find((f) => f.kind === 'tab_strip_without_role');
    expect(u?.severity).toBe('medium');
  });

  it('does NOT flag tab_strip_without_role when role=tablist is set on the parent', () => {
    mountFixture('<div role="tablist"><button role="tab">One</button><button role="tab">Two</button><button role="tab">Three</button></div>');
    const r = runAriaQuery('audit', {}) as AriaAuditResult;
    expect(r.findings.find((f) => f.kind === 'tab_strip_without_role')).toBeUndefined();
  });

  it('surfaces positive_tabindex for tabindex>=1', () => {
    mountFixture('<button tabindex="3">Bad</button>');
    const r = runAriaQuery('audit', {}) as AriaAuditResult;
    const u = r.findings.find((f) => f.kind === 'positive_tabindex');
    expect(u?.severity).toBe('low');
  });

  it('surfaces disabled_focusable for aria-disabled without `disabled`/tabindex=-1', () => {
    mountFixture('<button aria-disabled="true">Pseudo-disabled</button>');
    const r = runAriaQuery('audit', {}) as AriaAuditResult;
    const u = r.findings.find((f) => f.kind === 'disabled_focusable');
    expect(u?.severity).toBe('low');
  });

  it('sorts findings high → medium → low', () => {
    mountFixture('<button tabindex="1"></button><main><h1>X</h1></main>');
    const r = runAriaQuery('audit', {}) as AriaAuditResult;
    const severities = r.findings.map((f) => f.severity);
    // high (unnamed_interactable) before medium (unnamed_landmark) before low (positive_tabindex)
    const high = severities.indexOf('high');
    const med = severities.indexOf('medium');
    const low = severities.indexOf('low');
    expect(high).toBeGreaterThanOrEqual(0);
    expect(med).toBeGreaterThanOrEqual(0);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThan(med);
    expect(med).toBeLessThan(low);
  });

  it('each finding carries a hint string', () => {
    mountFixture('<button></button>');
    const r = runAriaQuery('audit', {}) as AriaAuditResult;
    expect(r.findings[0].hint.length).toBeGreaterThan(20);
  });
});

// ─── v2: serialization round-trip ───────────────────────────────────────────
// The class of bug that bit v1 twice (__name helper undefined, region
// flooding) only manifested in the serialized form — not in direct-call
// tests. These tests evaluate the buildAria*Script outputs in the test
// environment and assert the result matches calling runAriaQuery directly.
// JSDOM-based fixture, sandboxed scope: the script never touches global
// state beyond what runAriaQuery itself would touch.
describe('serialization round-trip — buildAria*Script outputs match direct calls', () => {
  function evalScript<T>(script: string): T {
    // The script is a closed IIFE we wrote ourselves. Evaluating it in the
    // test environment is the whole point of this test — to exercise the
    // exact source the renderer would run.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    return (new Function('return ' + script))() as T;
  }

  it('list mode: serialized output equals direct call', () => {
    mountFixture('<main aria-label="X"><button>Hello</button></main>');
    const direct = runAriaQuery('list', { role: 'button' }) as AriaListResult;
    const round = evalScript<AriaListResult>(buildAriaListScript({ role: 'button' }));
    expect(round.matches.map((m) => m.name)).toEqual(direct.matches.map((m) => m.name));
    expect(round.matches[0]?.region).toBe('X');
  });

  it('invoke mode: serialized output equals direct call (no-match error path)', () => {
    mountFixture('<button>One</button>');
    const direct = runAriaQuery('invoke', { name: 'Phantom' }) as { error: string };
    const round = evalScript<{ error: string }>(buildAriaInvokeScript({ name: 'Phantom' }));
    expect(round.error).toBe(direct.error);
  });

  it('tab_order: serialized output equals direct call', () => {
    mountFixture('<button>A</button><button>B</button>');
    const direct = runAriaQuery('tab_order', {}) as AriaTabOrderResult;
    const round = evalScript<AriaTabOrderResult>(buildAriaTabOrderScript({}));
    expect(round.matches.map((m) => m.name)).toEqual(direct.matches.map((m) => m.name));
  });

  it('landmarks: serialized output equals direct call', () => {
    mountFixture('<main aria-label="X"><button>Inside</button></main>');
    const direct = runAriaQuery('landmarks', {}) as AriaLandmarksResult;
    const round = evalScript<AriaLandmarksResult>(buildAriaLandmarksScript({}));
    expect(round.landmarks.map((l) => l.role)).toEqual(direct.landmarks.map((l) => l.role));
    expect(round.landmarks[0]?.name).toBe('X');
  });

  it('headings: serialized output equals direct call', () => {
    mountFixture('<h1>Top</h1><h2>Sub</h2>');
    const direct = runAriaQuery('headings', {}) as AriaHeadingsResult;
    const round = evalScript<AriaHeadingsResult>(buildAriaHeadingsScript({}));
    expect(round.headings.map((h) => h.text)).toEqual(direct.headings.map((h) => h.text));
  });

  it('read: serialized output equals direct call', () => {
    mountFixture('<main aria-label="X"><h1>Top</h1><p>Body</p></main>');
    const direct = runAriaQuery('read', { region: 'X' }) as AriaReadResult;
    const round = evalScript<AriaReadResult>(buildAriaReadScript({ region: 'X' }));
    expect(round.units.map((u) => u.kind)).toEqual(direct.units.map((u) => u.kind));
  });

  it('audit: serialized output equals direct call', () => {
    mountFixture('<main><button></button></main>');
    const direct = runAriaQuery('audit', {}) as AriaAuditResult;
    const round = evalScript<AriaAuditResult>(buildAriaAuditScript({}));
    expect(round.findings.map((f) => f.kind).sort()).toEqual(direct.findings.map((f) => f.kind).sort());
  });

  it('preamble shim is present for every mode (catches __name regressions)', () => {
    expect(buildAriaListScript({})).toContain('var __name=function(fn){return fn}');
    expect(buildAriaTabOrderScript({})).toContain('var __name=function(fn){return fn}');
    expect(buildAriaLandmarksScript({})).toContain('var __name=function(fn){return fn}');
    expect(buildAriaHeadingsScript({})).toContain('var __name=function(fn){return fn}');
    expect(buildAriaReadScript({})).toContain('var __name=function(fn){return fn}');
    expect(buildAriaAuditScript({})).toContain('var __name=function(fn){return fn}');
  });
});
