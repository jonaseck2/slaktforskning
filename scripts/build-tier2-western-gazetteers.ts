/**
 * Build Tier 2 Western Europe gazetteers from GeoNames in one shot.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Per the European gazetteer roadmap design § 2.1:
 *   admin1 + admin2 + populated places (≥5000 pop). No parishes, no boundaries.
 *
 * Skipped: Vatican City (Q237) — no GeoNames admin data; resolves via world-countries.
 *
 * Usage:
 *   for cc in at ch it es pt mt sm li ad mc; do
 *     curl -fsSL -o /tmp/geonames_$cc/$CC.zip https://download.geonames.org/export/dump/$CC.zip
 *     unzip -o /tmp/geonames_$cc/$CC.zip -d /tmp/geonames_$cc/
 *   done
 *   npx tsx scripts/build-tier2-western-gazetteers.ts
 */
import * as fs from 'fs';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);
const PLACE_MIN_POP = 5000;

interface Country {
  cc: string;
  outputId: string;
  outputName: string;
  countryName: string;
  countryAliases: string[];
  countryLat: number;
  countryLon: number;
  description: string;
  /** GeoNames-typed structure: 2-tier (admin1+admin2+place) or 1-tier (admin1+place only). */
  hierarchy: 'two-tier' | 'one-tier';
}

