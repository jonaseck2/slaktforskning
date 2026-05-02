import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePersonNameOptions } from '../../src/renderer/stores/personNameOptions';

interface FakeWindow {
  api?: {
    db?: {
      getSetting?: (key: string) => Promise<string | null>;
      setSetting?: (key: string, value: string) => Promise<void>;
    };
  };
}

describe('usePersonNameOptions', () => {
  let getSetting: ReturnType<typeof vi.fn>;
  let setSetting: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    getSetting = vi.fn();
    setSetting = vi.fn().mockResolvedValue(undefined);
    (globalThis as unknown as FakeWindow).api = {
      db: { getSetting, setSetting },
    };
  });

  it('default value is true', () => {
    const store = usePersonNameOptions();
    expect(store.showBirthNameParenthetical).toBe(true);
  });

  it('init() leaves default true when setting is null/missing', async () => {
    getSetting.mockResolvedValue(null);
    const store = usePersonNameOptions();
    await store.init();
    expect(store.showBirthNameParenthetical).toBe(true);
  });

  it('init() leaves default true when setting is "1"', async () => {
    getSetting.mockResolvedValue('1');
    const store = usePersonNameOptions();
    await store.init();
    expect(store.showBirthNameParenthetical).toBe(true);
  });

  it('init() flips to false when setting is "0"', async () => {
    getSetting.mockResolvedValue('0');
    const store = usePersonNameOptions();
    await store.init();
    expect(store.showBirthNameParenthetical).toBe(false);
  });

  it('init() tolerates window.api being undefined', async () => {
    (globalThis as unknown as FakeWindow).api = undefined;
    const store = usePersonNameOptions();
    await expect(store.init()).resolves.toBeUndefined();
    expect(store.showBirthNameParenthetical).toBe(true);
  });

  it('setShowBirthNameParenthetical(false) updates the ref synchronously', () => {
    const store = usePersonNameOptions();
    expect(store.showBirthNameParenthetical).toBe(true);
    // Don't await — ref must update before the persistence promise resolves.
    void store.setShowBirthNameParenthetical(false);
    expect(store.showBirthNameParenthetical).toBe(false);
  });

  it('setShowBirthNameParenthetical persists "0" / "1" via setSetting', async () => {
    const store = usePersonNameOptions();
    await store.setShowBirthNameParenthetical(false);
    expect(setSetting).toHaveBeenCalledWith('display_birth_name_parenthetical', '0');
    await store.setShowBirthNameParenthetical(true);
    expect(setSetting).toHaveBeenCalledWith('display_birth_name_parenthetical', '1');
  });
});
