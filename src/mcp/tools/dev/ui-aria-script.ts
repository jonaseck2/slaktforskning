// Renderer-side ARIA resolver shared by every `ui_aria_*` dev MCP tool.
//
// This module is loaded by the dev MCP server (Node-side, in `dev/ui.ts`).
// The function `runAriaQuery` below is written so that its body — taken via
// `.toString()` and embedded in an `/eval` payload — runs inside the
// renderer's window against the live DOM. Doing it this way keeps the logic
// unit-testable: unit tests import `runAriaQuery` directly and exercise it
// against a happy-dom fixture, which is the same shape it sees in the
// running app. A separate serialization-round-trip test evaluates the
// `buildAria*Script` outputs to catch drift between direct-call and
// serialized form (the two v1 production-only bugs lived there).
//
// Read this file alongside `src/renderer/directives/narrate.ts`. That
// directive stores the curated `v-narrate` text on `narrationMap`, a
// WeakMap exposed at module load as `window.__narrationMap`. Step 1 of the
// accessible-name priority below reads from that WeakMap directly.

export type AriaState = {
  pressed?: boolean;
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  current?: string;
  busy?: boolean;
  invalid?: boolean;
  required?: boolean;
};

export type AriaInteractable = {
  index: number;
  name: string;
  role: string;
  region: string | null;
  tag: string;
  disabled: boolean;
  hidden: boolean;
} & AriaState;

export type AriaListResult = {
  matches: AriaInteractable[];
  total: number;
};

export type AriaInvokeResult = {
  invoked: { name: string; role: string; region: string | null; tag: string };
  value_set?: string;
};

export type AriaTabOrderEntry = AriaInteractable & { tab_index: number };
export type AriaTabOrderResult = { matches: AriaTabOrderEntry[]; total: number };

export type AriaLandmark = {
  role: string;
  name: string | null;
  has_name: boolean;
  tag: string;
  child_interactable_count: number;
  region: string | null;
  busy?: boolean;
};
export type AriaLandmarksResult = { landmarks: AriaLandmark[]; total: number };

export type AriaHeading = { level: number; text: string; region: string | null; tag: string };
export type AriaHeadingsResult = { headings: AriaHeading[]; total: number };

export type AriaReadUnit =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list_item'; text: string }
  | { kind: 'interactable'; name: string; role: string; state: AriaState };
export type AriaReadResult = { units: AriaReadUnit[]; region: string | null };

export type AriaAuditFinding = {
  kind:
    | 'unnamed_interactable'
    | 'unnamed_landmark'
    | 'input_without_label'
    | 'tab_strip_without_role'
    | 'positive_tabindex'
    | 'disabled_focusable';
  severity: 'low' | 'medium' | 'high';
  tag: string;
  role?: string;
  region?: string;
  hint: string;
};
export type AriaAuditResult = { findings: AriaAuditFinding[]; total: number };

export type AriaQueryMode =
  | 'list'
  | 'invoke'
  | 'tab_order'
  | 'landmarks'
  | 'headings'
  | 'read'
  | 'audit';

export type AriaQueryOpts = {
  // list / tab_order / headings / read / audit
  region?: string;
  // list / tab_order
  role?: string;
  limit?: number;
  include_disabled?: boolean;
  include_hidden?: boolean;
  // invoke
  name?: string;
  value?: string;
};

export type AriaQueryResult =
  | AriaListResult
  | AriaInvokeResult
  | AriaTabOrderResult
  | AriaLandmarksResult
  | AriaHeadingsResult
  | AriaReadResult
  | AriaAuditResult
  | { error: string };