const COUNTRIES: Country[] = [
  { cc: 'at', outputId: 'at-bezirke', outputName: 'Austria Bundesländer + Bezirke', countryName: 'Austria', countryAliases: ['Österreich', 'Autriche', 'Austria'], countryLat: 47.6, countryLon: 13.3, description: 'Austria: 9 Bundesländer (admin1) + 94 Bezirke (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'ch', outputId: 'ch-cantons', outputName: 'Switzerland Cantons + Bezirke', countryName: 'Switzerland', countryAliases: ['Schweiz', 'Suisse', 'Svizzera', 'Svizra'], countryLat: 46.8, countryLon: 8.2, description: 'Switzerland: 26 Kantone (admin1) + 149 Bezirke (admin2) + populated places ≥5000 pop. Trilingual DE/FR/IT names where present in GeoNames altNames.', hierarchy: 'two-tier' },
  { cc: 'it', outputId: 'it-province', outputName: 'Italy Regioni + Province', countryName: 'Italy', countryAliases: ['Italia', 'Italien'], countryLat: 41.9, countryLon: 12.6, description: 'Italy: 20 regioni (admin1) + 107 province/città metropolitane (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'es', outputId: 'es-provincias', outputName: 'Spain Comunidades + Provincias', countryName: 'Spain', countryAliases: ['España', 'Spanien', 'Espagne', 'Spagna'], countryLat: 40.0, countryLon: -4.0, description: 'Spain: 19 comunidades autónomas (admin1) + 52 provincias (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'pt', outputId: 'pt-distritos', outputName: 'Portugal Distritos + Concelhos', countryName: 'Portugal', countryAliases: ['República Portuguesa'], countryLat: 39.5, countryLon: -8.0, description: 'Portugal: 20 distritos/regiões autónomas (admin1) + 308 concelhos (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'mt', outputId: 'mt-localities', outputName: 'Malta Localities', countryName: 'Malta', countryAliases: ['Repubblika ta\' Malta'], countryLat: 35.9, countryLon: 14.4, description: 'Malta: 68 local councils (admin1, no admin2 layer in GeoNames) + populated places ≥5000 pop.', hierarchy: 'one-tier' },
  { cc: 'sm', outputId: 'sm-castelli', outputName: 'San Marino Castelli', countryName: 'San Marino', countryAliases: ['Repubblica di San Marino'], countryLat: 43.9, countryLon: 12.5, description: 'San Marino: 9 castelli (admin1) + populated places ≥5000 pop.', hierarchy: 'one-tier' },
  { cc: 'li', outputId: 'li-gemeinden', outputName: 'Liechtenstein Gemeinden', countryName: 'Liechtenstein', countryAliases: ['Fürstentum Liechtenstein'], countryLat: 47.2, countryLon: 9.5, description: 'Liechtenstein: 11 Gemeinden (admin1) + populated places ≥5000 pop.', hierarchy: 'one-tier' },
  { cc: 'ad', outputId: 'ad-parroquies', outputName: 'Andorra Parròquies', countryName: 'Andorra', countryAliases: ['Principat d\'Andorra'], countryLat: 42.5, countryLon: 1.5, description: 'Andorra: 7 parròquies (admin1) + populated places ≥5000 pop.', hierarchy: 'one-tier' },
  { cc: 'mc', outputId: 'mc-quartiers', outputName: 'Monaco Quartiers', countryName: 'Monaco', countryAliases: ['Principauté de Monaco'], countryLat: 43.7, countryLon: 7.4, description: 'Monaco: 1 single ADM1 entry from GeoNames + populated places ≥5000 pop. Quartiers (10) deferred — no GeoNames admin layer.', hierarchy: 'one-tier' },
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
  const path = `/tmp/geonames_${country.cc}/${country.cc.toUpperCase()}.txt`;
  if (!fs.existsSync(path)) {
    console.warn(`[${country.cc}] missing ${path}; skipping.`);
    return;
  }
  console.log(`[${country.cc}] parsing ${path}…`);
  const rows = parseRows(path);
  console.log(`[${country.cc}]   ${rows.length} rows`);

  // ADM1
  interface AdmMeta { name: string; aliases: string[]; lat: number; lon: number }
  const adm1s = new Map<string, AdmMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM1') continue;
    if (!r.admin1) continue;
    const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
    adm1s.set(r.admin1, { name: r.name, aliases: altList, lat: r.lat, lon: r.lon });
  }
  console.log(`[${country.cc}]   ${adm1s.size} admin1`);

  // ADM2 (two-tier only)
  interface Adm2Meta extends AdmMeta { adm1Code: string }
  const adm2s = new Map<string, Adm2Meta>();
  if (country.hierarchy === 'two-tier') {
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
  }

  // Places
  // For two-tier: group by admin1.admin2; for one-tier: group by admin1.
  const placesByKey = new Map<string, Row[]>();
  let included = 0;
  for (const r of rows) {
    if (r.featureClass !== 'P') continue;
    if (r.population < PLACE_MIN_POP) continue;
    if (!r.admin1) continue;
    if (country.hierarchy === 'two-tier' && !r.admin2) continue;
    const key = country.hierarchy === 'two-tier' ? `${r.admin1}.${r.admin2}` : r.admin1;
    if (!placesByKey.has(key)) placesByKey.set(key, []);
    placesByKey.get(key)!.push(r);
    included++;
  }
  console.log(`[${country.cc}]   ${included} populated places ≥${PLACE_MIN_POP} pop`);

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

  if (country.hierarchy === 'two-tier') {
    for (const [key, adm2] of adm2s) {
      const parent = adm1Nodes.get(adm2.adm1Code);
      if (!parent) continue;
      const placeNodes: GazetteerNode[] = [];
      for (const p of placesByKey.get(key) ?? []) {
        placeNodes.push({ name: p.name, type: 'admin3', lat: round6(p.lat), lon: round6(p.lon) });
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
  } else {
    // One-tier: places attach directly under admin1.
    for (const [adm1Code, places] of placesByKey) {
      const parent = adm1Nodes.get(adm1Code);
      if (!parent) continue;
      for (const p of places) {
        parent.children!.push({ name: p.name, type: 'admin2', lat: round6(p.lat), lon: round6(p.lon) });
      }
      parent.children!.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  for (const n of adm1Nodes.values()) {
    n.children!.sort((a, b) => a.name.localeCompare(b.name));
    if (n.children!.length > 0) {
      const c = avgCoordinates(n.children!.map(c => ({ lat: c.lat, lon: c.lon })));
      n.lat = c.lat;
      n.lon = c.lon;
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
      notes: `Filter: P (populated place) ≥${PLACE_MIN_POP} pop + A/ADM1${country.hierarchy === 'two-tier' ? '/ADM2' : ' only'}.`,
    },
    root,
  }, `${country.outputId}.json`);
  console.log(`[${country.cc}] Wrote ${result.path} (${result.sizeKB} KB)\n`);
}

for (const c of COUNTRIES) buildCountry(c);
