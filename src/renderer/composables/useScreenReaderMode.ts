import { ref, computed } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { resolveNarration } from '../directives/narrate';
import { narratePageEntry } from '../utils/screenReaderNarration';
import { HotkeyRegistry } from './useHotkeyRegistry';
import type { Hotkey } from './useHotkeyRegistry';
import { useTTS } from './useTTS';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TtsMode = 'off' | 'narrate' | 'screenReader';

const LS_MODE_KEY = 'slaktforskning-tts-mode';
const LS_LEGACY_KEY = 'slaktforskning-tts';

// ---------------------------------------------------------------------------
// Singleton module-level state
// ---------------------------------------------------------------------------

function loadInitialMode(): TtsMode {
  try {
    const stored = localStorage.getItem(LS_MODE_KEY);
    if (stored === 'off' || stored === 'narrate' || stored === 'screenReader') {
      return stored;
    }
    // Migrate from legacy boolean key
    const legacy = localStorage.getItem(LS_LEGACY_KEY);
    if (legacy !== null) {
      const migrated: TtsMode = legacy === 'true' ? 'narrate' : 'off';
      localStorage.setItem(LS_MODE_KEY, migrated);
      localStorage.removeItem(LS_LEGACY_KEY);
      return migrated;
    }
  } catch {
    // localStorage unavailable (tests / SSR)
  }
  return 'off';
}

const mode: Ref<TtsMode> = ref(loadInitialMode());
const registry = new HotkeyRegistry();

// Lazily-initialized dependencies (require Vue setup context on first call)
let _tts: ReturnType<typeof useTTS> | null = null;
let _t: ((key: string, params?: Record<string, string | number>) => string) | null = null;
let _locale: Ref<string> | null = null;
let _router: ReturnType<typeof useRouter> | null = null;

// Active listener / observer references (for cleanup)
let focusinListener: ((e: FocusEvent) => void) | null = null;
let keydownListener: ((e: KeyboardEvent) => void) | null = null;
let liveObserver: MutationObserver | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function t(key: string, params?: Record<string, string | number>): string {
  if (_t) return _t(key, params);
  return key;
}

function speak(text: string): void {
  if (!_tts || !text) return;
  const locale = _locale?.value ?? 'sv';
  _tts.speak(text, locale);
}

function stopSpeech(): void {
  _tts?.stop();
}

function focusSearch(): void {
  const el = document.querySelector<HTMLElement>('.sidebar-search-input');
  if (el) {
    el.focus();
    speak(t('screenReader.navSearch'));
  }
}

function announceHelp(): void {
  const all = registry.listAll().filter((h) => h.description);
  const list = all.map((h) => `${h.key}: ${h.description}`).join('. ');
  speak(t('screenReader.hotkeysAvailable', { list }));
}

// ---------------------------------------------------------------------------
// Live region observer
// ---------------------------------------------------------------------------

function setupLiveObserver(): void {
  if (typeof document === 'undefined') return;
  liveObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          const text = node.textContent?.trim();
          if (text) speak(text);
        }
      } else if (mutation.type === 'characterData') {
        const text = mutation.target.textContent?.trim();
        if (text) speak(text);
      }
    }
  });
  document.querySelectorAll<HTMLElement>('[aria-live]').forEach((el) => {
    liveObserver!.observe(el, { childList: true, characterData: true, subtree: true });
  });
}

function teardownLiveObserver(): void {
  liveObserver?.disconnect();
  liveObserver = null;
}

// ---------------------------------------------------------------------------
// Screen reader mode activation / deactivation
// ---------------------------------------------------------------------------

