/**
 * Build de-gemeinden gazetteer from GeoNames DE.zip.
 *
 * Hierarchy: Germany -> Bundesland (16) -> Kreis (~400) -> populated places (>= 5000 pop).
 *
 * Usage: npx tsx scripts/build-de-municipalities.ts
 *
 * Prerequisites:
 *   curl -fsSL -o /tmp/DE.zip https://download.geonames.org/export/dump/DE.zip
 *   unzip -o /tmp/DE.zip -d /tmp/geonames_de/
 *
 * Source: GeoNames - CC BY 4.0 (https://www.geonames.org/)
 *
 * Pre-flight defaults applied in this script (from plan Task 0):
 *   - Population threshold: >= 5000 (populated places with feature class P only)
 *   - Parishes (Kirchgemeinden): excluded (out of scope for Phase 1)
 *   - Admin suffixes preserved in names as authored by GeoNames
 *
 * GeoNames admin hierarchy for Germany:
 *   admin1 (col 10) = Bundesland (ADM1, codes 01–16)
 *   admin2 (col 11) = Regierungsbezirk (ADM2, only in BY/NRW/HE/BW; "00" elsewhere)
 *   admin3 (col 12) = Landkreis/Kreis (ADM3, ~400 entries)
 *   admin4 (col 13) = Gemeinde (ADM4)
 *
 * We group places by admin1 → admin3 (skipping admin2 = Regierungsbezirk),
 * which gives the genealogically meaningful Bundesland → Kreis hierarchy.
 *
 * Expected output:
 *   src/api/place-gazetteers/data/de-gemeinden.json  (~3-6 MB)
 *   16 Bundesländer, ~400 Kreise, ~3000 populated places
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');
const GEONAMES_FILE = '/tmp/geonames_de/DE.txt';
const PLACE_MIN_POP = 5000;

// GeoNames admin1 codes for Germany (appear in column index 10 of the dump).
// Names are the canonical German spellings.
const ADMIN1_NAMES: Record<string, string> = {
  '01': 'Baden-Württemberg',
  '02': 'Bayern',
  '03': 'Bremen',
  '04': 'Hamburg',
  '05': 'Hessen',
  '06': 'Niedersachsen',
  '07': 'Nordrhein-Westfalen',
  '08': 'Rheinland-Pfalz',
  '09': 'Saarland',
  '10': 'Schleswig-Holstein',
  '11': 'Brandenburg',
  '12': 'Mecklenburg-Vorpommern',
  '13': 'Sachsen',
  '14': 'Sachsen-Anhalt',
  '15': 'Thüringen',
  '16': 'Berlin',
};

interface GeoNameRow {
  geonameId: string;
  name: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  population: number;
  admin1: string;  // col 10: Bundesland code
  admin2: string;  // col 11: Regierungsbezirk code (often "00")
  admin3: string;  // col 12: Landkreis/Kreis code
}

function parseRows(filePath: string): GeoNameRow[] {
  const result: GeoNameRow[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    // GeoNames columns (0-indexed):
    // 0=id, 1=name, 2=asciiName, 3=altNames, 4=lat, 5=lon,
    // 6=featureClass, 7=featureCode, 8=countryCode, 9=cc2,
    // 10=admin1, 11=admin2, 12=admin3, 13=admin4,
    // 14=population, 15=elevation, 16=dem, 17=timezone, 18=modDate
    const cols = line.split('\t');
    if (cols.length < 15) continue;
    result.push({
      geonameId: cols[0],
      name: cols[1],
      lat: parseFloat(cols[4]),
      lon: parseFloat(cols[5]),
      featureClass: cols[6],
      featureCode: cols[7],
      population: parseInt(cols[14] ?? '0', 10) || 0,
      admin1: cols[10] ?? '',
      admin2: cols[11] ?? '',
      admin3: cols[12] ?? '',
    });
  }
  return result;
}

async function main() {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`Missing ${GEONAMES_FILE}. See script header for download steps.`);
    process.exit(1);
  }

  console.log('Parsing GeoNames DE...');
  const allRows = parseRows(GEONAMES_FILE);
  console.log(`  Total rows: ${allRows.length}`);

  // Build Kreis (ADM3) name index: "admin1.admin3" -> name.
  // ADM3 rows have featureClass=A, featureCode=ADM3.
  const kreisNames = new Map<string, string>();   // "02.09777" -> "Landkreis Aichach-Friedberg"
  const kreisCoords = new Map<string, { lat: number; lon: number }>();
  for (const r of allRows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM3') continue;
    if (!r.admin1 || !r.admin3) continue;
    const key = `${r.admin1}.${r.admin3}`;
    kreisNames.set(key, r.name);
    if (Number.isFinite(r.lat) && Number.isFinite(r.lon)) {
      kreisCoords.set(key, { lat: r.lat, lon: r.lon });
    }
  }
  console.log(`  Kreis count (ADM3): ${kreisNames.size}`);

  // Collect ADM1 coords as fallback for city-state Bundesländer with no Kreise.
  const adm1Coords = new Map<string, { lat: number; lon: number }>();
  for (const r of allRows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM1') continue;
    if (!r.admin1 || !Number.isFinite(r.lat)) continue;
    adm1Coords.set(r.admin1, { lat: r.lat, lon: r.lon });
  }

  // Group populated places by Bundesland > Kreis.
  // Places that have admin3 set are grouped under that Kreis.
  // Places in city-states (Berlin, Hamburg, Bremen) have admin3="" or a
  // city-specific code; we group them directly under the Bundesland.
  type PlaceBucket = Map<string, GeoNameRow[]>; // kreisKey -> rows
  const placesByBundesland = new Map<string, PlaceBucket>();

  for (const r of allRows) {
    if (r.featureClass !== 'P') continue;
    if (r.population < PLACE_MIN_POP) continue;
    if (!r.admin1) continue;
    // Use admin3 as Kreis key if present, else fall back to a synthetic key.
    const kreisKey = r.admin3 ? `${r.admin1}.${r.admin3}` : `${r.admin1}.__direct__`;
    if (!placesByBundesland.has(r.admin1)) placesByBundesland.set(r.admin1, new Map());
    const bucket = placesByBundesland.get(r.admin1)!;
    if (!bucket.has(kreisKey)) bucket.set(kreisKey, []);
    bucket.get(kreisKey)!.push(r);
  }

  console.log('\nBuilding Bundesland → Kreis → place tree...');

  const bundeslandNodes: GazetteerNode[] = [];

  // Sort Bundesländer alphabetically by German name.
  const sortedAdmin1 = Object.keys(ADMIN1_NAMES).sort((a, b) =>
    ADMIN1_NAMES[a].localeCompare(ADMIN1_NAMES[b], 'de')
  );

  for (const a1 of sortedAdmin1) {
    const blName = ADMIN1_NAMES[a1];
    const bucket = placesByBundesland.get(a1) ?? new Map<string, GeoNameRow[]>();

    const kreisChildren: GazetteerNode[] = [];

    // Sort Kreise alphabetically by name.
    const kreisKeys = [...bucket.keys()].sort((a, b) =>
      (kreisNames.get(a) ?? a).localeCompare(kreisNames.get(b) ?? b, 'de')
    );

    for (const kreisKey of kreisKeys) {
      const places = bucket.get(kreisKey)!;

      if (kreisKey.endsWith('.__direct__')) {
        // City-state: add places directly under Bundesland without a Kreis wrapper.
        // (We add them as a synthetic "Kreise" with the Bundesland name as label.)
        const directPlaces: GazetteerNode[] = places
          .sort((a, b) => a.name.localeCompare(b.name, 'de'))
          .map<GazetteerNode>(p => ({
            name: p.name,
            type: 'locality',
            lat: round6(p.lat),
            lon: round6(p.lon),
          }));
        const directCoords = avgCoordinates(places.map(p => ({ lat: p.lat, lon: p.lon })));
        kreisChildren.push({
          name: blName,
          type: 'admin2',
          lat: round6(directCoords.lat),
          lon: round6(directCoords.lon),
          children: directPlaces,
        });
        continue;
      }

      const kreisName = kreisNames.get(kreisKey) ?? kreisKey;
      const placeChildren: GazetteerNode[] = places
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map<GazetteerNode>(p => ({
          name: p.name,
          type: 'locality',
          lat: round6(p.lat),
          lon: round6(p.lon),
        }));

      const coords = kreisCoords.get(kreisKey)
        ?? avgCoordinates(places.map(p => ({ lat: p.lat, lon: p.lon })));

      kreisChildren.push({
        name: kreisName,
        type: 'admin2',
        lat: round6(coords.lat),
        lon: round6(coords.lon),
        children: placeChildren,
      });
    }

    // Compute Bundesland centroid from Kreise, or fall back to ADM1 coords.
    let blLat: number;
    let blLon: number;
    if (kreisChildren.length > 0) {
      const c = avgCoordinates(kreisChildren.map(k => ({ lat: k.lat, lon: k.lon })));
      blLat = c.lat;
      blLon = c.lon;
    } else {
      const fallback = adm1Coords.get(a1);
      blLat = round6(fallback?.lat ?? 0);
      blLon = round6(fallback?.lon ?? 0);
      console.log(`  Note: ${blName} has no Kreis children — using ADM1 coords`);
    }

    bundeslandNodes.push({
      name: blName,
      type: 'admin1',
      lat: blLat,
      lon: blLon,
      children: kreisChildren,
    });
  }

  // Country centroid = average of all Bundesländer.
  const deCoords = avgCoordinates(
    bundeslandNodes.filter(b => b.lat !== 0 || b.lon !== 0)
      .map(b => ({ lat: b.lat, lon: b.lon }))
  );

  const today = new Date().toISOString().slice(0, 10);

  const gazetteer = {
    id: 'de-gemeinden',
    name: 'Tyskland: Bundesländer, Kreise, Gemeinden',
    locale: 'de',
    description: 'German Bundesländer (16), Kreise (~400), and populated places (≥ 5000 pop). For genealogy research in Germany.',
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/',
      license: 'CC BY 4.0',
      fetched: today,
    },
    kind: 'point' as const,
    root: {
      name: 'Tyskland',
      type: 'country',
      lat: round6(deCoords.lat),
      lon: round6(deCoords.lon),
      aliases: ['Germany', 'Deutschland', 'DE'],
      children: bundeslandNodes,
    },
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const outPath = path.join(DATA_DIR, 'de-gemeinden.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '\n', 'utf-8');

  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  const totalKreise = bundeslandNodes.reduce((s, bl) => s + (bl.children?.length ?? 0), 0);
  const totalPlaces = bundeslandNodes.reduce(
    (sum, bl) => sum + (bl.children ?? []).reduce(
      (s, k) => s + (k.children?.length ?? 0), 0
    ), 0
  );
  console.log(`\nWrote ${outPath} (${sizeMB} MB)`);
  console.log(`  16 Bundesländer, ${totalKreise} Kreise, ${totalPlaces} places`);
}

main().catch(err => { console.error(err); process.exit(1); });
