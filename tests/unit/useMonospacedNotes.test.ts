import { describe, it, expect, beforeEach } from 'vitest';
import { useMonospacedNotes } from '../../src/renderer/composables/useMonospacedNotes';

// The unit test project runs in node environment — mock localStorage on globalThis.
const store: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  },
  writable: true,
});

describe('useMonospacedNotes', async () => {
  beforeEach(async () => {
    localStorage.clear();
  });

  it('defaults to false when no value is stored', async () => {
    const { monospaced } = useMonospacedNotes('person');
    expect(monospaced.value).toBe(false);
  });

  it('reads the stored value from localStorage on init', async () => {
    localStorage.setItem('slaktforskning-monospace-notes-person', 'true');
    const { monospaced } = useMonospacedNotes('person');
    expect(monospaced.value).toBe(true);
  });

  it('toggle() flips the value and persists to localStorage', async () => {
    const { monospaced, toggle } = useMonospacedNotes('place');
    expect(monospaced.value).toBe(false);

    toggle();
    expect(monospaced.value).toBe(true);
    expect(localStorage.getItem('slaktforskning-monospace-notes-place')).toBe('true');

    toggle();
    expect(monospaced.value).toBe(false);
    expect(localStorage.getItem('slaktforskning-monospace-notes-place')).toBe('false');
  });

  it('keeps each entity type independent', async () => {
    const person = useMonospacedNotes('person');
    const place = useMonospacedNotes('place');

    person.toggle();
    expect(person.monospaced.value).toBe(true);
    expect(place.monospaced.value).toBe(false);
    expect(localStorage.getItem('slaktforskning-monospace-notes-person')).toBe('true');
    expect(localStorage.getItem('slaktforskning-monospace-notes-place')).toBeNull();
  });
});
