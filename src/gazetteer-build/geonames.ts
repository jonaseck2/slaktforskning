export interface GeoNameRow {
  geonameId: string;
  name: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  admin1: string;
  admin2: string;
  population: number;
  altNames: string;
}

function parseLine(line: string): GeoNameRow | null {
  if (!line.trim()) return null;
  const cols = line.split('\t');
  if (cols.length < 15) return null;
  return {
    geonameId: cols[0],
    name: cols[1],
    lat: parseFloat(cols[4]),
    lon: parseFloat(cols[5]),
    featureClass: cols[6],
    featureCode: cols[7],
    countryCode: cols[8],
    admin1: cols[10],
    admin2: cols[11],
    population: parseInt(cols[14], 10) || 0,
    altNames: cols[3],
  };
}

/** Parse a GeoNames TSV file into rows. Skips blank lines and short lines. */
export function parseGeoNamesRows(content: string): GeoNameRow[] {
  return content.split('\n').map(parseLine).filter((r): r is GeoNameRow => r !== null);
}

/**
 * Two-pass parse: builds admin1/admin2 name maps, returns all rows.
 * Optional filter applied to output rows (admin rows always processed for name maps).
 */
export function parseGeoNamesWithAdminNames(
  content: string,
  filter?: (row: GeoNameRow) => boolean,
): {
  rows: GeoNameRow[];
  admin1Names: Record<string, string>;
  admin2Names: Record<string, string>;
} {
  const allRows = parseGeoNamesRows(content);
  const admin1Names: Record<string, string> = {};
  const admin2Names: Record<string, string> = {};

  for (const row of allRows) {
    if (row.featureClass === 'A' && row.featureCode === 'ADM1') {
      admin1Names[row.admin1] = row.name;
    }
    if (row.featureClass === 'A' && row.featureCode === 'ADM2') {
      admin2Names[`${row.admin1}.${row.admin2}`] = row.name;
    }
  }

  const rows = filter ? allRows.filter(filter) : allRows;
  return { rows, admin1Names, admin2Names };
}

/** Deduplicate items by lowercase name. First occurrence wins. */
export function dedup<T extends { name: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}
