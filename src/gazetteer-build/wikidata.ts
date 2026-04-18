import { round6 } from './geo';

/** Parse WKT "Point(lon lat)" → { lat, lon } or null. */
export function parseWktPoint(wkt: string): { lat: number; lon: number } | null {
  const match = wkt.match(/Point\(([^ ]+)\s+([^ ]+)\)/i);
  if (!match) return null;
  const lon = parseFloat(match[1]);
  const lat = parseFloat(match[2]);
  if (isNaN(lat) || isNaN(lon)) return null;
  return { lat: round6(lat), lon: round6(lon) };
}

/**
 * Generate aliases from a pipe-separated Wikidata altLabel string.
 * Deduplicates, removes primary name, optionally strips administrative suffixes.
 */
export function generateAliases(name: string, altLabels: string, suffixRegex?: RegExp): string[] {
  const aliases = new Set<string>();

  if (altLabels) {
    for (const label of altLabels.split('|')) {
      const trimmed = label.trim();
      if (trimmed && trimmed !== name) {
        aliases.add(trimmed);
      }
    }
  }

  if (suffixRegex) {
    const bare = name.replace(suffixRegex, '').trim();
    if (bare && bare !== name) {
      aliases.add(bare);
    }

    for (const alias of [...aliases]) {
      const bareAlias = alias.replace(suffixRegex, '').trim();
      if (bareAlias && bareAlias !== alias && bareAlias !== name) {
        aliases.add(bareAlias);
      }
    }
  }

  return [...aliases];
}
