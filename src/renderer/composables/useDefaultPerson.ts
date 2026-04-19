declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

let cached: Promise<string | null> | null = null;

export function getDefaultPersonId(): Promise<string | null> {
  if (!cached) {
    cached = window.api.db.getSetting('default_person_id').then(v => (v as string | null) ?? null);
  }
  return cached;
}

export function resetDefaultPersonId(): void {
  cached = null;
}