function activate(): void {
  if (typeof document === 'undefined') return;

  // CSS class for stylesheet hooks
  document.documentElement.classList.add('screen-reader');

  // Focus narration
  focusinListener = (e: FocusEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;
    const text = resolveNarration(el);
    if (text) speak(text);
  };
  document.addEventListener('focusin', focusinListener);

  // Keydown dispatcher
  keydownListener = (e: KeyboardEvent) => {
    registry.handleKeydown(e);
  };
  document.addEventListener('keydown', keydownListener);

  // Live regions
  setupLiveObserver();

  // Register global hotkeys
  const globalHotkeys: Hotkey[] = [
    { key: '?', action: announceHelp, description: t('screenReader.hotkeyHelp') },
    { key: 'p', action: () => _router?.push('/'), description: t('screenReader.hotkeyPersons') },
    { key: 'r', action: () => _router?.push('/relationships'), description: t('screenReader.hotkeyRelationships') },
    { key: 's', action: () => _router?.push('/sources'), description: t('screenReader.hotkeySources') },
    { key: 'l', action: () => _router?.push('/places'), description: t('screenReader.hotkeyPlaces') },
    { key: 't', action: () => _router?.push('/research-tasks'), description: t('screenReader.hotkeyTasks') },
    { key: 'v', action: () => _router?.push('/persons'), description: t('screenReader.hotkeyPersonsV') },
    { key: 'q', action: () => _router?.push('/quality'), description: t('screenReader.hotkeyQuality') },
    { key: 'd', action: () => _router?.push('/database'), description: t('screenReader.hotkeyDatabase') },
    { key: '/', action: focusSearch, description: t('screenReader.hotkeySearch') },
    { key: 'f', action: focusSearch, description: t('screenReader.hotkeySearch') },
    { key: 'h', action: () => _router?.push('/'), description: t('screenReader.hotkeyHome') },
    { key: 'Escape', action: stopSpeech, description: '' },
    { key: 'Ctrl+.', action: stopSpeech, description: t('screenReader.hotkeyStopSpeech') },
  ];
  registry.registerGlobal(globalHotkeys);

  // Welcome message
  speak(t('screenReader.welcome'));
}

function deactivate(): void {
  if (typeof document === 'undefined') return;

  document.documentElement.classList.remove('screen-reader');

  if (focusinListener) {
    document.removeEventListener('focusin', focusinListener);
    focusinListener = null;
  }
  if (keydownListener) {
    document.removeEventListener('keydown', keydownListener);
    keydownListener = null;
  }

  teardownLiveObserver();
  registry.destroy();
  stopSpeech();
}

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

const isScreenReader: ComputedRef<boolean> = computed(() => mode.value === 'screenReader');
const isNarrate: ComputedRef<boolean> = computed(() => mode.value === 'narrate');
const isTtsEnabled: ComputedRef<boolean> = computed(() => mode.value !== 'off');

function setMode(newMode: TtsMode): void {
  const previous = mode.value;
  mode.value = newMode;
  try {
    localStorage.setItem(LS_MODE_KEY, newMode);
  } catch {
    // ignore
  }

  if (previous === 'screenReader' && newMode !== 'screenReader') {
    deactivate();
  } else if (previous !== 'screenReader' && newMode === 'screenReader') {
    activate();
  }
}

function registerHotkeys(hotkeys: Hotkey[]): () => void {
  return registry.registerView(hotkeys);
}

function announceRoute(routeName: string): void {
  const text = narratePageEntry(routeName, t);
  speak(text);
  // After the DOM has settled, focus the first <h1> inside <main>
  requestAnimationFrame(() => {
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (h1) {
      if (!h1.hasAttribute('tabindex')) {
        h1.setAttribute('tabindex', '-1');
      }
      h1.focus();
    }
  });
}

function init(): void {
  // If screen reader mode was persisted, activate it now
  if (mode.value === 'screenReader') {
    activate();
  }
}

export function useScreenReaderMode() {
  // Lazily capture Vue context dependencies on first setup-context call
  try {
    const router = useRouter();
    const { t: i18nT, locale } = useI18n();
    const tts = useTTS();

    if (!_router) _router = router;
    if (!_t) _t = i18nT as (key: string, params?: Record<string, string | number>) => string;
    if (!_locale) _locale = locale as Ref<string>;
    if (!_tts) _tts = tts;
  } catch {
    // Called outside setup context (e.g. during unit tests) — skip
  }

  return {
    mode,
    isScreenReader,
    isNarrate,
    isTtsEnabled,
    setMode,
    speak,
    stopSpeech,
    registerHotkeys,
    announceRoute,
    init,
  };
}
