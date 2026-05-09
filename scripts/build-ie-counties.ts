/**
 * Build ie-counties gazetteer from GeoNames IE.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Hierarchy: World > Europe > Ireland (country)
 *            → province (admin1, 4: Connacht, Leinster, Munster, Ulster — historical)
 *            → county (admin2, 31)
 *            → populated place (admin3, ≥1000 pop)
 *
 * Note: GeoNames IE.zip covers only the Republic of Ireland (26 of 32 historical
 * counties). Northern Ireland's 6 historical counties (Antrim, Armagh, Down,
 * Fermanagh, Londonderry, Tyrone) live under GB.zip and are reached via the
 * gb-civil-divisions gazetteer. The Ulster province in this gazetteer therefore
 * carries only the 3 RoI Ulster counties (Cavan, Donegal, Monaghan).
 *
 * Civil parishes (~2,500), townlands (~62k), Catholic parishes — DEFERRED to
 * follow-up gazetteers (ie-civil-parishes, ie-townlands, ie-catholic-parishes).
 *
 * Usage:
 *   curl -fsSL -o /tmp/geonames_ie/IE.zip https://download.geonames.org/export/dump/IE.zip
 *   unzip -o /tmp/geonames_ie/IE.zip -d /tmp/geonames_ie/
 *   npx tsx scripts/build-ie-counties.ts
 */
import * as fs from 'fs';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);
const GEONAMES_FILE = '/tmp/geonames_ie/IE.txt';
const PLACE_MIN_POP = 1000;

// GeoNames admin1 codes for Ireland → historical province names.
const PROVINCE_NAMES: Record<string, string> = {
  C: 'Connacht',
  L: 'Leinster',
  M: 'Munster',
  U: 'Ulster',
};
const PROVINCE_ALIASES: Record<string, string[]> = {
  Connacht: ['Connaught', 'Cúige Chonnacht'],
  Leinster: ['Cúige Laighean'],
  Munster: ['Cúige Mumhan'],
  Ulster: ['Cúige Uladh'],
};

interface Row {
  name: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  admin1: string;
  admin2: string;
  population: number;
  altNames: string;
}

function parseRows(filePath: string): Row[] {
  const out: Row[] = [];
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    const c = line.split('\t');
    if (c.length < 15) continue;
    out.push({
      name: c[1],
      lat: parseFloat(c[4]),
      lon: parseFloat(c[5]),
      featureClass: c[6],
      featureCode: c[7],
      admin1: c[10] ?? '',
      admin2: c[11] ?? '',
      population: parseInt(c[14] ?? '0', 10) || 0,
      altNames: c[3] ?? '',
    });
  }
  return out;
}

function cleanCountyName(raw: string): { name: string; aliases: string[] } {
  // GeoNames mixes "County X", "X County", "X", and Irish-language forms.
  // Canonical: bare X (e.g. "Wicklow", "Tipperary"). Other forms → aliases.
  const aliases: string[] = [];
  let name = raw.trim();
  if (/^County\s+/i.test(name)) {
    aliases.push(name);
    name = name.replace(/^County\s+/i, '').trim();
  } else if (/\sCounty$/i.test(name)) {
    aliases.push(name);
    name = name.replace(/\sCounty$/i, '').trim();
  }
  return { name, aliases };
}

