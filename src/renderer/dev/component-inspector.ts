// Dev-only component & i18n inspector.
//
// Hold Alt to activate. Hover any element to see the nearest Vue component's
// name + source file, plus any i18n keys whose translated value matches the
// hovered text. Click while holding Alt to copy a paste-ready string to the
// clipboard. Release Alt and everything disappears — no footprint when idle.
//
// Wired in from main.ts behind import.meta.env.DEV.

import type { I18n } from 'vue-i18n';

type ComponentHit = { name: string; file: string; element: Element };
type I18nMessages = Record<string, unknown>;

const SKIP_COMPONENT_NAMES = new Set([
  'RouterView',
  'RouterLink',
  'Transition',
  'TransitionGroup',
  'KeepAlive',
  'Suspense',
  'Teleport',
  'Anonymous',
]);

function buildValueToKeys(messages: I18nMessages): Map<string, string[]> {
  const out = new Map<string, string[]>();
  function walk(obj: unknown, path: string): void {
    if (obj == null) return;
    if (typeof obj === 'string') {
      const norm = obj.trim();
      if (!norm) return;
      const list = out.get(norm) ?? [];
      list.push(path);
      out.set(norm, list);
      return;
    }
    if (typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k);
    }
  }
  walk(messages, '');
  return out;
}

function findComponentHit(start: Element | null): ComponentHit | null {
  let node: (Element & { __vueParentComponent?: { type?: { __name?: string; name?: string; __file?: string }; vnode?: { el?: Element } } }) | null = start as never;
  while (node) {
    const inst = node.__vueParentComponent;
    if (inst?.type) {
      const name = inst.type.__name || inst.type.name || '';
      if (name && !SKIP_COMPONENT_NAMES.has(name)) {
        const el = (inst.vnode?.el as Element) || node;
        return { name, file: inst.type.__file || '', element: el };
      }
    }
    node = node.parentElement as never;
  }
  return null;
}

function shortPath(file: string): string {
  if (!file) return '';
  const idx = file.indexOf('/src/');
  return idx >= 0 ? file.slice(idx + 1) : file;
}

function nearestText(el: Element): string {
  const text = (el.textContent ?? '').trim();
  if (!text || text.length > 200) return '';
  return text;
}

function makeDiv(style: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = style;
  return el;
}

