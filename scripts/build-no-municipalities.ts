/**
 * Generate Norwegian municipality gazetteer from GeoNames data.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 * Builds 1 gazetteer:
 *   no-kommuner — Counties (fylker), municipalities (kommuner), and populated places
 *
 * Usage: npx tsx scripts/build-no-municipalities.ts
 *
 * Prerequisites: Download GeoNames NO data first:
 *   curl -o /tmp/NO.zip https://download.geonames.org/export/dump/NO.zip
 *   unzip -o /tmp/NO.zip -d /tmp/geonames_no/
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const GEONAMES_FILE = '/tmp/geonames_no/NO.txt';

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

// GeoNames admin1 codes → Norwegian county (fylke) names
const ADMIN1_NAMES: Record<string, string> = {};
// GeoNames admin1.admin2 → municipality (kommune) names
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

    // Collect admin division names — prefer Norwegian names from altNames
    if (featureClass === 'A' && featureCode === 'ADM1') {
      const altNames = (cols[3] || '').split(',').map(a => a.trim());
      // Look for Norwegian name ending in " fylke" (normalize to lowercase "fylke")
      // Prefer names with Norwegian characters (ø, æ, å) over ASCII equivalents
      const fylkeCandidates = altNames.filter(a => / [Ff]ylke$/.test(a));
      const noName = fylkeCandidates.find(a => /[øæåØÆÅ]/.test(a))
        || fylkeCandidates.find(a => a.endsWith(' fylke'))
        || fylkeCandidates.find(a => a.endsWith(' Fylke'));
      const fylkeName = noName || cols[1];
      ADMIN1_NAMES[cols[10]] = fylkeName.replace(/ Fylke$/, ' fylke');
    }
    if (featureClass === 'A' && featureCode === 'ADM2') {
      const altNames = (cols[3] || '').split(',').map(a => a.trim());
      const baseName = cols[1].replace(/ Municipality$/i, '').replace(/ Kommune$/i, '');
      const noName = altNames.find(a => / kommune$/.test(a) && a.toLowerCase().includes(baseName.toLowerCase()))
        || altNames.find(a => / Kommune$/.test(a) && a.toLowerCase().includes(baseName.toLowerCase()));
      // Normalize to lowercase "kommune" for consistency
      const name = noName || cols[1];
      ADMIN2_NAMES[`${cols[10]}.${cols[11]}`] = name.replace(/ Kommune$/, ' kommune');
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

  // Deduplicate by lowercase name within each municipality
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
    return nameA.localeCompare(nameB, 'no');
  })) {
    const countyName = ADMIN1_NAMES[admin1Code];
    if (!countyName) continue;

    const munNodes: GazetteerNode[] = [];

    for (const [munKey, munRows] of [...muns.entries()].sort((a, b) => {
      const nameA = ADMIN2_NAMES[a[0]] || a[0];
      const nameB = ADMIN2_NAMES[b[0]] || b[0];
      return nameA.localeCompare(nameB, 'no');
    })) {
      const munName = ADMIN2_NAMES[munKey];
      if (!munName) continue;

      const unique = dedup(munRows);
      const placeNodes: GazetteerNode[] = unique
        .sort((a, b) => a.name.localeCompare(b.name, 'no'))
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

function main() {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`GeoNames data not found at ${GEONAMES_FILE}`);
    console.error('Download it first:');
    console.error('  curl -o /tmp/NO.zip https://download.geonames.org/export/dump/NO.zip');
    console.error('  unzip -o /tmp/NO.zip -d /tmp/geonames_no/');
    process.exit(1);
  }

  console.log('Parsing GeoNames data...');
  const allRows = parseGeoNamesFile(GEONAMES_FILE);
  console.log(`  Total rows: ${allRows.length}`);
  console.log(`  Admin1 (fylker): ${Object.keys(ADMIN1_NAMES).length}`);
  console.log(`  Admin2 (kommuner): ${Object.keys(ADMIN2_NAMES).length}`);

  // Filter populated places only
  const populated = allRows.filter(r => r.featureClass === 'P');
  console.log(`  Populated places: ${populated.length}`);

  console.log('\nBuilding gazetteer...');
  const countyNodes = buildGazetteerFromRows(populated);

  const gazetteer = {
    id: 'no-kommuner',
    name: 'Norwegian Municipalities & Places',
    locale: 'no',
    description: 'Norwegian counties (fylker), municipalities (kommuner), and populated places. For genealogy research in Norway.',
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/countries/NO/norway.html',
      license: 'CC BY 4.0',
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: 'Norge',
      type: 'country',
      aliases: ['Norway'],
      lat: 65.0,
      lon: 13.0,
      children: countyNodes,
    },
  };

  const outPath = path.join(DATA_DIR, 'no-kommuner.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '\n');

  const stats = countPlaces(countyNodes);
  console.log(`  no-kommuner: ${stats.counties} counties, ${stats.municipalities} municipalities, ${stats.places} places → no-kommuner.json`);

  const fileSizeKB = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`  File size: ${fileSizeKB} KB`);

  console.log('\nDone!');
}

main();
