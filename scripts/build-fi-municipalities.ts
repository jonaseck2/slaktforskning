/**
 * Generate Finnish municipality gazetteer from GeoNames data.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 * Builds 1 gazetteer:
 *   fi-kunnat — Regions (maakunnat), municipalities (kunnat), and populated places
 *
 * Usage: npx tsx scripts/build-fi-municipalities.ts
 *
 * Prerequisites: Download GeoNames FI data first:
 *   curl -o /tmp/FI.zip https://download.geonames.org/export/dump/FI.zip
 *   unzip -o /tmp/FI.zip -d /tmp/geonames_fi/
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const GEONAMES_FILE = '/tmp/geonames_fi/FI.txt';

interface GeoNameRow {
  name: string;
  altNames: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  admin1: string; // region code
  admin2: string; // sub-region code
  admin3: string; // municipality code
}

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

// Finnish ADM1 names — some GeoNames entries use English names, so we hardcode Finnish names
// with Swedish equivalents as aliases (Finland is bilingual)
const ADMIN1_FINNISH: Record<string, { fi: string; sv: string }> = {
  '01': { fi: 'Uusimaa', sv: 'Nyland' },
  '02': { fi: 'Varsinais-Suomi', sv: 'Egentliga Finland' },
  '04': { fi: 'Satakunta', sv: 'Satakunta' },
  '05': { fi: 'Kanta-Häme', sv: 'Egentliga Tavastland' },
  '06': { fi: 'Pirkanmaa', sv: 'Birkaland' },
  '07': { fi: 'Päijät-Häme', sv: 'Päijänne-Tavastland' },
  '08': { fi: 'Kymenlaakso', sv: 'Kymmenedalen' },
  '09': { fi: 'Etelä-Karjala', sv: 'Södra Karelen' },
  '10': { fi: 'Etelä-Savo', sv: 'Södra Savolax' },
  '11': { fi: 'Pohjois-Savo', sv: 'Norra Savolax' },
  '12': { fi: 'Pohjois-Karjala', sv: 'Norra Karelen' },
  '13': { fi: 'Keski-Suomi', sv: 'Mellersta Finland' },
  '14': { fi: 'Etelä-Pohjanmaa', sv: 'Södra Österbotten' },
  '15': { fi: 'Pohjanmaa', sv: 'Österbotten' },
  '16': { fi: 'Keski-Pohjanmaa', sv: 'Mellersta Österbotten' },
  '17': { fi: 'Pohjois-Pohjanmaa', sv: 'Norra Österbotten' },
  '18': { fi: 'Kainuu', sv: 'Kajanaland' },
  '19': { fi: 'Lappi', sv: 'Lappland' },
};

// GeoNames admin1.admin3 → municipality Finnish name + Swedish alias
const ADMIN3_NAMES: Record<string, { fi: string; sv?: string }> = {};

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

    // Collect ADM3 municipality names with Swedish aliases
    if (featureClass === 'A' && featureCode === 'ADM3') {
      const altNames = (cols[3] || '').split(',').map(a => a.trim()).filter(Boolean);
      const admin3Key = `${cols[10]}.${cols[12]}`;

      // Primary name: use GeoNames name (usually Finnish)
      const fiName = cols[1];

      // Look for Swedish name in altNames:
      // - Swedish municipality names often end with " Kommun" or " Stad"
      // - Or are simple alternate names that differ from Finnish
      let svName: string | undefined;

      // First try: find "X Kommun" or "X Stad" pattern (Swedish municipal designation)
      const svKommun = altNames.find(a => / Kommun$/.test(a) && !a.includes(fiName));
      const svStad = altNames.find(a => / Stad$/.test(a));
      if (svKommun) {
        svName = svKommun.replace(/ Kommun$/, '');
      } else if (svStad) {
        svName = svStad.replace(/ Stad$/, '');
      } else {
        // Known bilingual municipalities — check if any altName looks Swedish
        // (contains å, ö, or ä and differs from Finnish name)
        const candidates = altNames.filter(a =>
          a !== fiName &&
          !a.includes(' Kunta') &&
          !a.includes(' Kaupunki') &&
          !/^\d+$/.test(a) && // skip numeric codes
          a.length > 1
        );
        // Pick first candidate that has Swedish-typical characters or is clearly different
        svName = candidates.find(a => /[åöÅÖ]/.test(a) && a !== fiName);
      }

      // Don't add Swedish alias if it's the same as Finnish
      if (svName && svName.toLowerCase() === fiName.toLowerCase()) {
        svName = undefined;
      }

      ADMIN3_NAMES[admin3Key] = { fi: fiName, sv: svName };
    }

    rows.push({
      name: cols[1],
      altNames: cols[3] || '',
      lat: parseFloat(cols[4]),
      lon: parseFloat(cols[5]),
      featureClass,
      featureCode,
      admin1: cols[10],
      admin2: cols[11],
      admin3: cols[12] || '',
    });
  }

  return rows;
}

function round6(n: number): number {
  return Math.round(n * 1000000) / 1000000;
}

function buildGazetteerFromRows(rows: GeoNameRow[]): GazetteerNode[] {
  // Group by admin1 (region) → admin3 (municipality) → places
  // We skip admin2 (sub-region/seutukunta) as it's less relevant for genealogy
  const regions = new Map<string, Map<string, GeoNameRow[]>>();

  for (const r of rows) {
    if (!r.admin1 || !r.admin3) continue;
    if (!regions.has(r.admin1)) regions.set(r.admin1, new Map());
    const muns = regions.get(r.admin1)!;
    const munKey = `${r.admin1}.${r.admin3}`;
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

  const regionNodes: GazetteerNode[] = [];

  for (const [admin1Code, muns] of [...regions.entries()].sort((a, b) => {
    const nameA = ADMIN1_FINNISH[a[0]]?.fi || a[0];
    const nameB = ADMIN1_FINNISH[b[0]]?.fi || b[0];
    return nameA.localeCompare(nameB, 'fi');
  })) {
    const regionInfo = ADMIN1_FINNISH[admin1Code];
    if (!regionInfo) continue;

    const munNodes: GazetteerNode[] = [];

    for (const [munKey, munRows] of [...muns.entries()].sort((a, b) => {
      const nameA = ADMIN3_NAMES[a[0]]?.fi || a[0];
      const nameB = ADMIN3_NAMES[b[0]]?.fi || b[0];
      return nameA.localeCompare(nameB, 'fi');
    })) {
      const munInfo = ADMIN3_NAMES[munKey];
      if (!munInfo) continue;

      const unique = dedup(munRows);
      const placeNodes: GazetteerNode[] = unique
        .sort((a, b) => a.name.localeCompare(b.name, 'fi'))
        .map(r => ({
          name: r.name,
          type: 'locality',
          lat: round6(r.lat),
          lon: round6(r.lon),
        }));

      if (placeNodes.length === 0) continue;

      const avgLat = placeNodes.reduce((s, p) => s + p.lat, 0) / placeNodes.length;
      const avgLon = placeNodes.reduce((s, p) => s + p.lon, 0) / placeNodes.length;

      const munNode: GazetteerNode = {
        name: munInfo.fi,
        type: 'municipality',
        lat: round6(avgLat),
        lon: round6(avgLon),
        children: placeNodes,
      };

      // Add Swedish alias if available and different
      if (munInfo.sv) {
        munNode.aliases = [munInfo.sv];
      }

      munNodes.push(munNode);
    }

    if (munNodes.length === 0) continue;

    const avgLat = munNodes.reduce((s, n) => s + n.lat, 0) / munNodes.length;
    const avgLon = munNodes.reduce((s, n) => s + n.lon, 0) / munNodes.length;

    const regionNode: GazetteerNode = {
      name: regionInfo.fi,
      type: 'region',
      lat: round6(avgLat),
      lon: round6(avgLon),
      children: munNodes,
    };

    // Add Swedish alias if different from Finnish
    if (regionInfo.sv !== regionInfo.fi) {
      regionNode.aliases = [regionInfo.sv];
    }

    regionNodes.push(regionNode);
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
    console.error('  curl -o /tmp/FI.zip https://download.geonames.org/export/dump/FI.zip');
    console.error('  unzip -o /tmp/FI.zip -d /tmp/geonames_fi/');
    process.exit(1);
  }

  console.log('Parsing GeoNames data...');
  const allRows = parseGeoNamesFile(GEONAMES_FILE);
  console.log(`  Total rows: ${allRows.length}`);
  console.log(`  Admin1 (maakunnat): ${Object.keys(ADMIN1_FINNISH).length}`);
  console.log(`  Admin3 (kunnat): ${Object.keys(ADMIN3_NAMES).length}`);

  // Filter populated places only
  const populated = allRows.filter(r => r.featureClass === 'P');
  console.log(`  Populated places: ${populated.length}`);

  console.log('\nBuilding gazetteer...');
  const regionNodes = buildGazetteerFromRows(populated);

  const gazetteer = {
    id: 'fi-kunnat',
    name: 'Finnish Municipalities & Places',
    locale: 'fi',
    description: 'Finnish regions (maakunnat), municipalities (kunnat), and populated places. Bilingual names (Finnish + Swedish).',
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/countries/FI/finland.html',
      license: 'CC BY 4.0',
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: 'Suomi',
      type: 'country',
      aliases: ['Finland'],
      lat: 64.0,
      lon: 26.0,
      children: regionNodes,
    },
  };

  const outPath = path.join(DATA_DIR, 'fi-kunnat.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '\n');

  const stats = countPlaces(regionNodes);
  console.log(`  fi-kunnat: ${stats.regions} regions, ${stats.municipalities} municipalities, ${stats.places} places → fi-kunnat.json`);

  const fileSizeKB = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`  File size: ${fileSizeKB} KB`);

  // Show municipalities with Swedish aliases
  let withAliases = 0;
  for (const region of regionNodes) {
    for (const mun of region.children || []) {
      if (mun.aliases && mun.aliases.length > 0) withAliases++;
    }
  }
  console.log(`  Municipalities with Swedish aliases: ${withAliases}`);

  console.log('\nDone!');
}

main();
