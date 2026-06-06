import { gunzipSync } from 'fflate';
import { parseTar } from 'nanotar';

export interface GrampsMediaEntry {
  name: string;   // basename, e.g. "blank.png"
  bytes: Uint8Array;
}
export interface GrampsArchiveContents {
  xml: string;
  media: GrampsMediaEntry[];
}

const isGzip = (b: Uint8Array): boolean => b.length > 1 && b[0] === 0x1f && b[1] === 0x8b;

// USTAR magic lives at byte offset 257 ("ustar"). Distinguishes a real tar
// (a .gpkg's inner payload) from plain XML, which parseTar would otherwise
// mis-read as garbage entries.
function looksLikeTar(b: Uint8Array): boolean {
  if (b.length < 263) return false;
  const magic = new TextDecoder('latin1').decode(b.subarray(257, 262));
  return magic === 'ustar';
}

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/**
 * Decode a Gramps file's raw bytes into XML + bundled media.
 *
 * - `.gramps` (plain or gzipped XML) → `{ xml, media: [] }`.
 * - `.gpkg` (gzipped USTAR tar of `data.gramps` + `media/`) → XML from the
 *   lone non-media entry (gunzipped again if it carries gzip magic) and one
 *   `media` entry per `media/<file>`.
 *
 * Pure — no filesystem access; safe in the renderer.
 */
export function extractGrampsArchive(fileBytes: Uint8Array): GrampsArchiveContents {
  const inner = isGzip(fileBytes) ? gunzipSync(fileBytes) : fileBytes;

  if (!looksLikeTar(inner)) {
    return { xml: new TextDecoder().decode(inner), media: [] };
  }

  const entries = parseTar(inner).filter((e) => e.type === 'file' && e.data);

  const xmlEntry =
    entries.find((e) => !e.name.startsWith('media/') && /\.(gramps|xml)$/i.test(e.name)) ??
    entries.find((e) => !e.name.startsWith('media/'));
  if (!xmlEntry?.data) {
    throw new Error('read: no Gramps XML found in .gpkg');
  }
  const xmlBytes = isGzip(xmlEntry.data) ? gunzipSync(xmlEntry.data) : xmlEntry.data;

  const media: GrampsMediaEntry[] = entries
    .filter((e) => e.name.startsWith('media/') && e.data)
    .map((e) => ({ name: baseName(e.name), bytes: e.data! }));

  return { xml: new TextDecoder().decode(xmlBytes), media };
}
