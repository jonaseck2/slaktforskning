/**
 * Generate Swedish place gazetteers from GeoNames data.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 * Downloads the SE.zip country file and builds 3 gazetteers:
 *   1. sv-orter       — Populated places (~28k settlements)
 *   2. sv-gårdar      — Farms (~16k historically important farm names)
 *   3. sv-kyrkor      — Churches (~3k church buildings)
 *
 * Usage: npx tsx scripts/fetch-sv-orter.ts
 *
 * Prerequisites: Download GeoNames SE data first:
 *   curl -o /tmp/SE.zip https://download.geonames.org/export/dump/SE.zip
 *   unzip -o /tmp/SE.zip -d /tmp/geonames_se/
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const GEONAMES_FILE = '/tmp/geonames_se/SE.txt';

interface GeoNameRow {
  name: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  admin1: string; // county code
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

// GeoNames admin1 codes → Swedish county names
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
    // 6=featureClass, 7=featureCode, 8=countryCode, 9=cc2, 10=admin1, 11=admin2,
    // 12=admin3, 13=admin4, 14=population, 15=elevation, 16=dem, 17=timezone, 18=modDate
    const featureClass = cols[6];
    const featureCode = cols[7];

    // Collect admin division names — prefer Swedish "Xs län" / "X kommun" forms
    if (featureClass === 'A' && featureCode === 'ADM1') {
      const altNames = (cols[3] || '').split(',').map(a => a.trim());
      // Match "Xs län" where the base matches the English name (strip " County")
      const baseName = cols[1].replace(/ County$/, '');
      const svName = altNames.find(a => a.endsWith('s län') && a.toLowerCase().includes(baseName.toLowerCase()))
        || altNames.find(a => a.endsWith(' län') && a.toLowerCase().includes(baseName.toLowerCase()));
      ADMIN1_NAMES[cols[10]] = svName || cols[1];
    }
    if (featureClass === 'A' && featureCode === 'ADM2') {
      const altNames = (cols[3] || '').split(',').map(a => a.trim());
      const baseName = cols[1].replace(/ Kommun$/i, '');
      const svName = altNames.find(a => / kommun$/.test(a) && a.toLowerCase().includes(baseName.toLowerCase()))
        || altNames.find(a => / Kommun$/.test(a) && a.toLowerCase().includes(baseName.toLowerCase()));
      // Normalize to lowercase "kommun" for consistency with Wikidata gazetteers
      const name = svName || cols[1];
      ADMIN2_NAMES[`${cols[10]}.${cols[11]}`] = name.replace(/ Kommun$/, ' kommun');
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

function buildGazetteerFromRows(
  rows: GeoNameRow[],
  nodeType: string,
): GazetteerNode[] {
  // Group by admin1 (county) → admin2 (municipality) → places
  const counties = new Map<string, Map<string, GeoNameRow[]>>();

  for (const r of rows) {
    if (!r.admin1 || !r.admin2) continue;
    if (!counties.has(r.admin1)) counties.set(r.admin1, new Map());
    const muns = counties.get(r.admin1)!;
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

  const countyNodes: GazetteerNode[] = [];

  for (const [admin1Code, muns] of [...counties.entries()].sort((a, b) => {
    const nameA = ADMIN1_NAMES[a[0]] || a[0];
    const nameB = ADMIN1_NAMES[b[0]] || b[0];
    return nameA.localeCompare(nameB, 'sv');
  })) {
    const countyName = ADMIN1_NAMES[admin1Code];
    if (!countyName) continue;

    const munNodes: GazetteerNode[] = [];

    for (const [munKey, munRows] of [...muns.entries()].sort((a, b) => {
      const nameA = ADMIN2_NAMES[a[0]] || a[0];
      const nameB = ADMIN2_NAMES[b[0]] || b[0];
      return nameA.localeCompare(nameB, 'sv');
    })) {
      const munName = ADMIN2_NAMES[munKey];
      if (!munName) continue;

      const unique = dedup(munRows);
      const placeNodes: GazetteerNode[] = unique
        .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
        .map(r => ({
          name: r.name,
          type: nodeType,
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

    countyNodes.push({
      name: countyName,
      type: 'county',
      lat: round6(avgLat),
      lon: round6(avgLon),
      children: munNodes,
    });
  }

  return countyNodes;
}

function countPlaces(countyNodes: GazetteerNode[]): { counties: number; municipalities: number; places: number } {
  let municipalities = 0;
  let places = 0;
  for (const county of countyNodes) {
    for (const mun of county.children || []) {
      municipalities++;
      places += (mun.children || []).length;
    }
  }
  return { counties: countyNodes.length, municipalities, places };
}

function writeGazetteer(
  id: string,
  name: string,
  description: string,
  countyNodes: GazetteerNode[],
  outFile: string,
) {
  const gazetteer = {
    id,
    name,
    locale: 'sv',
    description,
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/countries/SE/sweden.html',
      license: 'CC BY 4.0',
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: 'Sverige',
      type: 'country',
      aliases: ['Sweden'],
      lat: 62,
      lon: 15,
      children: countyNodes,
    },
  };

  const outPath = path.join(DATA_DIR, outFile);
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '\n');

  const stats = countPlaces(countyNodes);
  console.log(`  ${id}: ${stats.counties} counties, ${stats.municipalities} municipalities, ${stats.places} places → ${outFile}`);
}

function main() {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`GeoNames data not found at ${GEONAMES_FILE}`);
    console.error('Download it first:');
    console.error('  curl -o /tmp/SE.zip https://download.geonames.org/export/dump/SE.zip');
    console.error('  unzip -o /tmp/SE.zip -d /tmp/geonames_se/');
    process.exit(1);
  }

  console.log('Parsing GeoNames data...');
  const allRows = parseGeoNamesFile(GEONAMES_FILE);
  console.log(`  Total rows: ${allRows.length}`);
  console.log(`  Admin1 (counties): ${Object.keys(ADMIN1_NAMES).length}`);
  console.log(`  Admin2 (municipalities): ${Object.keys(ADMIN2_NAMES).length}`);

  // Filter by feature class/code
  const populated = allRows.filter(r => r.featureClass === 'P');
  const farms = allRows.filter(r => r.featureClass === 'S' && r.featureCode === 'FRM');
  const churches = allRows.filter(r => r.featureClass === 'S' && r.featureCode === 'CH');

  console.log(`  Populated places: ${populated.length}`);
  console.log(`  Farms: ${farms.length}`);
  console.log(`  Churches: ${churches.length}`);

  console.log('\nBuilding gazetteers...');

  // 1. Populated places
  const orterNodes = buildGazetteerFromRows(populated, 'locality');
  writeGazetteer(
    'sv-orter',
    'Swedish Populated Places (Orter)',
    'All named settlements in Sweden — cities, towns, villages, and hamlets. The most granular place gazetteer.',
    orterNodes,
    'sv-orter.json',
  );

  // 2. Farms
  const gardarNodes = buildGazetteerFromRows(farms, 'farm');
  writeGazetteer(
    'sv-gardar',
    'Swedish Farms (Gårdar)',
    'Named farms in Sweden. Historically important — many genealogy records reference farm names as locations.',
    gardarNodes,
    'sv-gardar.json',
  );

  // 3. Churches
  const kyrkorNodes = buildGazetteerFromRows(churches, 'church');
  writeGazetteer(
    'sv-kyrkor',
    'Swedish Churches (Kyrkor)',
    'Church buildings in Sweden. Important for genealogy — vital records (births, marriages, burials) are organized by church parish.',
    kyrkorNodes,
    'sv-kyrkor.json',
  );

  console.log('\nDone!');
}

main();