export function installComponentInspector(i18n: I18n): void {
  if (!import.meta.env.DEV) return;

  const tooltip = document.createElement('div');
  tooltip.setAttribute('data-dev-inspector', 'tooltip');
  tooltip.style.cssText = [
    'position:fixed',
    'z-index:2147483646',
    'background:rgba(20,22,30,0.96)',
    'color:#f5f7fa',
    'font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'padding:7px 10px',
    'border-radius:6px',
    'pointer-events:none',
    'box-shadow:0 6px 20px rgba(0,0,0,0.35)',
    'max-width:380px',
    'display:none',
    'white-space:normal',
    'word-break:break-word',
  ].join(';');
  document.body.appendChild(tooltip);

  const outline = document.createElement('div');
  outline.setAttribute('data-dev-inspector', 'outline');
  outline.style.cssText = [
    'position:fixed',
    'z-index:2147483645',
    'border:2px solid #4f9eff',
    'background:rgba(79,158,255,0.12)',
    'pointer-events:none',
    'display:none',
    'border-radius:3px',
    'transition:all 60ms ease-out',
  ].join(';');
  document.body.appendChild(outline);

  const toast = document.createElement('div');
  toast.setAttribute('data-dev-inspector', 'toast');
  toast.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:2147483647',
    'background:#1d6ad6',
    'color:#fff',
    'font:13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'padding:10px 16px',
    'border-radius:6px',
    'box-shadow:0 6px 20px rgba(0,0,0,0.3)',
    'pointer-events:none',
    'display:none',
  ].join(';');
  document.body.appendChild(toast);

  const composer = (i18n as unknown as { global: { messages: { value: Record<string, I18nMessages> }; locale: { value: string }; fallbackLocale: { value: string | string[] } } }).global;
  let valueToKeys = new Map<string, string[]>();
  function rebuildI18nIndex(): void {
    const merged = new Map<string, string[]>();
    const locales = [composer.locale.value];
    const fb = composer.fallbackLocale.value;
    if (Array.isArray(fb)) locales.push(...fb);
    else if (typeof fb === 'string') locales.push(fb);
    for (const loc of locales) {
      const msgs = composer.messages.value[loc];
      if (!msgs) continue;
      for (const [val, keys] of buildValueToKeys(msgs)) {
        const list = merged.get(val) ?? [];
        for (const k of keys) if (!list.includes(k)) list.push(k);
        merged.set(val, list);
      }
    }
    valueToKeys = merged;
  }
  rebuildI18nIndex();

  let active = false;
  let lastHit: ComponentHit | null = null;
  let lastI18nKeys: string[] = [];
  let lastText = '';

  function setActive(on: boolean): void {
    if (active === on) return;
    active = on;
    if (on) {
      document.documentElement.style.cursor = 'crosshair';
      rebuildI18nIndex();
    } else {
      document.documentElement.style.cursor = '';
      tooltip.style.display = 'none';
      outline.style.display = 'none';
      lastHit = null;
      lastI18nKeys = [];
      lastText = '';
    }
  }

  function findI18nKeysForElement(el: Element): { text: string; keys: string[] } {
    let cur: Element | null = el;
    for (let depth = 0; depth < 4 && cur; depth++) {
      const txt = nearestText(cur);
      if (txt && valueToKeys.has(txt)) {
        return { text: txt, keys: valueToKeys.get(txt)!.slice(0, 4) };
      }
      cur = cur.parentElement;
    }
    return { text: '', keys: [] };
  }

  function renderTooltip(hit: ComponentHit, keys: string[]): void {
    tooltip.replaceChildren();
    const name = makeDiv('font-weight:600;font-size:13px');
    name.textContent = hit.name;
    tooltip.appendChild(name);

    const filePart = shortPath(hit.file);
    if (filePart) {
      const fileEl = makeDiv('opacity:0.7;font-size:11px;font-family:ui-monospace,Menlo,Consolas,monospace;margin-top:1px');
      fileEl.textContent = filePart;
      tooltip.appendChild(fileEl);
    }

    if (keys.length) {
      const sect = makeDiv('margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.12)');
      const label = makeDiv('opacity:0.6;font-size:10px;text-transform:uppercase;letter-spacing:0.5px');
      label.textContent = 'i18n';
      sect.appendChild(label);
      for (const k of keys) {
        const row = makeDiv('font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px');
        row.textContent = k;
        sect.appendChild(row);
      }
      tooltip.appendChild(sect);
    }

    const hint = makeDiv('margin-top:6px;opacity:0.55;font-size:10px');
    hint.textContent = 'click to copy';
    tooltip.appendChild(hint);
  }

  function update(e: MouseEvent): void {
    if (!active) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === tooltip || target === outline || target === toast) {
      tooltip.style.display = 'none';
      outline.style.display = 'none';
      return;
    }
    const hit = findComponentHit(target);
    if (!hit) {
      tooltip.style.display = 'none';
      outline.style.display = 'none';
      lastHit = null;
      return;
    }
    const { text, keys } = findI18nKeysForElement(target);
    lastHit = hit;
    lastI18nKeys = keys;
    lastText = text;

    const rect = hit.element.getBoundingClientRect();
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    outline.style.display = 'block';

    renderTooltip(hit, keys);
    tooltip.style.display = 'block';

    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + tw > window.innerWidth - 8) x = e.clientX - tw - 14;
    if (y + th > window.innerHeight - 8) y = e.clientY - th - 14;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  let toastTimer: number | null = null;
  function showToast(msg: string): void {
    toast.textContent = msg;
    toast.style.display = 'block';
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.style.display = 'none'; }, 1600);
  }

  function onClickCapture(e: MouseEvent): void {
    if (!active || !lastHit) return;
    e.preventDefault();
    e.stopPropagation();
    const lines = [
      `Component: ${lastHit.name}`,
      lastHit.file ? `File: ${shortPath(lastHit.file)}` : '',
      lastI18nKeys.length ? `i18n: ${lastI18nKeys.join(', ')}` : '',
      lastText ? `Text: "${lastText}"` : '',
    ].filter(Boolean);
    const payload = lines.join('\n');
    navigator.clipboard.writeText(payload).then(
      () => showToast(`Copied: ${lastHit?.name ?? ''}`),
      () => showToast('Clipboard blocked'),
    );
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Alt' || e.altKey) setActive(true);
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Alt' || !e.altKey) setActive(false);
  }
  function onBlur(): void { setActive(false); }

  window.addEventListener('mousemove', update, { passive: true, capture: true });
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('click', onClickCapture, true);

  let prevLocale = composer.locale.value;
  window.setInterval(() => {
    if (composer.locale.value !== prevLocale) {
      prevLocale = composer.locale.value;
      rebuildI18nIndex();
    }
  }, 1000);

  // eslint-disable-next-line no-console
  console.info('%c[dev-inspector]', 'color:#4f9eff;font-weight:bold', 'Hold Alt to inspect components — click while holding Alt to copy.');
}
