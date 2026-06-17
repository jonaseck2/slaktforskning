import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from '../../src/renderer/App.vue';
import { useQualityStore } from '../../src/renderer/stores/quality';
import { useDuplicateCountStore } from '../../src/renderer/stores/duplicateCount';
import { i18n } from './setup';

const pushMock = vi.fn();

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/', params: {} }),
  useRouter: () => ({
    push: pushMock,
    back: vi.fn(),
    replace: vi.fn(),
    afterEach: vi.fn(),
    currentRoute: { value: { path: '/' } },
  }),
}));

vi.mock('../../src/renderer/composables/useScreenReaderMode', () => ({
  useScreenReaderMode: () => ({
    mode: { value: 'off' },
    isScreenReader: { value: false },
    isTtsEnabled: { value: false },
    setMode: vi.fn(),
    speak: vi.fn(),
    init: vi.fn(),
    announceRoute: vi.fn(),
  }),
}));

vi.mock('../../src/renderer/composables/useTTS', () => ({
  useTTS: () => ({ speak: vi.fn() }),
}));

vi.mock('../../src/renderer/composables/useToast', () => ({
  useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

vi.mock('../../src/renderer/components/ToastNotification.vue', () => ({
  default: { template: '<div />' },
}));

function buildApi(opts: { defaultPersonId?: string | null } = {}) {
  const { defaultPersonId = null } = opts;
  return {
    db: {
      getSetting: vi.fn().mockResolvedValue(defaultPersonId),
      onSwitched: vi.fn(),
    },
    persons: {
      getNames: vi.fn().mockResolvedValue([]),
      listPage: vi.fn().mockResolvedValue({ persons: [], total: 0 }),
    },
    undo: { onPerformed: vi.fn(), onChanged: vi.fn() },
    onDataChanged: vi.fn(),
    researchTasks: { list: vi.fn().mockResolvedValue([]) },
    checks: { runAll: vi.fn().mockResolvedValue([]) },
    duplicates: { count: vi.fn().mockResolvedValue(0) },
  };
}

const STUBS = {
  RouterView: { template: '<div />' },
  RouterLink: { template: '<a><slot /></a>' },
};

describe('App.vue default person navigation', async () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pinia = createPinia();
    setActivePinia(pinia);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes to the default person on mount when configured', async () => {
    (window as any).api = buildApi({ defaultPersonId: 'p-default' });

    mount(App, { global: { plugins: [i18n, pinia], stubs: STUBS } });
    await flushPromises();

    expect(pushMock).toHaveBeenCalledWith('/persons/p-default');
  });

  it('does not navigate when no default_person_id is set', async () => {
    (window as any).api = buildApi({ defaultPersonId: null });

    mount(App, { global: { plugins: [i18n, pinia], stubs: STUBS } });
    await flushPromises();

    expect(pushMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/persons\//));
  });
});

describe('App.vue sidebar badges derive from stores (no per-edit scan)', async () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.setItem('quality:ignored', '[]');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never calls checks.runAll() or duplicates.count() on mount (scan-free badges)', async () => {
    const api = buildApi();
    (window as any).api = api;

    mount(App, { global: { plugins: [i18n, pinia], stubs: STUBS } });
    await flushPromises();
    vi.advanceTimersByTime(6000);
    await flushPromises();

    expect(api.checks.runAll).not.toHaveBeenCalled();
    expect(api.duplicates.count).not.toHaveBeenCalled();
  });

  it('quality badge counts error+warning findings from the quality store', async () => {
    (window as any).api = buildApi();

    const wrapper = mount(App, { global: { plugins: [i18n, pinia], stubs: STUBS } });
    await flushPromises();

    const quality = useQualityStore();
    quality.setResults([
      { code: 'A', severity: 'error', message: '', personIds: ['p1'], personNames: [] },
      { code: 'B', severity: 'warning', message: '', personIds: ['p2'], personNames: [] },
      { code: 'C', severity: 'notice', message: '', personIds: ['p3'], personNames: [] },
    ]);
    await flushPromises();

    const badges = wrapper.findAll('.error-badge').map(b => b.text());
    // error + warning = 2; the notice is excluded.
    expect(badges).toContain('2');
  });

  it('duplicate badge reflects the duplicateCount store', async () => {
    (window as any).api = buildApi();

    const wrapper = mount(App, { global: { plugins: [i18n, pinia], stubs: STUBS } });
    await flushPromises();

    useDuplicateCountStore().setCount(7);
    await flushPromises();

    const badges = wrapper.findAll('.error-badge').map(b => b.text());
    expect(badges).toContain('7');
  });
});
