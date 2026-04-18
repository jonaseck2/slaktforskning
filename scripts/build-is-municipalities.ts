/**
 * Generate an Icelandic municipality gazetteer from GeoNames data.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 * Builds: is-sveitarfelog — Regions, municipalities (sveitarfélög), and populated places
 *
 * Usage: npx tsx scripts/build-is-municipalities.ts
 *
 * Prerequisites: Download GeoNames IS data first:
 *   curl -o /tmp/IS.zip https://download.geonames.org/export/dump/IS.zip
 *   unzip -o /tmp/IS.zip -d /tmp/geonames_is/
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const GEONAMES_FILE = '/tmp/geonames_is/IS.txt';

interface GeoNameRow {
  name: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  admin1: string; // region code
  admin2: string; // municipality code
}

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

// GeoNames admin1 codes → Icelandic region names
const ADMIN1_NAMES: Record<string, string> = {};
// GeoNames admin1.admin2 → municipality names
const ADMIN2_NAMES: Record<string, string> = {};

function parseGeoNamesFile(filePath: string): GeoNameRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows: GeoNameRow[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    // GeoNames columns: 0=id, 1=name, 2=asciiName, 3=altNames, 4=lat, 5=lon,
    // 6=featureClass, 7=featureCode, 8=countryCode, 9=cc2, 10=admin1, 11=admin2
    const featureClass = cols[6];
    const featureCode = cols[7];

    // Collect admin division names
    if (featureClass === 'A' && featureCode === 'ADM1') {
      ADMIN1_NAMES[cols[10]] = cols[1];
    }
    if (featureClass === 'A' && featureCode === 'ADM2') {
      ADMIN2_NAMES[`${cols[10]}.${cols[11]}`] = cols[1];
    }

    rows.push({
      name: cols[1],
      lat: parseFloat(cols[4]),
      lon: parseFloat(cols[5]),
      featureClass,
      featureCode,
      admin1: cols[10],
      admin2: cols[11],
    });
  }

  return rows;
}

function round6(n: number): number {
  return Math.round(n * 1000000) / 1000000;
}

function buildGazetteerFromRows(rows: GeoNameRow[]): GazetteerNode[] {
  // Group by admin1 (region) → admin2 (municipality) → places
  const regions = new Map<string, Map<string, GeoNameRow[]>>();

  for (const r of rows) {
    if (!r.admin1 || !r.admin2) continue;
    if (!regions.has(r.admin1)) regions.set(r.admin1, new Map());
    const muns = regions.get(r.admin1)!;
    const munKey = `${r.admin1}.${r.admin2}`;
    if (!muns.has(munKey)) muns.set(munKey, []);
    muns.get(munKey)!.push(r);
  }

  // Deduplicate by name within each municipality
  function dedup(arr: GeoNameRow[]): GeoNameRow[] {
    const byName = new Map<string, GeoNameRow>();
    for (const r of arr) {
      const key = r.name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, r);
      }
    }
    return Array.from(byName.values());
  }

  const regionNodes: GazetteerNode[] = [];

  for (const [admin1Code, muns] of [...regions.entries()].sort((a, b) => {
    const nameA = ADMIN1_NAMES[a[0]] || a[0];
    const nameB = ADMIN1_NAMES[b[0]] || b[0];
    return nameA.localeCompare(nameB, 'is');
  })) {
    const regionName = ADMIN1_NAMES[admin1Code];
    if (!regionName) continue;

    const munNodes: GazetteerNode[] = [];

    for (const [munKey, munRows] of [...muns.entries()].sort((a, b) => {
      const nameA = ADMIN2_NAMES[a[0]] || a[0];
      const nameB = ADMIN2_NAMES[b[0]] || b[0];
      return nameA.localeCompare(nameB, 'is');
    })) {
      const munName = ADMIN2_NAMES[munKey];
      if (!munName) continue;

      const unique = dedup(munRows);
      const placeNodes: GazetteerNode[] = unique
        .sort((a, b) => a.name.localeCompare(b.name, 'is'))
        .map(r => ({
          name: r.name,
          type: 'locality',
          lat: round6(r.lat),
          lon: round6(r.lon),
        }));

      if (placeNodes.length === 0) continue;

      const avgLat = placeNodes.reduce((s, p) => s + p.lat, 0) / placeNodes.length;
      const avgLon = placeNodes.reduce((s, p) => s + p.lon, 0) / placeNodes.length;

      munNodes.push({
        name: munName,
        type: 'municipality',
        lat: round6(avgLat),
        lon: round6(avgLon),
        children: placeNodes,
      });
    }

    if (munNodes.length === 0) continue;

    const avgLat = munNodes.reduce((s, n) => s + n.lat, 0) / munNodes.length;
    const avgLon = munNodes.reduce((s, n) => s + n.lon, 0) / munNodes.length;

    regionNodes.push({
      name: regionName,
      type: 'region',
      lat: round6(avgLat),
      lon: round6(avgLon),
      children: munNodes,
    });
  }

  return regionNodes;
}

function countPlaces(regionNodes: GazetteerNode[]): { regions: number; municipalities: number; places: number } {
  let municipalities = 0;
  let places = 0;
  for (const region of regionNodes) {
    for (const mun of region.children || []) {
      municipalities++;
      places += (mun.children || []).length;
    }
  }
  return { regions: regionNodes.length, municipalities, places };
}

function main() {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`GeoNames data not found at ${GEONAMES_FILE}`);
    console.error('Download it first:');
    console.error('  curl -o /tmp/IS.zip https://download.geonames.org/export/dump/IS.zip');
    console.error('  unzip -o /tmp/IS.zip -d /tmp/geonames_is/');
    process.exit(1);
  }

  console.log('Parsing GeoNames data...');
  const allRows = parseGeoNamesFile(GEONAMES_FILE);
  console.log(`  Total rows: ${allRows.length}`);
  console.log(`  Admin1 (regions): ${Object.keys(ADMIN1_NAMES).length}`);
  console.log(`  Admin2 (municipalities): ${Object.keys(ADMIN2_NAMES).length}`);

  // Filter populated places
  const populated = allRows.filter(r => r.featureClass === 'P');
  console.log(`  Populated places: ${populated.length}`);

  console.log('\nBuilding gazetteer...');

  const regionNodes = buildGazetteerFromRows(populated);

  const gazetteer = {
    id: 'is-sveitarfelog',
    name: 'Icelandic Municipalities & Places',
    locale: 'is',
    description: 'Icelandic regions, municipalities (sveitarfélög), and populated places.',
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/countries/IS/iceland.html',
      license: 'CC BY 4.0',
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: 'Ísland',
      type: 'country',
      aliases: ['Iceland'],
      lat: 65.0,
      lon: -18.5,
      children: regionNodes,
    },
  };

  const outPath = path.join(DATA_DIR, 'is-sveitarfelog.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '\n');

  const stats = countPlaces(regionNodes);
  console.log(`  is-sveitarfelog: ${stats.regions} regions, ${stats.municipalities} municipalities, ${stats.places} places → is-sveitarfelog.json`);

  const fileSize = fs.statSync(outPath).size;
  console.log(`  File size: ${(fileSize / 1024).toFixed(1)} KB`);

  console.log('\nDone!');
}

main();
