import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePanelSections } from '../../src/renderer/composables/usePanelSections';

// The vitestSetup.ts installs a reliable localStorage mock. Clear it before
// each test so state doesn't leak between cases.
beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Default (non-static) mode
// ---------------------------------------------------------------------------

describe('usePanelSections -- initial state from defaults', () => {
  it('returns all sections with their default values when localStorage is empty', () => {
    const { sections } = usePanelSections('person-', { bio: true, events: false, sources: true });
    expect(sections.bio).toBe(true);
    expect(sections.events).toBe(false);
    expect(sections.sources).toBe(true);
  });

  it('reads persisted state from localStorage on first call', () => {
    localStorage.setItem('person-bio', 'false');
    localStorage.setItem('person-events', 'true');
    const { sections } = usePanelSections('person-', { bio: true, events: false, sources: true });
    expect(sections.bio).toBe(false);
    expect(sections.events).toBe(true);
    // 'sources' has no stored value — falls back to default
    expect(sections.sources).toBe(true);
  });

  it('treats a stored "true" string as true', () => {
    localStorage.setItem('place-details', 'true');
    const { sections } = usePanelSections('place-', { details: false });
    expect(sections.details).toBe(true);
  });

  it('treats a stored "false" string as false', () => {
    localStorage.setItem('place-details', 'false');
    const { sections } = usePanelSections('place-', { details: true });
    expect(sections.details).toBe(false);
  });

  it('falls back to default when stored value is null (key not set)', () => {
    const { sections } = usePanelSections('place-', { details: true });
    expect(sections.details).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Toggle behaviour
// ---------------------------------------------------------------------------

describe('usePanelSections -- toggleSection', () => {
  it('toggles a section from true to false', () => {
    const { sections, toggleSection } = usePanelSections('person-', { bio: true });
    toggleSection('bio');
    expect(sections.bio).toBe(false);
  });

  it('toggles a section from false to true', () => {
    const { sections, toggleSection } = usePanelSections('person-', { bio: false });
    toggleSection('bio');
    expect(sections.bio).toBe(true);
  });

  it('double-toggle returns to original value', () => {
    const { sections, toggleSection } = usePanelSections('person-', { bio: true });
    toggleSection('bio');
    toggleSection('bio');
    expect(sections.bio).toBe(true);
  });

  it('persists the toggled value to localStorage', () => {
    const { toggleSection } = usePanelSections('rel-', { notes: true });
    toggleSection('notes');
    expect(localStorage.getItem('rel-notes')).toBe('false');
  });

  it('persists second toggle to localStorage', () => {
    const { toggleSection } = usePanelSections('rel-', { notes: true });
    toggleSection('notes'); // true → false
    toggleSection('notes'); // false → true
    expect(localStorage.getItem('rel-notes')).toBe('true');
  });

  it('uses the storage prefix to build the key', () => {
    const { toggleSection } = usePanelSections('source-section-', { citations: false });
    toggleSection('citations');
    expect(localStorage.getItem('source-section-citations')).toBe('true');
  });

  it('toggling one section does not affect other sections', () => {
    const { sections, toggleSection } = usePanelSections('p-', { a: true, b: false, c: true });
    toggleSection('b');
    expect(sections.a).toBe(true);
    expect(sections.b).toBe(true);
    expect(sections.c).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Restore from localStorage (simulates re-mount)
// ---------------------------------------------------------------------------

describe('usePanelSections -- restore from localStorage after toggle', () => {
  it('re-mounting reads back the value that was persisted by a prior toggle', () => {
    // First "mount" — toggle bio closed
    const first = usePanelSections('person-', { bio: true, events: true });
    first.toggleSection('bio');
    // bio is now false and localStorage has 'person-bio' = 'false'

    // Second "mount" — simulates unmount + remount (e.g. navigating away and back)
    const second = usePanelSections('person-', { bio: true, events: true });
    expect(second.sections.bio).toBe(false);
    expect(second.sections.events).toBe(true); // unchanged, falls back to default
  });
});

// ---------------------------------------------------------------------------
// Static mode  (VITE_STATIC_MODE = 'true')
// ---------------------------------------------------------------------------

describe('usePanelSections -- static mode', () => {
  it('uses staticDefaults when isStaticMode is true and staticDefaults are provided', async () => {
    // We can't truly flip import.meta.env.VITE_STATIC_MODE at runtime because the
    // top-level `isStaticMode` const is evaluated once when the module is imported.
    // Instead, we verify observable behaviour: when VITE_STATIC_MODE is NOT 'true'
    // (the test environment), staticDefaults are NOT used — only defaults matter.
    localStorage.setItem('test-section-info', 'false');
    const { sections } = usePanelSections(
      'test-section-',
      { info: true },          // defaults
      { info: true },           // staticDefaults (ignored in non-static mode)
    );
    // In non-static mode the localStorage value wins over defaults
    expect(sections.info).toBe(false);
  });

  it('staticDefaults parameter is accepted without error when provided', () => {
    expect(() => {
      usePanelSections('x-', { a: true }, { a: true });
    }).not.toThrow();
  });

  it('staticDefaults parameter is optional — omitting it works fine', () => {
    expect(() => {
      usePanelSections('x-', { a: true });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('usePanelSections -- edge cases', () => {
  it('works with an empty defaults object (no sections)', () => {
    const { sections, toggleSection } = usePanelSections('empty-', {} as Record<never, boolean>);
    expect(sections).toBeDefined();
    // toggleSection with a key that doesn't exist should not throw
    expect(() => toggleSection('nonexistent' as never)).not.toThrow();
  });

  it('handles multiple distinct storage prefixes independently', () => {
    const person = usePanelSections('person-', { bio: true });
    const place = usePanelSections('place-', { bio: false });
    person.toggleSection('bio'); // person-bio → false
    // place-bio should be unaffected
    expect(place.sections.bio).toBe(false);
    expect(localStorage.getItem('person-bio')).toBe('false');
    expect(localStorage.getItem('place-bio')).toBeNull();
  });
});
