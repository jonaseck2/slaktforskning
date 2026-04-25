import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from '../../src/renderer/App.vue';
import { useFocusStore } from '../../src/renderer/stores/focus';
import { i18n } from './setup';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/', params: {} }),
  useRouter: () => ({
    push: vi.fn(),
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

function buildApi(opts: {
  defaultPersonId?: string | null;
  names?: Array<{ given_name: string; surname: string }>;
  firstPerson?: { id: string; given_name: string; surname: string } | null;
} = {}) {
  const { defaultPersonId = null, names = [], firstPerson = null } = opts;
  return {
    db: {
      getSetting: vi.fn().mockResolvedValue(defaultPersonId),
      onSwitched: vi.fn(),
    },
    persons: {
      getNames: vi.fn().mockResolvedValue(names),
      listPage: vi.fn().mockResolvedValue({
        persons: firstPerson ? [firstPerson] : [],
        total: firstPerson ? 1 : 0,
      }),
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

describe('App.vue autoSetFocusPerson', () => {
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

  it('seeds focus store from default_person_id when configured', async () => {
    (window as any).api = buildApi({
      defaultPersonId: 'p-default',
      names: [{ given_name: 'Anna', surname: 'Svensson' }],
      firstPerson: { id: 'p-first', given_name: 'Erik', surname: 'Larsson' },
    });

    mount(App, { global: { plugins: [i18n, pinia], stubs: STUBS } });
    await flushPromises();

    const focusStore = useFocusStore();
    expect(focusStore.personId).toBe('p-default');
    expect(focusStore.personName).toBe('Anna Svensson');
    expect((window as any).api.persons.listPage).not.toHaveBeenCalled();
  });

  it('falls back to first person when default_person_id is not set', async () => {
    (window as any).api = buildApi({
      defaultPersonId: null,
      firstPerson: { id: 'p-first', given_name: 'Erik', surname: 'Larsson' },
    });

    mount(App, { global: { plugins: [i18n, pinia], stubs: STUBS } });
    await flushPromises();

    const focusStore = useFocusStore();
    expect(focusStore.personId).toBe('p-first');
    expect(focusStore.personName).toBe('Erik Larsson');
  });

  it('falls back to first person when default_person_id person has no names', async () => {
    (window as any).api = buildApi({
      defaultPersonId: 'p-default',
      names: [], // person deleted or has no names
      firstPerson: { id: 'p-first', given_name: 'Erik', surname: 'Larsson' },
    });

    mount(App, { global: { plugins: [i18n, pinia], stubs: STUBS } });
    await flushPromises();

    const focusStore = useFocusStore();
    expect(focusStore.personId).toBe('p-first');
  });

  it('leaves focus store empty when database is empty', async () => {
    (window as any).api = buildApi({ defaultPersonId: null, firstPerson: null });

    mount(App, { global: { plugins: [i18n, pinia], stubs: STUBS } });
    await flushPromises();

    const focusStore = useFocusStore();
    expect(focusStore.personId).toBeNull();
  });
});
