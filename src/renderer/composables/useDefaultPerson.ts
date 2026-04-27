declare const window: Window & {
  api?: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

let cached: Promise<string | null> | null = null;

export function getDefaultPersonId(): Promise<string | null> {
  if (!cached) {
    // Don't cache null when api isn't ready yet — let the next call retry.
    const getSetting = window.api?.db?.getSetting;
    if (typeof getSetting !== 'function') {
      return Promise.resolve(null);
    }
    cached = getSetting('default_person_id').then(v => (v as string | null) ?? null);
  }
  return cached;
}

export function resetDefaultPersonId(): void {
  cached = null;
}