function main(): void {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`Missing ${GEONAMES_FILE}. Download per script header.`);
    process.exit(1);
  }

  console.log('[ie-counties] Parsing GeoNames IE…');
  const rows = parseRows(GEONAMES_FILE);
  console.log(`[ie-counties]   ${rows.length} rows`);

  // Index counties (ADM2 by admin1 + admin2 code).
  interface CountyMeta { name: string; aliases: string[]; lat: number; lon: number; provinceCode: string }
  const counties = new Map<string, CountyMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM2') continue;
    if (!r.admin1 || !r.admin2) continue;
    const key = `${r.admin1}.${r.admin2}`;
    const cleaned = cleanCountyName(r.name);
    // Pull Irish-language aliases from altNames if present.
    const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean);
    for (const a of altList) {
      const ac = cleanCountyName(a);
      if (ac.name && ac.name !== cleaned.name && !cleaned.aliases.includes(ac.name)) {
        cleaned.aliases.push(ac.name);
      }
    }
    counties.set(key, {
      name: cleaned.name,
      aliases: [...new Set(cleaned.aliases)].filter(a => a !== cleaned.name),
      lat: r.lat,
      lon: r.lon,
      provinceCode: r.admin1,
    });
  }
  console.log(`[ie-counties]   ${counties.size} counties (ADM2)`);

  // Group populated places by admin1.admin2.
  const placesByCounty = new Map<string, Row[]>();
  let included = 0;
  for (const r of rows) {
    if (r.featureClass !== 'P') continue;
    if (r.population < PLACE_MIN_POP) continue;
    if (!r.admin1 || !r.admin2) continue;
    const key = `${r.admin1}.${r.admin2}`;
    if (!placesByCounty.has(key)) placesByCounty.set(key, []);
    placesByCounty.get(key)!.push(r);
    included++;
  }
  console.log(`[ie-counties]   ${included} populated places (≥${PLACE_MIN_POP} pop) included`);

  // Build provinces → counties → places.
  const provinces = new Map<string, GazetteerNode>();
  for (const code of Object.keys(PROVINCE_NAMES)) {
    const name = PROVINCE_NAMES[code];
    provinces.set(code, {
      name,
      type: 'admin1',
      aliases: PROVINCE_ALIASES[name],
      lat: 53.5,
      lon: -8.0,
      children: [],
    });
  }

  for (const [key, county] of counties) {
    const province = provinces.get(county.provinceCode);
    if (!province) {
      console.warn(`[ie-counties] orphan county ${county.name} (province=${county.provinceCode}); skipping.`);
      continue;
    }
    const placeNodes: GazetteerNode[] = [];
    for (const p of placesByCounty.get(key) ?? []) {
      placeNodes.push({
        name: p.name,
        type: 'admin3',
        lat: round6(p.lat),
        lon: round6(p.lon),
      });
    }
    placeNodes.sort((a, b) => a.name.localeCompare(b.name, 'en-IE'));
    province.children!.push({
      name: county.name,
      type: 'admin2',
      aliases: county.aliases.length > 0 ? county.aliases : undefined,
      lat: round6(county.lat),
      lon: round6(county.lon),
      children: placeNodes,
    });
  }

  // Sort each province's counties.
  for (const p of provinces.values()) {
    p.children!.sort((a, b) => a.name.localeCompare(b.name, 'en-IE'));
    const center = avgCoordinates(p.children!.map(c => ({ lat: c.lat, lon: c.lon })));
    p.lat = center.lat;
    p.lon = center.lon;
  }

  const provinceArr = ['Leinster', 'Munster', 'Connacht', 'Ulster']
    .map(name => Array.from(provinces.values()).find(p => p.name === name)!)
    .filter(Boolean);

  const root: GazetteerNode = {
    name: 'World',
    type: 'world',
    lat: 0,
    lon: 0,
    children: [{
      name: 'Europe',
      type: 'continent',
      lat: 50.0,
      lon: 10.0,
      children: [{
        name: 'Ireland',
        type: 'country',
        aliases: ['Éire', 'Republic of Ireland', 'Irland', 'Irlande', 'Irlanda'],
        lat: 53.5,
        lon: -8.0,
        children: provinceArr,
      }],
    }],
  };

  const result = writeGazetteer({
    id: 'ie-counties',
    name: 'Ireland (RoI) Provinces, Counties, and Populated Places',
    locale: 'en-IE',
    description: 'Republic of Ireland: 4 historical provinces (admin1) → 26 counties (admin2) → populated places ≥1000 pop. Northern Ireland counties live in gb-civil-divisions.',
    kind: 'point',
    source: {
      name: 'GeoNames',
      url: 'https://download.geonames.org/export/dump/IE.zip',
      license: 'CC BY 4.0',
      attribution: `Source: GeoNames.org (CC BY 4.0), fetched ${FETCHED_DATE}`,
      fetched: FETCHED_DATE,
      notes: `Filter: P (populated place) ≥${PLACE_MIN_POP} pop + A/ADM1/ADM2. Civil parishes, townlands, Catholic parishes deferred.`,
    },
    root,
  }, 'ie-counties.json');

  console.log(`[ie-counties] Wrote ${result.path} (${result.sizeKB} KB)`);
}

main();
