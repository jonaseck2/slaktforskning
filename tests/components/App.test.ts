import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from '../../src/renderer/App.vue';
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
