/**
 * Derive a display name for a media item.
 * Priority: title > filename (without extension) > fallback.
 */
export function mediaDisplayName(title: string | null | undefined, fileRef: string | null | undefined, fallback = '—'): string {
  if (title) return title;
  if (fileRef) {
    const name = fileRef.split('/').pop() ?? '';
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    if (stem) return stem;
  }
  return fallback;
}
