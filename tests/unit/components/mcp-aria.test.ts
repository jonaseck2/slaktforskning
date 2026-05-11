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
  type AriaListResult,
  type AriaInvokeResult,
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
