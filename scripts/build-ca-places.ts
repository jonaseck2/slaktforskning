/**
 * Generate Canadian provinces gazetteer from GeoNames data.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 * Builds a gazetteer of all Canadian provinces and territories with census
 * divisions and populated places.
 *
 * Usage: npx tsx scripts/build-ca-places.ts
 *
 * Prerequisites: Download GeoNames CA data first:
 *   curl -o /tmp/CA.zip https://download.geonames.org/export/dump/CA.zip
 *   unzip -o /tmp/CA.zip -d /tmp/geonames_ca/
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { dedup } from '../src/gazetteer-build/geonames';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const GEONAMES_FILE = '/tmp/geonames_ca/CA.txt';

interface GeoNameRow {
  name: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  admin1: string; // province code
  admin2: string; // census division code
}

// Maps: admin1 code → province name (populated from ADM1 rows)
const ADMIN1_NAMES: Record<string, string> = {};
// Maps: "admin1.admin2" → census division name (populated from ADM2 rows)
const ADMIN2_NAMES: Record<string, string> = {};

function parseGeoNamesFile(filePath: string): GeoNameRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Pass 1: find ADM1 rows to map admin1 codes to province names
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols[6] === 'A' && cols[7] === 'ADM1') {
      ADMIN1_NAMES[cols[10]] = cols[1];
    }
  }

  // Pass 2: collect ADM2 names and place rows
  const rows: GeoNameRow[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    // GeoNames columns: 0=id, 1=name, 2=asciiName, 3=altNames, 4=lat, 5=lon,
    // 6=featureClass, 7=featureCode, 8=countryCode, 9=cc2, 10=admin1, 11=admin2
    const featureClass = cols[6];
    const featureCode = cols[7];
    const admin1 = cols[10];

    // Collect census division names from ADM2 rows
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
  // Group by admin1 (province) → admin2 (census division) → places
  // Places without admin2 are stored under the special key "__direct__"
  const provinces = new Map<string, Map<string, GeoNameRow[]>>();

  for (const r of rows) {
    if (!r.admin1) continue;
    if (!provinces.has(r.admin1)) provinces.set(r.admin1, new Map());
    const divisions = provinces.get(r.admin1)!;
    const divKey = r.admin2 ? `${r.admin1}.${r.admin2}` : '__direct__';
    if (!divisions.has(divKey)) divisions.set(divKey, []);
    divisions.get(divKey)!.push(r);
  }

  const provinceNodes: GazetteerNode[] = [];

  for (const [admin1Code, divisions] of [...provinces.entries()].sort((a, b) => {
    const nameA = ADMIN1_NAMES[a[0]] || a[0];
    const nameB = ADMIN1_NAMES[b[0]] || b[0];
    return nameA.localeCompare(nameB, 'en');
  })) {
    const provinceName = ADMIN1_NAMES[admin1Code];
    if (!provinceName) continue;

    const divisionNodes: GazetteerNode[] = [];

    // Handle places without a census division — add directly as province children
    const directRows = divisions.get('__direct__');
    if (directRows) {
      const unique = dedup(directRows);
      for (const r of unique.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
        divisionNodes.push({
          name: r.name,
          type: 'admin3',
          lat: round6(r.lat),
          lon: round6(r.lon),
        });
      }
    }

    for (const [divKey, divRows] of [...divisions.entries()].sort((a, b) => {
      const nameA = ADMIN2_NAMES[a[0]] || a[0];
      const nameB = ADMIN2_NAMES[b[0]] || b[0];
      return nameA.localeCompare(nameB, 'en');
    })) {
      if (divKey === '__direct__') continue;
      const divName = ADMIN2_NAMES[divKey];
      if (!divName) continue;

      const unique = dedup(divRows);
      const placeNodes: GazetteerNode[] = unique
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        .map(r => ({
          name: r.name,
          type: 'admin3',
          lat: round6(r.lat),
          lon: round6(r.lon),
        }));

      if (placeNodes.length === 0) continue;

      const divCoords = avgCoordinates(placeNodes);

      divisionNodes.push({
        name: divName,
        type: 'admin2',
        lat: divCoords.lat,
        lon: divCoords.lon,
        children: placeNodes,
      });
    }

    if (divisionNodes.length === 0) continue;

    const provCoords = avgCoordinates(divisionNodes);

    provinceNodes.push({
      name: provinceName,
      type: 'admin1',
      lat: provCoords.lat,
      lon: provCoords.lon,
      children: divisionNodes,
    });
  }

  return provinceNodes;
}

function main() {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`GeoNames data not found at ${GEONAMES_FILE}`);
    console.error('Download it first:');
    console.error('  curl -o /tmp/CA.zip https://download.geonames.org/export/dump/CA.zip');
    console.error('  unzip -o /tmp/CA.zip -d /tmp/geonames_ca/');
    process.exit(1);
  }

  console.log('Parsing GeoNames CA data (all provinces and territories)...');
  const allRows = parseGeoNamesFile(GEONAMES_FILE);
  console.log(`  Provinces/territories found: ${Object.keys(ADMIN1_NAMES).length}`);
  console.log(`  Total rows: ${allRows.length}`);
  console.log(`  Census divisions found: ${Object.keys(ADMIN2_NAMES).length}`);

  // Filter to populated places only (featureClass P)
  const populated = allRows.filter(r => r.featureClass === 'P');
  console.log(`  Populated places (class P): ${populated.length}`);

  console.log('\nBuilding gazetteer...');
  const provinceNodes = buildGazetteer(populated);

  // Count stats
  let totalDivisions = 0;
  let totalPlaces = 0;
  for (const province of provinceNodes) {
    for (const child of province.children || []) {
      if (child.type === 'division') {
        totalDivisions++;
        totalPlaces += (child.children || []).length;
      } else {
        // Direct locality (no census division)
        totalPlaces++;
      }
    }
  }

  const gazetteer = {
    id: 'ca-provinces',
    name: 'Canadian Provinces & Places',
    locale: 'en',
    description: 'All Canadian provinces and territories with census divisions and populated places.',
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/countries/CA/canada.html',
      license: 'CC BY 4.0',
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: 'World',
      type: 'world',
      lat: 0,
      lon: 0,
      children: [{
        name: 'North America',
        type: 'continent',
        lat: 45,
        lon: -100,
        children: [{
          name: 'Canada',
          type: 'country',
          aliases: ['CA'],
          lat: 56.0,
          lon: -96.0,
          children: provinceNodes,
        }],
      }],
    },
  };

  const outPath = path.join(DATA_DIR, 'ca-provinces.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '\n');

  const fileSizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(1);

  console.log(`  Provinces: ${provinceNodes.length}`);
  console.log(`  Census divisions: ${totalDivisions}`);
  console.log(`  Places: ${totalPlaces}`);
  console.log(`  File: ${outPath} (${fileSizeMB} MB)`);
  console.log('\nDone!');
}

main();