// The function literal that gets serialized into the eval payload. It MUST
// be self-contained — no closure references, no imports — so its `.toString()`
// is runnable in the renderer. Keep it pure JS-flavored TypeScript: assume
// `window`/`document` exist, narrow types via inline casts only when they
// improve readability.
export function runAriaQuery(
  mode: AriaQueryMode,
  opts: AriaQueryOpts
): AriaQueryResult {
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

  // Landmark roles + tags. Used by both region-resolution and the landmarks
  // mode. A landmark contributes a *named region* only when it has a
  // discoverable accessible name; an unnamed landmark still shows up in
  // `ui_aria_landmarks` with `has_name: false` so the agent + audit see it.
  const LANDMARK_ROLES = new Set([
    'main', 'navigation', 'banner', 'complementary', 'contentinfo',
    'search', 'form', 'region', 'dialog',
  ]);
  function implicitLandmarkRole(tag: string): string | null {
    if (tag === 'main') return 'main';
    if (tag === 'nav') return 'navigation';
    if (tag === 'header') return 'banner';
    if (tag === 'footer') return 'contentinfo';
    if (tag === 'aside') return 'complementary';
    if (tag === 'section') return 'region';
    return null;
  }
  function landmarkRoleOf(el: Element): string | null {
    const explicit = el.getAttribute('role');
    if (explicit && LANDMARK_ROLES.has(explicit)) return explicit;
    return implicitLandmarkRole(el.tagName.toLowerCase());
  }

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
  // narrate.ts:visibleTextContent (skips aria-hidden).
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
  // produces a non-empty name. The caller treats empty as "not nameable".
  function accessibleName(el: Element): string {
    // 1. v-narrate (curated by the app — wins over everything).
    if (narrationMap) {
      const source = narrationMap.get(el as HTMLElement);
      if (source) {
        try {
          const text = typeof source === 'function' ? source() : source;
          if (text && text.trim()) return text.trim();
        } catch {
          // Reactive narration that throws mid-render — fall through.
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
    // 4. <label for="id"> association — also accepts an implicit (wrapping)
    // <label> ancestor (the HTML spec form). Either form makes the label
    // programmatically associated with the input for screen readers.
    const id = el.getAttribute('id');
    if (id) {
      const label = document.querySelector('label[for="' + (window.CSS && window.CSS.escape ? window.CSS.escape(id) : id) + '"]');
      if (label) {
        const t = (label.textContent ?? '').trim();
        if (t) return t;
      }
    }
    {
      let cur: Element | null = el.parentElement;
      while (cur && cur !== document.body) {
        if (cur.tagName.toLowerCase() === 'label') {
          const t = (cur.textContent ?? '').trim();
          if (t) return t;
          break;
        }
        cur = cur.parentElement;
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

  // Where the name came from. Used by the audit to detect inputs whose only
  // accessible name is a placeholder or title — both poor substitutes for a
  // real label.
  function nameSource(el: Element): 'narrate' | 'aria-label' | 'aria-labelledby' | 'label-for' | 'text' | 'placeholder' | 'title' | 'none' {
    if (narrationMap) {
      const source = narrationMap.get(el as HTMLElement);
      if (source) {
        try {
          const t = typeof source === 'function' ? source() : source;
          if (t && t.trim()) return 'narrate';
        } catch { /* ignore */ }
      }
    }
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return 'aria-label';
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      for (const id of lb.split(/\s+/)) {
        const ref = id ? document.getElementById(id) : null;
        if (ref && (ref.textContent ?? '').trim()) return 'aria-labelledby';
      }
    }
    const id = el.getAttribute('id');
    if (id) {
      const lbl = document.querySelector('label[for="' + (window.CSS && window.CSS.escape ? window.CSS.escape(id) : id) + '"]');
      if (lbl && (lbl.textContent ?? '').trim()) return 'label-for';
    }
    {
      // Implicit (wrapping) <label> ancestor. WHATWG spec treats it as a
      // form-control labelling association.
      let cur: Element | null = el.parentElement;
      while (cur && cur !== document.body) {
        if (cur.tagName.toLowerCase() === 'label') {
          if ((cur.textContent ?? '').trim()) return 'label-for';
          break;
        }
        cur = cur.parentElement;
      }
    }
    if (visibleText(el)) return 'text';
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) return 'placeholder';
    const t = el.getAttribute('title');
    if (t && t.trim()) return 'title';
    return 'none';
  }

  // Region resolution: walk ancestors. Only count a landmark as a *named*
  // region when it has a discoverable accessible name AND is one of the
  // explicit landmark roles. Bare `<main>`/`<header>` etc. without
  // aria-label = not a named region (the v1 region-flooding bug).
  function regionFor(el: Element): { el: Element; name: string } | null {
    let cur: Element | null = el.parentElement;
    while (cur && cur !== document.body) {
      const role = landmarkRoleOf(cur);
      if (role) {
        // A dialog without aria-label is rare but plausible (a modal whose
        // title is its first heading). For the named-region purpose we
        // require an explicit name from one of: aria-label, aria-labelledby,
        // or v-narrate. Visible-text fall-through is forbidden — that was
        // the v1 bug.
        const name = explicitNameOnly(cur);
        if (name) return { el: cur, name };
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // Like accessibleName but stops at step 4 — never falls through to visible
  // text / placeholder / title. Used for landmark naming so a landmark's
  // entire descendant tree doesn't become its "name".
  function explicitNameOnly(el: Element): string {
    if (narrationMap) {
      const source = narrationMap.get(el as HTMLElement);
      if (source) {
        try {
          const text = typeof source === 'function' ? source() : source;
          if (text && text.trim()) return text.trim();
        } catch { /* ignore */ }
      }
    }
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const parts: string[] = [];
      for (const id of lb.split(/\s+/)) {
        const ref = id ? document.getElementById(id) : null;
        if (ref) {
          const t = (ref.textContent ?? '').trim();
          if (t) parts.push(t);
        }
      }
      if (parts.length) return parts.join(' ');
    }
    return '';
  }

  // Hidden = aria-hidden="true" anywhere in the ancestor chain, or computed
  // display:none / visibility:hidden. We deliberately treat aria-hidden as
  // inherited (an aria-hidden container hides its children from AT).
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

  // Compute the state-fields object for an element. Only emits truthy
  // fields — the result is spread onto the interactable record so empty
  // state stays absent rather than `{ pressed: false, expanded: undefined }`.
  function stateOf(el: Element): AriaState {
    const out: AriaState = {};
    const pressed = el.getAttribute('aria-pressed');
    if (pressed === 'true') out.pressed = true;
    const expanded = el.getAttribute('aria-expanded');
    if (expanded === 'true') out.expanded = true;
    else if (expanded === 'false') out.expanded = false;
    const selected = el.getAttribute('aria-selected');
    if (selected === 'true') out.selected = true;
    const ariaChecked = el.getAttribute('aria-checked');
    if (ariaChecked === 'true') out.checked = true;
    else if (ariaChecked === 'false') out.checked = false;
    else if (ariaChecked === 'mixed') out.checked = 'mixed';
    else {
      // Native input.checked for checkbox / radio.
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') {
        const t = ((el as HTMLInputElement).type || '').toLowerCase();
        if (t === 'checkbox' || t === 'radio') {
          if ((el as HTMLInputElement).checked) out.checked = true;
        }
      }
    }
    const current = el.getAttribute('aria-current');
    if (current && current !== 'false') out.current = current;
    if (el.getAttribute('aria-busy') === 'true') out.busy = true;
    if (el.getAttribute('aria-invalid') === 'true') out.invalid = true;
    if (el.hasAttribute('required') || el.getAttribute('aria-required') === 'true') out.required = true;
    return out;
  }

  // Collect every interactable in the document. Cheap CSS query first, then
  // filter by computed role.
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

  // Resolve tab order. Tabindex >= 1 comes first (ascending), then 0 +
  // natively focusable in DOM order. Tabindex -1 is excluded (programmatic
  // focus only, not in tab sequence). Hidden / disabled excluded.
  function collectTabOrder(): Array<{ el: Element; role: string; name: string; region: { el: Element; name: string } | null; tabIndex: number; resolvedTabIndex: number }> {
    const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]';
    const candidates = Array.from(document.querySelectorAll(FOCUSABLE));
    const out: Array<{ el: Element; role: string; name: string; region: { el: Element; name: string } | null; tabIndex: number; resolvedTabIndex: number }> = [];
    for (const el of candidates) {
      if (isHidden(el) || isDisabled(el)) continue;
      const tiRaw = el.getAttribute('tabindex');
      const ti = tiRaw === null ? 0 : parseInt(tiRaw, 10);
      if (isNaN(ti)) continue;
      if (ti < 0) continue;
      // Treat as tab-eligible. Natively focusable + tabindex=0 share order = DOM.
      // Positive tabindex jumps the queue.
      out.push({
        el,
        role: elementRole(el) ?? '',
        name: accessibleName(el),
        region: regionFor(el),
        tabIndex: ti,
        resolvedTabIndex: 0, // filled in after sort
      });
    }
    // Stable sort: positive tabindex ascending first, then 0 in DOM order.
    out.sort((a, b) => {
      if (a.tabIndex > 0 && b.tabIndex > 0) return a.tabIndex - b.tabIndex;
      if (a.tabIndex > 0 && b.tabIndex === 0) return -1;
      if (a.tabIndex === 0 && b.tabIndex > 0) return 1;
      return 0; // both 0 — preserve DOM order (Array#sort is stable in modern JS)
    });
    out.forEach((entry, i) => { entry.resolvedTabIndex = i; });
    return out;
  }

  // Collect every landmark (named or not).
  function collectLandmarks(): AriaLandmark[] {
    const all = Array.from(document.querySelectorAll('main, nav, header, footer, aside, section, [role]'));
    const result: AriaLandmark[] = [];
    const seen = new Set<Element>();
    for (const el of all) {
      if (seen.has(el)) continue;
      seen.add(el);
      const role = landmarkRoleOf(el);
      if (!role) continue;
      if (isHidden(el)) continue;
      const name = explicitNameOnly(el);
      const hasName = name.length > 0;
      // Count direct-or-descendant interactables in this landmark. Cheap:
      // querySelectorAll within the landmark + role filter.
      let count = 0;
      const inner = el.querySelectorAll('a[href], button, input, select, textarea, [role]');
      for (const child of Array.from(inner)) {
        const r = elementRole(child);
        if (r && INTERACTABLE_ROLES.has(r) && !isHidden(child) && accessibleName(child)) count++;
      }
      // Parent landmark (for nesting). Don't count self.
      let parentRegion: string | null = null;
      let cur: Element | null = el.parentElement;
      while (cur && cur !== document.body) {
        if (landmarkRoleOf(cur)) {
          const pn = explicitNameOnly(cur);
          if (pn) { parentRegion = pn; break; }
        }
        cur = cur.parentElement;
      }
      const entry: AriaLandmark = {
        role,
        name: hasName ? name : null,
        has_name: hasName,
        tag: el.tagName.toLowerCase(),
        child_interactable_count: count,
        region: parentRegion,
      };
      if (el.getAttribute('aria-busy') === 'true') entry.busy = true;
      result.push(entry);
    }
    return result;
  }

  function collectHeadings(scope: Element | null): AriaHeading[] {
    const root = scope ?? document.body;
    const all = root.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
    const out: AriaHeading[] = [];
    for (const el of Array.from(all)) {
      if (isHidden(el)) continue;
      const tag = el.tagName.toLowerCase();
      let level: number;
      const explicitLevel = el.getAttribute('aria-level');
      if (explicitLevel) {
        level = parseInt(explicitLevel, 10);
        if (isNaN(level)) continue;
      } else if (/^h[1-6]$/.test(tag)) {
        level = parseInt(tag.slice(1), 10);
      } else {
        continue; // [role="heading"] without aria-level — skip
      }
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const region = regionFor(el)?.name ?? null;
      out.push({ level, text, region, tag });
    }
    return out;
  }

  function findRegionElement(name: string): Element | null {
    const all = Array.from(document.querySelectorAll('main, nav, header, footer, aside, section, [role]'));
    for (const el of all) {
      if (!landmarkRoleOf(el)) continue;
      if (explicitNameOnly(el) === name) return el;
    }
    return null;
  }

  function collectReadingUnits(scope: Element): AriaReadUnit[] {
    const out: AriaReadUnit[] = [];
    const walk = (el: Element): void => {
      for (const child of Array.from(el.children)) {
        if (isHidden(child)) continue;
        const tag = child.tagName.toLowerCase();
        // Heading
        if (/^h[1-6]$/.test(tag) || child.getAttribute('role') === 'heading') {
          const txt = (child.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (txt) {
            const lvlAttr = child.getAttribute('aria-level');
            const level = lvlAttr ? parseInt(lvlAttr, 10) : parseInt(tag.slice(1), 10);
            if (!isNaN(level)) {
              out.push({ kind: 'heading', level, text: txt });
              continue;
            }
          }
        }
        // Paragraph
        if (tag === 'p') {
          const txt = (child.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (txt) out.push({ kind: 'paragraph', text: txt });
          continue;
        }
        // List item
        if (tag === 'li') {
          const txt = (child.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (txt) out.push({ kind: 'list_item', text: txt });
          continue;
        }
        // Interactable
        const role = elementRole(child);
        if (role && INTERACTABLE_ROLES.has(role)) {
          const name = accessibleName(child);
          if (name) {
            out.push({ kind: 'interactable', name, role, state: stateOf(child) });
            continue;
          }
        }
        // Recurse
        walk(child);
      }
    };
    walk(scope);
    return out;
  }

  function audit(scope: Element): AriaAuditFinding[] {
    const findings: AriaAuditFinding[] = [];
    const HINTS: Record<AriaAuditFinding['kind'], string> = {
      unnamed_interactable: 'Element is interactable but has no accessible name. Add aria-label, v-narrate, or a <label for="...">.',
      unnamed_landmark: 'Landmark has no aria-label. Screen-reader users cannot jump to it by name. Add aria-label or remove the landmark role.',
      input_without_label: 'Input has no associated <label for="..."> or aria-label. Placeholder/title alone is not a label.',
      tab_strip_without_role: 'Looks like a tab strip but uses role="button" on each tab. Add role="tablist" to the parent and role="tab" + aria-selected to each chip.',
      positive_tabindex: 'Positive tabindex (>=1) overrides natural tab order in ways that surprise keyboard users. Use tabindex="0" or rely on DOM order.',
      disabled_focusable: 'Element has aria-disabled="true" but is still in the tab order. Either add the `disabled` attribute (removes from tab order) or add tabindex="-1".',
    };
    // 1. unnamed_interactable — every interactable role with no accessible name
    const ints = scope.querySelectorAll('a[href], button, input, select, textarea, [role]');
    for (const el of Array.from(ints)) {
      const role = elementRole(el);
      if (!role || !INTERACTABLE_ROLES.has(role)) continue;
      if (isHidden(el)) continue;
      if (accessibleName(el)) continue;
      findings.push({
        kind: 'unnamed_interactable',
        severity: 'high',
        tag: el.tagName.toLowerCase(),
        role,
        region: regionFor(el)?.name ?? undefined,
        hint: HINTS.unnamed_interactable,
      });
    }
    // 2. unnamed_landmark
    const lmAll = scope.querySelectorAll('main, nav, header, footer, aside, section, [role]');
    for (const el of Array.from(lmAll)) {
      const role = landmarkRoleOf(el);
      if (!role) continue;
      if (isHidden(el)) continue;
      // `<header>` and `<footer>` are only landmarks when their nearest
      // ancestor is `<body>` (otherwise they're sectioning content) — but
      // the audit is heuristic; reporting an unnamed inner `<header>` is
      // still useful information.
      if (explicitNameOnly(el)) continue;
      findings.push({
        kind: 'unnamed_landmark',
        severity: 'medium',
        tag: el.tagName.toLowerCase(),
        role,
        region: regionFor(el)?.name ?? undefined,
        hint: HINTS.unnamed_landmark,
      });
    }
    // 3. input_without_label
    const inputs = scope.querySelectorAll('input, textarea, select');
    for (const el of Array.from(inputs)) {
      if (isHidden(el)) continue;
      const t = (el.tagName.toLowerCase() === 'input') ? ((el as HTMLInputElement).type || 'text').toLowerCase() : '';
      if (t === 'hidden' || t === 'submit' || t === 'reset' || t === 'button') continue;
      const src = nameSource(el);
      if (src === 'narrate' || src === 'aria-label' || src === 'aria-labelledby' || src === 'label-for') continue;
      findings.push({
        kind: 'input_without_label',
        severity: 'high',
        tag: el.tagName.toLowerCase(),
        role: elementRole(el) ?? undefined,
        region: regionFor(el)?.name ?? undefined,
        hint: HINTS.input_without_label,
      });
    }
    // 4. tab_strip_without_role — heuristic: a parent container with 3+ visible button children whose names are all short (<= 20 chars) and none has role=tab.
    const allButtons = scope.querySelectorAll('button');
    const parentCounts = new Map<Element, Element[]>();
    for (const btn of Array.from(allButtons)) {
      if (isHidden(btn)) continue;
      if (btn.getAttribute('role') === 'tab') continue;
      const parent = btn.parentElement;
      if (!parent) continue;
      if (parent.getAttribute('role') === 'tablist') continue;
      if (!parentCounts.has(parent)) parentCounts.set(parent, []);
      parentCounts.get(parent)!.push(btn);
    }
    for (const [parent, btns] of parentCounts) {
      if (btns.length < 3) continue;
      // All names short + non-empty
      let chipShaped = true;
      for (const b of btns) {
        const n = accessibleName(b);
        if (!n || n.length > 30) { chipShaped = false; break; }
      }
      if (!chipShaped) continue;
      findings.push({
        kind: 'tab_strip_without_role',
        severity: 'medium',
        tag: parent.tagName.toLowerCase(),
        region: regionFor(parent)?.name ?? undefined,
        hint: HINTS.tab_strip_without_role,
      });
    }
    // 5. positive_tabindex
    const tabbables = scope.querySelectorAll('[tabindex]');
    for (const el of Array.from(tabbables)) {
      const ti = parseInt(el.getAttribute('tabindex') ?? '', 10);
      if (isNaN(ti) || ti < 1) continue;
      findings.push({
        kind: 'positive_tabindex',
        severity: 'low',
        tag: el.tagName.toLowerCase(),
        role: elementRole(el) ?? undefined,
        region: regionFor(el)?.name ?? undefined,
        hint: HINTS.positive_tabindex,
      });
    }
    // 6. disabled_focusable
    const ariaDisabled = scope.querySelectorAll('[aria-disabled="true"]');
    for (const el of Array.from(ariaDisabled)) {
      if (el.hasAttribute('disabled')) continue;
      const ti = el.getAttribute('tabindex');
      if (ti === '-1') continue;
      findings.push({
        kind: 'disabled_focusable',
        severity: 'low',
        tag: el.tagName.toLowerCase(),
        role: elementRole(el) ?? undefined,
        region: regionFor(el)?.name ?? undefined,
        hint: HINTS.disabled_focusable,
      });
    }
    // Sort: high → medium → low, then kind alphabetically.
    const SEV: Record<string, number> = { high: 0, medium: 1, low: 2 };
    findings.sort((a, b) => {
      if (SEV[a.severity] !== SEV[b.severity]) return SEV[a.severity] - SEV[b.severity];
      return a.kind.localeCompare(b.kind);
    });
    return findings;
  }

  // -------------------------------------------------------------------------
  // Mode dispatch
  // -------------------------------------------------------------------------

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
        ...stateOf(it.el),
      })),
      total: filtered.length,
    };
  }

  if (mode === 'tab_order') {
    const wantRegion = opts.region ?? null;
    const wantRole = opts.role ?? null;
    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
    const all = collectTabOrder();
    const filtered = all.filter((it) => {
      if (wantRole && it.role !== wantRole) return false;
      if (wantRegion && (it.region?.name ?? null) !== wantRegion) return false;
      // tab_order intentionally omits unnamed items (you can't tab-narrate
      // what has no name) and disabled/hidden (already filtered upstream).
      if (!it.name) return false;
      return true;
    });
    const truncated = filtered.slice(0, limit);
    return {
      matches: truncated.map((it, i) => ({
        index: i,
        tab_index: it.resolvedTabIndex,
        name: it.name,
        role: it.role,
        region: it.region?.name ?? null,
        tag: it.el.tagName.toLowerCase(),
        disabled: false,
        hidden: false,
        ...stateOf(it.el),
      })),
      total: filtered.length,
    };
  }

  if (mode === 'landmarks') {
    const all = collectLandmarks();
    return { landmarks: all, total: all.length };
  }

  if (mode === 'headings') {
    const scope = opts.region ? findRegionElement(opts.region) : null;
    const all = collectHeadings(scope);
    return { headings: all, total: all.length };
  }

  if (mode === 'read') {
    const scopeEl = opts.region ? findRegionElement(opts.region) : (document.body as Element);
    if (!scopeEl) return { error: 'No region named "' + (opts.region ?? '') + '" — try ui_aria_landmarks to see available regions.' };
    const units = collectReadingUnits(scopeEl);
    return { units, region: opts.region ?? null };
  }

  if (mode === 'audit') {
    const scopeEl = opts.region ? findRegionElement(opts.region) : (document.body as Element);
    if (!scopeEl) return { error: 'No region named "' + (opts.region ?? '') + '" — try ui_aria_landmarks to see available regions.' };
    const findings = audit(scopeEl);
    return { findings, total: findings.length };
  }

  // mode === 'invoke'
  const wantName = opts.name;
  const wantRole = opts.role ?? null;
  const wantRegion = opts.region ?? null;
  const value = opts.value;

  if (!wantName) return { error: 'name is required' };

  const allI = collectInteractables();
  const visibleEnabled = allI.filter((it) => !isHidden(it.el) && !isDisabled(it.el));
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

// Body of the function, serialized for /eval. esbuild (Vite's bundler)
// inlines `__name(fn, "fn")` calls inside function bodies as a debugger
// naming aid; the helper lives at module scope in the bundled output and is
// undefined in the renderer when we `.toString()` the function. Shim it.
const FN_SOURCE = runAriaQuery.toString();
const PREAMBLE = 'var __name=function(fn){return fn};';

function buildScript(mode: AriaQueryMode, opts: AriaQueryOpts): string {
  return '(function(){' + PREAMBLE + 'return (' + FN_SOURCE + ')(' + JSON.stringify(mode) + ',' + JSON.stringify(opts) + ');})()';
}

export function buildAriaListScript(opts: AriaQueryOpts): string { return buildScript('list', opts); }
export function buildAriaInvokeScript(opts: AriaQueryOpts): string { return buildScript('invoke', opts); }
export function buildAriaTabOrderScript(opts: AriaQueryOpts): string { return buildScript('tab_order', opts); }
export function buildAriaLandmarksScript(opts: AriaQueryOpts): string { return buildScript('landmarks', opts); }
export function buildAriaHeadingsScript(opts: AriaQueryOpts): string { return buildScript('headings', opts); }
export function buildAriaReadScript(opts: AriaQueryOpts): string { return buildScript('read', opts); }
export function buildAriaAuditScript(opts: AriaQueryOpts): string { return buildScript('audit', opts); }
