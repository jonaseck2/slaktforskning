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

export const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif']);

/**
 * Decide if a media item should render as an image.
 *
 * The DB `format` column is whatever the importer captured (GEDCOM FORM tag, file
 * extension, or — for some upstream tools — a 3-char slice of the wrong dot in the
 * filename, producing junk like "SE'" or "COM"). When `format` isn't a known image
 * type, fall back to the actual file_ref extension so we still load thumbnails.
 */
export function isImageMedia(format: string | null | undefined, fileRef: string | null | undefined): boolean {
  if (format && IMAGE_FORMATS.has(format.toLowerCase())) return true;
  if (fileRef) {
    const name = fileRef.split('/').pop() ?? '';
    const dot = name.lastIndexOf('.');
    if (dot > 0) {
      const ext = name.slice(dot + 1).toLowerCase();
      return IMAGE_FORMATS.has(ext);
    }
  }
  return false;
}
