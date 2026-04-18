/**
 * Generate US immigration states gazetteer from GeoNames data.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 * Builds a gazetteer of counties and populated places in 9 key Scandinavian
 * immigration states: Minnesota, Wisconsin, Iowa, Illinois, North Dakota,
 * South Dakota, Washington, Oregon, Nebraska.
 *
 * Usage: npx tsx scripts/build-us-places.ts
 *
 * Prerequisites: Download GeoNames US data first:
 *   curl -o /tmp/US.zip https://download.geonames.org/export/dump/US.zip
 *   unzip -o /tmp/US.zip -d /tmp/geonames_us/
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const GEONAMES_FILE = '/tmp/geonames_us/US.txt';

const TARGET_STATES = new Set([
  'Minnesota',
  'Wisconsin',
  'Iowa',
  'Illinois',
  'North Dakota',
  'South Dakota',
  'Washington',
  'Oregon',
  'Nebraska',
]);

interface GeoNameRow {
  name: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  admin1: string; // state code
  admin2: string; // county code
}

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

// Maps: admin1 code → state name (populated from ADM1 rows)
const ADMIN1_NAMES: Record<string, string> = {};
// Maps: "admin1.admin2" → county name (populated from ADM2 rows)
const ADMIN2_NAMES: Record<string, string> = {};
// Set of admin1 codes that match our target states
const TARGET_ADMIN1_CODES = new Set<string>();

function round6(n: number): number {
  return Math.round(n * 1000000) / 1000000;
}

function parseGeoNamesFile(filePath: string): GeoNameRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Pass 1: find ADM1 rows to map admin1 codes to state names,
  // then determine which codes correspond to target states
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols[6] === 'A' && cols[7] === 'ADM1') {
      const stateName = cols[1];
      const admin1 = cols[10];
      ADMIN1_NAMES[admin1] = stateName;
      if (TARGET_STATES.has(stateName)) {
        TARGET_ADMIN1_CODES.add(admin1);
      }
    }
  }

  // Pass 2: collect ADM2 names and place rows for target states
  const rows: GeoNameRow[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    // GeoNames columns: 0=id, 1=name, 2=asciiName, 3=altNames, 4=lat, 5=lon,
    // 6=featureClass, 7=featureCode, 8=countryCode, 9=cc2, 10=admin1, 11=admin2
    const featureClass = cols[6];
    const featureCode = cols[7];
    const admin1 = cols[10];

    // Only process rows from target states
    if (!TARGET_ADMIN1_CODES.has(admin1)) continue;

    // Collect county names from ADM2 rows
    if (featureClass === 'A' && featureCode === 'ADM2') {
      ADMIN2_NAMES[`${admin1}.${cols[11]}`] = cols[1];
    }

    rows.push({
      name: cols[1],
      lat: parseFloat(cols[4]),
      lon: parseFloat(cols[5]),
      featureClass,
      featureCode,
      admin1,
      admin2: cols[11],
    });
  }

  return rows;
}

function buildGazetteer(rows: GeoNameRow[]): GazetteerNode[] {
  // Group by admin1 (state) → admin2 (county) → places
  const states = new Map<string, Map<string, GeoNameRow[]>>();

  for (const r of rows) {
    if (!r.admin1 || !r.admin2) continue;
    if (!states.has(r.admin1)) states.set(r.admin1, new Map());
    const counties = states.get(r.admin1)!;
    const countyKey = `${r.admin1}.${r.admin2}`;
    if (!counties.has(countyKey)) counties.set(countyKey, []);
    counties.get(countyKey)!.push(r);
  }

  // Deduplicate by lowercase name within each county
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

  const stateNodes: GazetteerNode[] = [];

  for (const [admin1Code, counties] of [...states.entries()].sort((a, b) => {
    const nameA = ADMIN1_NAMES[a[0]] || a[0];
    const nameB = ADMIN1_NAMES[b[0]] || b[0];
    return nameA.localeCompare(nameB, 'en');
  })) {
    const stateName = ADMIN1_NAMES[admin1Code];
    if (!stateName) continue;

    const countyNodes: GazetteerNode[] = [];

    for (const [countyKey, countyRows] of [...counties.entries()].sort((a, b) => {
      const nameA = ADMIN2_NAMES[a[0]] || a[0];
      const nameB = ADMIN2_NAMES[b[0]] || b[0];
      return nameA.localeCompare(nameB, 'en');
    })) {
      const countyName = ADMIN2_NAMES[countyKey];
      if (!countyName) continue;

      const unique = dedup(countyRows);
      const placeNodes: GazetteerNode[] = unique
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        .map(r => ({
          name: r.name,
          type: 'locality',
          lat: round6(r.lat),
          lon: round6(r.lon),
        }));

      if (placeNodes.length === 0) continue;

      const avgLat = placeNodes.reduce((s, p) => s + p.lat, 0) / placeNodes.length;
      const avgLon = placeNodes.reduce((s, p) => s + p.lon, 0) / placeNodes.length;

      countyNodes.push({
        name: countyName,
        type: 'county',
        lat: round6(avgLat),
        lon: round6(avgLon),
        children: placeNodes,
      });
    }

    if (countyNodes.length === 0) continue;

    const avgLat = countyNodes.reduce((s, n) => s + n.lat, 0) / countyNodes.length;
    const avgLon = countyNodes.reduce((s, n) => s + n.lon, 0) / countyNodes.length;

    stateNodes.push({
      name: stateName,
      type: 'state',
      lat: round6(avgLat),
      lon: round6(avgLon),
      children: countyNodes,
    });
  }

  return stateNodes;
}

function main() {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`GeoNames data not found at ${GEONAMES_FILE}`);
    console.error('Download it first:');
    console.error('  curl -o /tmp/US.zip https://download.geonames.org/export/dump/US.zip');
    console.error('  unzip -o /tmp/US.zip -d /tmp/geonames_us/');
    process.exit(1);
  }

  console.log('Parsing GeoNames US data (filtering to 9 target states)...');
  const allRows = parseGeoNamesFile(GEONAMES_FILE);
  console.log(`  Target admin1 codes: ${[...TARGET_ADMIN1_CODES].join(', ')}`);
  console.log(`  Rows in target states: ${allRows.length}`);
  console.log(`  Counties found: ${Object.keys(ADMIN2_NAMES).length}`);

  // Filter to populated places only (featureClass P)
  const populated = allRows.filter(r => r.featureClass === 'P');
  console.log(`  Populated places (class P): ${populated.length}`);

  console.log('\nBuilding gazetteer...');
  const stateNodes = buildGazetteer(populated);

  // Count stats
  let totalCounties = 0;
  let totalPlaces = 0;
  for (const state of stateNodes) {
    const counties = state.children || [];
    totalCounties += counties.length;
    for (const county of counties) {
      totalPlaces += (county.children || []).length;
    }
  }

  const gazetteer = {
    id: 'us-immigration-states',
    name: 'US Scandinavian Immigration States',
    locale: 'en',
    description: 'Counties and populated places in 9 key Scandinavian immigration states: Minnesota, Wisconsin, Iowa, Illinois, North/South Dakota, Washington, Oregon, Nebraska.',
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/countries/US/united-states.html',
      license: 'CC BY 4.0',
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: 'United States',
      type: 'country',
      aliases: ['USA', 'US', 'United States of America'],
      lat: 39.8,
      lon: -98.6,
      children: stateNodes,
    },
  };

  const outPath = path.join(DATA_DIR, 'us-immigration-states.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '\n');

  const fileSizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(1);

  console.log(`  States: ${stateNodes.length}`);
  console.log(`  Counties: ${totalCounties}`);
  console.log(`  Places: ${totalPlaces}`);
  console.log(`  File: ${outPath} (${fileSizeMB} MB)`);
  console.log('\nDone!');
}

main();
