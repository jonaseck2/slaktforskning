// Renderer-side ARIA resolver shared by `ui_aria_list` + `ui_aria_invoke`.
//
// This module is loaded by the dev MCP server (Node-side, in `dev/ui.ts`).
// The function `runAriaQuery` below is written so that its body — taken via
// `.toString()` and embedded in an `/eval` payload — runs inside the
// renderer's window against the live DOM. Doing it this way keeps the logic
// unit-testable: unit tests import `runAriaQuery` directly and exercise it
// against a happy-dom fixture, which is the same shape it sees in the
// running app.
//
// Read this file alongside `src/renderer/directives/narrate.ts`. That
// directive stores the curated `v-narrate` text on `narrationMap`, a
// WeakMap exposed at module load as `window.__narrationMap`. Step 1 of the
// accessible-name priority below reads from that WeakMap directly.

export type AriaListResult = {
  matches: Array<{
    index: number;
    name: string;
    role: string;
    region: string | null;
    tag: string;
    disabled: boolean;
    hidden: boolean;
  }>;
  total: number;
};

export type AriaInvokeResult = {
  invoked: { name: string; role: string; region: string | null; tag: string };
  value_set?: string;
};

export type AriaQueryMode = 'list' | 'invoke';

export type AriaQueryOpts = {
  // list-mode
  region?: string;
  role?: string;
  limit?: number;
  include_disabled?: boolean;
  include_hidden?: boolean;
  // invoke-mode
  name?: string;
  value?: string;
};

