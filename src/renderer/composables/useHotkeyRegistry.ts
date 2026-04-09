export interface Hotkey {
  key: string;         // e.g. 'p', '1', '/', 'Escape', 'Delete', 'Ctrl+.'
  action: () => void;
  description: string; // for ? help listing
}

interface HotkeyBatch {
  id: number;
  hotkeys: Hotkey[];
}

/**
 * Parses a hotkey definition string into its modifier and bare key components.
 * Supports 'Ctrl+<key>' combos. Returns { requiresCtrl, bareKey }.
 */
function parseHotkeyDef(key: string): { requiresCtrl: boolean; bareKey: string } {
  if (key.startsWith('Ctrl+')) {
    return { requiresCtrl: true, bareKey: key.slice(5) };
  }
  return { requiresCtrl: false, bareKey: key };
}

/**
 * Returns true if the event matches the hotkey definition.
 */
function matchesEvent(hotkey: Hotkey, event: KeyboardEvent): boolean {
  const { requiresCtrl, bareKey } = parseHotkeyDef(hotkey.key);

  if (requiresCtrl) {
    // Ctrl+combo: require ctrlKey or metaKey (Mac), and the bare key
    if (!event.ctrlKey && !event.metaKey) return false;
    return event.key === bareKey;
  }

  // Single-key hotkey: must not have any modifier held
  if (event.ctrlKey || event.metaKey || event.altKey) return false;

  // Case-insensitive match for single letter keys
  return event.key.toLowerCase() === bareKey.toLowerCase();
}

/**
 * Returns true if the hotkey should be allowed even inside an input field.
 * Only Escape and Ctrl+combo hotkeys pass through.
 */
function allowedInInput(hotkey: Hotkey): boolean {
  if (hotkey.key === 'Escape') return true;
  if (hotkey.key.startsWith('Ctrl+')) return true;
  return false;
}

/**
 * Default implementation of active element detection.
 * Injected so tests can override without needing a real DOM.
 */
function defaultIsInputFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export class HotkeyRegistry {
  private globalHotkeys: Hotkey[] = [];
  private viewBatches: HotkeyBatch[] = [];
  private nextBatchId = 0;
  private isInputFocused: () => boolean;

  /**
   * @param isInputFocused - Optional override for testing; defaults to checking document.activeElement.
   */
  constructor(isInputFocused?: () => boolean) {
    this.isInputFocused = isInputFocused ?? defaultIsInputFocused;
  }

  /** Set the global hotkey list (replaces any previous global hotkeys). */
  registerGlobal(hotkeys: Hotkey[]): void {
    this.globalHotkeys = hotkeys;
  }

  /**
   * Add a batch of view-scoped hotkeys.
   * Returns a cleanup function that removes exactly this batch.
   */
  registerView(hotkeys: Hotkey[]): () => void {
    const id = this.nextBatchId++;
    this.viewBatches.push({ id, hotkeys });
    return () => {
      this.viewBatches = this.viewBatches.filter((b) => b.id !== id);
    };
  }

  /**
   * Process a keydown event.
   * Returns true if a hotkey was matched and its action was called.
   *
   * Priority: view-scoped hotkeys (all batches, accumulated) override global.
   * When an input field is focused, only Escape and Ctrl+combos are allowed.
   */
  handleKeydown(event: KeyboardEvent): boolean {
    const inInput = this.isInputFocused();

    // Build the effective hotkey list: view hotkeys take priority over global.
    const viewHotkeys = this.viewBatches.flatMap((b) => b.hotkeys);

    // Collect all keys covered by view hotkeys (so global ones are shadowed)
    const viewKeys = new Set(viewHotkeys.map((h) => h.key.toLowerCase()));

    const candidates: Hotkey[] = [
      ...viewHotkeys,
      ...this.globalHotkeys.filter((h) => !viewKeys.has(h.key.toLowerCase())),
    ];

    for (const hotkey of candidates) {
      if (inInput && !allowedInInput(hotkey)) continue;
      if (matchesEvent(hotkey, event)) {
        hotkey.action();
        return true;
      }
    }

    return false;
  }

  /**
   * List all registered hotkeys (view overrides global for same key).
   * Used by the ? help announcement.
   */
  listAll(): { key: string; description: string }[] {
    const viewHotkeys = this.viewBatches.flatMap((b) => b.hotkeys);
    const viewKeys = new Set(viewHotkeys.map((h) => h.key.toLowerCase()));

    const merged: Hotkey[] = [
      ...viewHotkeys,
      ...this.globalHotkeys.filter((h) => !viewKeys.has(h.key.toLowerCase())),
    ];

    // Deduplicate by key (keep first occurrence — view hotkeys are first)
    const seen = new Set<string>();
    const result: { key: string; description: string }[] = [];
    for (const h of merged) {
      const normalKey = h.key.toLowerCase();
      if (!seen.has(normalKey)) {
        seen.add(normalKey);
        result.push({ key: h.key, description: h.description });
      }
    }
    return result;
  }

  /** Clear all hotkeys. */
  destroy(): void {
    this.globalHotkeys = [];
    this.viewBatches = [];
  }
}
