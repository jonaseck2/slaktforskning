/**
 * Build the three Baltic gazetteers from GeoNames in one shot.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Hierarchies:
 *   ee-counties: World > Europe > Estonia → maakond (admin1, 15) → vald/linn (admin2, 79) → place (admin3, ≥1000 pop)
 *   lv-novadi:   World > Europe > Latvia → novads (admin1, 43) → pagasts (admin2, 587) → place (admin3, ≥1000 pop)
 *   lt-savivaldybes: World > Europe > Lithuania → apskritis (admin1, 10) → savivaldybė (admin2, 60) → place (admin3, ≥1000 pop)
 *
 * Lutheran (EE/LV) / Catholic (LT) parishes from Wikidata deferred to follow-up.
 *
 * Usage: download GeoNames first per country code, then:
 *   npx tsx scripts/build-baltic-gazetteers.ts
 */
import * as fs from 'fs';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);
const PLACE_MIN_POP = 1000;

interface Country {
  cc: string;            // ISO alpha-2 lowercase
  filePath: string;      // GeoNames .txt path
  outputId: string;      // gazetteer id
  outputName: string;    // gazetteer name
  countryName: string;   // canonical English name
  countryAliases: string[];
  countryLat: number;
  countryLon: number;
  description: string;
}

const COUNTRIES: Country[] = [
  {
    cc: 'ee',
    filePath: '/tmp/geonames_ee/EE.txt',
    outputId: 'ee-counties',
    outputName: 'Estonia Maakonnad and Vallad',
    countryName: 'Estonia',
    countryAliases: ['Eesti', 'Estland'],
    countryLat: 58.6,
    countryLon: 25.0,
    description: 'Estonia: 15 maakonnad (admin1) → 79 vallad/linnad (admin2) → populated places ≥1000 pop. Lutheran kihelkonnad deferred.',
  },
  {
    cc: 'lv',
    filePath: '/tmp/geonames_lv/LV.txt',
    outputId: 'lv-novadi',
    outputName: 'Latvia Novadi and Pagasti',
    countryName: 'Latvia',
    countryAliases: ['Latvija', 'Lettland'],
    countryLat: 56.9,
    countryLon: 24.6,
    description: 'Latvia: 43 novadi/valstspilsētas (admin1) → 587 pagasti (admin2) → populated places ≥1000 pop. Lutheran draudzes deferred.',
  },
  {
    cc: 'lt',
    filePath: '/tmp/geonames_lt/LT.txt',
    outputId: 'lt-savivaldybes',
    outputName: 'Lithuania Apskritys and Savivaldybės',
    countryName: 'Lithuania',
    countryAliases: ['Lietuva', 'Litauen'],
    countryLat: 55.2,
    countryLon: 23.9,
    description: 'Lithuania: 10 apskritys (admin1, statistical/historical) → 60 savivaldybės (admin2) → populated places ≥1000 pop. Catholic parapijos deferred.',
  },
];

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

function buildCountry(country: Country): void {
  console.log(`[${country.cc}] parsing ${country.filePath}…`);
  const rows = parseRows(country.filePath);
  console.log(`[${country.cc}]   ${rows.length} rows`);

  // ADM1 nodes
  interface AdmMeta { name: string; aliases: string[]; lat: number; lon: number }
  const adm1s = new Map<string, AdmMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM1') continue;
    if (!r.admin1) continue;
    const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
    adm1s.set(r.admin1, { name: r.name, aliases: altList, lat: r.lat, lon: r.lon });
  }
  console.log(`[${country.cc}]   ${adm1s.size} admin1`);

  // ADM2 nodes
  interface Adm2Meta extends AdmMeta { adm1Code: string }
  const adm2s = new Map<string, Adm2Meta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM2') continue;
    if (!r.admin1 || !r.admin2) continue;
    const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
    adm2s.set(`${r.admin1}.${r.admin2}`, {
      name: r.name,
      aliases: altList,
      lat: r.lat,
      lon: r.lon,
      adm1Code: r.admin1,
    });
  }
  console.log(`[${country.cc}]   ${adm2s.size} admin2`);

  // Populated places
  const placesByAdm2 = new Map<string, Row[]>();
  let included = 0;
  for (const r of rows) {
    if (r.featureClass !== 'P') continue;
    if (r.population < PLACE_MIN_POP) continue;
    if (!r.admin1 || !r.admin2) continue;
    const key = `${r.admin1}.${r.admin2}`;
    if (!placesByAdm2.has(key)) placesByAdm2.set(key, []);
    placesByAdm2.get(key)!.push(r);
    included++;
  }
  console.log(`[${country.cc}]   ${included} populated places`);

  const adm1Nodes = new Map<string, GazetteerNode>();
  for (const [code, meta] of adm1s) {
    adm1Nodes.set(code, {
      name: meta.name,
      type: 'admin1',
      aliases: meta.aliases.length > 0 ? meta.aliases : undefined,
      lat: round6(meta.lat),
      lon: round6(meta.lon),
      children: [],
    });
  }

  for (const [key, adm2] of adm2s) {
    const parent = adm1Nodes.get(adm2.adm1Code);
    if (!parent) continue;
    const placeNodes: GazetteerNode[] = [];
    for (const p of placesByAdm2.get(key) ?? []) {
      placeNodes.push({
        name: p.name,
        type: 'admin3',
        lat: round6(p.lat),
        lon: round6(p.lon),
      });
    }
    placeNodes.sort((a, b) => a.name.localeCompare(b.name));
    parent.children!.push({
      name: adm2.name,
      type: 'admin2',
      aliases: adm2.aliases.length > 0 ? adm2.aliases : undefined,
      lat: round6(adm2.lat),
      lon: round6(adm2.lon),
      children: placeNodes,
    });
  }

  for (const n of adm1Nodes.values()) {
    n.children!.sort((a, b) => a.name.localeCompare(b.name));
    if (n.children!.length > 0) {
      const center = avgCoordinates(n.children!.map(c => ({ lat: c.lat, lon: c.lon })));
      n.lat = center.lat;
      n.lon = center.lon;
    }
  }

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
        name: country.countryName,
        type: 'country',
        aliases: country.countryAliases,
        lat: country.countryLat,
        lon: country.countryLon,
        children: Array.from(adm1Nodes.values()).sort((a, b) => a.name.localeCompare(b.name)),
      }],
    }],
  };

  const result = writeGazetteer({
    id: country.outputId,
    name: country.outputName,
    locale: country.cc,
    description: country.description,
    kind: 'point',
    source: {
      name: 'GeoNames',
      url: `https://download.geonames.org/export/dump/${country.cc.toUpperCase()}.zip`,
      license: 'CC BY 4.0',
      attribution: `Source: GeoNames.org (CC BY 4.0), fetched ${FETCHED_DATE}`,
      fetched: FETCHED_DATE,
      notes: `Filter: P (populated place) ≥${PLACE_MIN_POP} pop + A/ADM1/ADM2.`,
    },
    root,
  }, `${country.outputId}.json`);
  console.log(`[${country.cc}] Wrote ${result.path} (${result.sizeKB} KB)\n`);
}

for (const c of COUNTRIES) {
  if (!fs.existsSync(c.filePath)) {
    console.error(`Missing ${c.filePath}; skipping ${c.cc}.`);
    continue;
  }
  buildCountry(c);
}