// The function literal that gets serialized into the eval payload. It MUST
// be self-contained — no closure references, no imports — so its `.toString()`
// is runnable in the renderer. Keep it pure JS-flavored TypeScript: assume
// `window`/`document` exist, narrow types via inline casts only when they
// improve readability.
//
// Returns:
//  - mode 'list'    → AriaListResult
//  - mode 'invoke'  → AriaInvokeResult
//  - on error       → { error: string } (the wrapper in dev/ui.ts re-throws)
export function runAriaQuery(
  mode: AriaQueryMode,
  opts: AriaQueryOpts
): AriaListResult | AriaInvokeResult | { error: string } {
  const w = window as unknown as { __narrationMap?: WeakMap<HTMLElement, string | (() => string)> };
  const narrationMap = w.__narrationMap;

  // ARIA roles we consider "interactable". This is the set the agent needs
  // for navigation tasks; it intentionally excludes container roles
  // (region, group, list) so `ui_aria_list` returns affordances, not layout.
  const INTERACTABLE_ROLES = new Set([
    'button', 'link', 'tab', 'textbox', 'searchbox', 'checkbox',
    'combobox', 'radio', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'option', 'switch', 'slider', 'spinbutton',
  ]);

  // Map a DOM element to its ARIA role. Honors an explicit `role` attribute
  // first; falls back to the implicit role for the tag.
  function elementRole(el: Element): string | null {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
      if (t === 'button' || t === 'submit' || t === 'reset' || t === 'image') return 'button';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'range') return 'slider';
      if (t === 'search') return 'searchbox';
      if (t === 'number') return 'spinbutton';
      if (t === 'hidden' || t === 'file' || t === 'color') return null;
      return 'textbox';
    }
    return null;
  }

  // Visible text content, trimmed. Mirrors the spirit of
  // narrate.ts:visibleTextContent (skips aria-hidden) without the
  // "+" → "add" rewrite — that rewrite is TTS-specific, not ARIA-name.
  function visibleText(el: Element): string {
    let out = '';
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3 /* TEXT_NODE */) {
        out += node.textContent ?? '';
      } else if (node.nodeType === 1 /* ELEMENT_NODE */) {
        const child = node as Element;
        if (child.getAttribute('aria-hidden') === 'true') continue;
        out += visibleText(child);
      }
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  // Seven-step accessible-name resolution. Returns empty string if no source
  // produces a non-empty name — the caller treats empty as "not nameable".
  function accessibleName(el: Element): string {
    // 1. v-narrate (curated by the app — wins over everything because it
    //    is what the screen reader would announce).
    if (narrationMap) {
      const source = narrationMap.get(el as HTMLElement);
      if (source) {
        try {
          const text = typeof source === 'function' ? source() : source;
          if (text && text.trim()) return text.trim();
        } catch {
          // Reactive narration that throws mid-render — fall through to
          // the static sources rather than crashing the whole query.
        }
      }
    }
    // 2. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    // 3. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts: string[] = [];
      for (const id of labelledBy.split(/\s+/)) {
        const ref = id ? document.getElementById(id) : null;
        if (ref) {
          const t = (ref.textContent ?? '').trim();
          if (t) parts.push(t);
        }
      }
      if (parts.length) return parts.join(' ');
    }
    // 4. <label for="id"> association (for form controls with an id)
    const id = el.getAttribute('id');
    if (id) {
      const label = document.querySelector('label[for="' + (window.CSS && window.CSS.escape ? window.CSS.escape(id) : id) + '"]');
      if (label) {
        const t = (label.textContent ?? '').trim();
        if (t) return t;
      }
    }
    // 5. Own visible text content (trimmed, aria-hidden excluded)
    const own = visibleText(el);
    if (own) return own;
    // 6. placeholder (form controls)
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) return ph.trim();
    // 7. title
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    return '';
  }

  // Region resolution: walk ancestors. First hit wins. Returns null when no
  // landmark/dialog/section ancestor exists.
  function regionFor(el: Element): { el: Element; name: string } | null {
    let cur: Element | null = el.parentElement;
    while (cur && cur !== document.body) {
      const role = cur.getAttribute('role');
      const tag = cur.tagName.toLowerCase();
      const isLandmark =
        role === 'dialog' ||
        (role === 'region' && cur.hasAttribute('aria-label')) ||
        (tag === 'section' && cur.hasAttribute('aria-label')) ||
        tag === 'header' || tag === 'aside' || tag === 'main';
      if (isLandmark) {
        const name = accessibleName(cur);
        if (name) return { el: cur, name };
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // Hidden = aria-hidden="true" anywhere in the ancestor chain, or computed
  // display:none / visibility:hidden. We deliberately treat aria-hidden as
  // inherited (an aria-hidden container hides its children from AT) to
  // match how screen readers see the tree.
  function isHidden(el: Element): boolean {
    let cur: Element | null = el;
    while (cur && cur !== document.body) {
      if (cur.getAttribute('aria-hidden') === 'true') return true;
      cur = cur.parentElement;
    }
    const cs = (typeof getComputedStyle === 'function') ? getComputedStyle(el) : null;
    if (cs) {
      if (cs.display === 'none') return true;
      if (cs.visibility === 'hidden') return true;
    }
    return false;
  }

  function isDisabled(el: Element): boolean {
    if (el.hasAttribute('disabled')) return true;
    if (el.getAttribute('aria-disabled') === 'true') return true;
    return false;
  }

  // Collect every interactable in the document. We start from a CSS query
  // for the union of interactable tags / role attributes — much cheaper
  // than walking the entire tree and asking elementRole() per node.
  function collectInteractables(): Array<{ el: Element; role: string; name: string; region: { el: Element; name: string } | null }> {
    const SELECTOR = 'a[href], button, input, select, textarea, [role]';
    const candidates = Array.from(document.querySelectorAll(SELECTOR));
    const out: Array<{ el: Element; role: string; name: string; region: { el: Element; name: string } | null }> = [];
    for (const el of candidates) {
      const role = elementRole(el);
      if (!role || !INTERACTABLE_ROLES.has(role)) continue;
      const name = accessibleName(el);
      if (!name) continue;
      out.push({ el, role, name, region: regionFor(el) });
    }
    return out;
  }

  // ----- mode: list -------------------------------------------------------
  if (mode === 'list') {
    const wantRegion = opts.region ?? null;
    const wantRole = opts.role ?? null;
    const includeDisabled = opts.include_disabled === true;
    const includeHidden = opts.include_hidden === true;
    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));

    const all = collectInteractables();
    const filtered = all.filter((it) => {
      if (wantRole && it.role !== wantRole) return false;
      if (wantRegion && (it.region?.name ?? null) !== wantRegion) return false;
      const disabled = isDisabled(it.el);
      const hidden = isHidden(it.el);
      if (!includeDisabled && disabled) return false;
      if (!includeHidden && hidden) return false;
      return true;
    });
    const truncated = filtered.slice(0, limit);
    return {
      matches: truncated.map((it, i) => ({
        index: i,
        name: it.name,
        role: it.role,
        region: it.region?.name ?? null,
        tag: it.el.tagName.toLowerCase(),
        disabled: isDisabled(it.el),
        hidden: isHidden(it.el),
      })),
      total: filtered.length,
    };
  }

  // ----- mode: invoke -----------------------------------------------------
  const wantName = opts.name;
  const wantRole = opts.role ?? null;
  const wantRegion = opts.region ?? null;
  const value = opts.value;

  if (!wantName) return { error: 'name is required' };

  const all = collectInteractables();
  // Match: name equals AND (role matches or wasn't constrained) AND (region
  // matches or wasn't constrained). Hidden / disabled elements are kept in
  // the candidate set so the agent gets a precise error if they only match
  // hidden things.
  const visibleEnabled = all.filter((it) => !isHidden(it.el) && !isDisabled(it.el));
  const matches = visibleEnabled.filter((it) => {
    if (it.name !== wantName) return false;
    if (wantRole && it.role !== wantRole) return false;
    if (wantRegion && (it.region?.name ?? null) !== wantRegion) return false;
    return true;
  });

  if (matches.length === 0) {
    const where = wantRegion ? '"' + wantRegion + '"' : '"current view"';
    return { error: 'No interactable named "' + wantName + '" in ' + where + '. Try ui_aria_list to see what is available.' };
  }
  if (matches.length > 1) {
    const candidates = matches.map((it) => ({
      name: it.name,
      role: it.role,
      region: it.region?.name ?? null,
      tag: it.el.tagName.toLowerCase(),
    }));
    return {
      error:
        'Multiple matches for "' + wantName +
        '" — disambiguate with role or region. Candidates: ' +
        JSON.stringify(candidates),
    };
  }

  const hit = matches[0];
  const isInputRole = hit.role === 'textbox' || hit.role === 'searchbox' || hit.role === 'combobox';

  if (value !== undefined) {
    if (!isInputRole) {
      return { error: 'value is only valid for textbox, searchbox, or combobox roles; got ' + hit.role + '.' };
    }
    const el = hit.el;
    const tag = el.tagName.toLowerCase();
    const proto = tag === 'textarea'
      ? (HTMLTextAreaElement.prototype as unknown as { value: string })
      : (HTMLInputElement.prototype as unknown as { value: string });
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const setter = desc && desc.set;
    if (setter) {
      setter.call(el, value);
    } else {
      (el as HTMLInputElement).value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      invoked: { name: hit.name, role: hit.role, region: hit.region?.name ?? null, tag },
      value_set: value,
    };
  }

  hit.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return {
    invoked: { name: hit.name, role: hit.role, region: hit.region?.name ?? null, tag: hit.el.tagName.toLowerCase() },
  };
}

// Body of the function, serialized for /eval. We strip the function header
// + the trailing brace and re-wrap as an IIFE so the renderer can run it
// with our opts inlined as JSON literals.
//
// NOTE: relying on `.toString()` of a function defined in this TS file is
// safe as long as the compiled output is plain JS (ESBuild/Vite output is).
// If the build ever switches to a tree-shaker that renames inner identifiers
// in unexpected ways, write a fixture test that runs the serialized form
// (we already test the function directly, which catches logic regressions —
// but the eval path is separately exercised by the live smoke in Task 3).
const FN_SOURCE = runAriaQuery.toString();

/** Build the `/eval` payload for `ui_aria_list`. */
export function buildAriaListScript(opts: AriaQueryOpts): string {
  return '(' + FN_SOURCE + ')(' + JSON.stringify('list') + ',' + JSON.stringify(opts) + ')';
}

/** Build the `/eval` payload for `ui_aria_invoke`. */
export function buildAriaInvokeScript(opts: AriaQueryOpts): string {
  return '(' + FN_SOURCE + ')(' + JSON.stringify('invoke') + ',' + JSON.stringify(opts) + ')';
}
