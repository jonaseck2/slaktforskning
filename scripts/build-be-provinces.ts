/**
 * Build be-provinces gazetteer from GeoNames BE.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Hierarchy: World > Europe > Belgium → region (admin1, 3: Brussels, Flanders, Wallonia)
 *            → province (admin2, 11) → populated place (admin3, ≥1000 pop).
 *
 * Bilingual handling: GeoNames returns admin2 names with "Provincie X"
 * (Dutch) or "Province de X" / "Province du X" (French) depending on the
 * locale. We strip both prefixes to a canonical bare name; both prefixed
 * forms (and any altNames) are aliases. Brussels-Capital region uses the
 * bilingual "Bruxelles-Capitale / Brussels-Capital" form as alias.
 *
 * Catholic parishes (Wikidata Q17143723, country=Belgium) deferred to
 * follow-up `be-catholic-parishes`.
 *
 * Usage:
 *   curl -fsSL -o /tmp/geonames_be/BE.zip https://download.geonames.org/export/dump/BE.zip
 *   unzip -o /tmp/geonames_be/BE.zip -d /tmp/geonames_be/
 *   npx tsx scripts/build-be-provinces.ts
 */
import * as fs from 'fs';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);
const GEONAMES_FILE = '/tmp/geonames_be/BE.txt';
const PLACE_MIN_POP = 1000;

const REGION_NAMES: Record<string, { name: string; aliases: string[] }> = {
  BRU: { name: 'Bruxelles-Capitale', aliases: ['Brussels Hoofdstedelijk Gewest', 'Brussels-Capital', 'Bruxelles', 'Brussel'] },
  WAL: { name: 'Wallonie', aliases: ['Wallonia', 'Région wallonne', 'Waals Gewest'] },
  VLG: { name: 'Vlaanderen', aliases: ['Flanders', 'Vlaams Gewest', 'Région flamande'] },
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

function stripProvincePrefix(name: string): { name: string; alias: string | null } {
  const m = name.match(/^(Provincie|Province de|Province du)\s+(.+)$/i);
  if (m) return { name: m[2].trim(), alias: name.trim() };
  return { name: name.trim(), alias: null };
}

function main(): void {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`Missing ${GEONAMES_FILE}.`);
    process.exit(1);
  }
  console.log('[be] parsing GeoNames BE…');
  const rows = parseRows(GEONAMES_FILE);
  console.log(`[be]   ${rows.length} rows`);

  // ADM2 = province
  interface ProvMeta { name: string; aliases: string[]; lat: number; lon: number; regionCode: string }
  const provs = new Map<string, ProvMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM2') continue;
    if (!r.admin1 || !r.admin2) continue;
    const cleaned = stripProvincePrefix(r.name);
    const aliases = cleaned.alias ? [cleaned.alias] : [];
    const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean);
    for (const a of altList) {
      const ac = stripProvincePrefix(a);
      if (ac.name && ac.name !== cleaned.name && !aliases.includes(ac.name)) aliases.push(ac.name);
    }
    provs.set(`${r.admin1}.${r.admin2}`, {
      name: cleaned.name,
      aliases,
      lat: r.lat,
      lon: r.lon,
      regionCode: r.admin1,
    });
  }
  console.log(`[be]   ${provs.size} provinces`);

  // Populated places by province.
  const placesByProv = new Map<string, Row[]>();
  let included = 0;
  for (const r of rows) {
    if (r.featureClass !== 'P') continue;
    if (r.population < PLACE_MIN_POP) continue;
    if (!r.admin1 || !r.admin2) continue;
    const key = `${r.admin1}.${r.admin2}`;
    if (!placesByProv.has(key)) placesByProv.set(key, []);
    placesByProv.get(key)!.push(r);
    included++;
  }
  console.log(`[be]   ${included} populated places (≥${PLACE_MIN_POP} pop)`);

  // Build regions → provinces → places.
  const regionNodes = new Map<string, GazetteerNode>();
  for (const [code, meta] of Object.entries(REGION_NAMES)) {
    regionNodes.set(code, {
      name: meta.name,
      type: 'admin1',
      aliases: meta.aliases,
      lat: 50.5,
      lon: 4.6,
      children: [],
    });
  }

  for (const [, prov] of provs) {
    const region = regionNodes.get(prov.regionCode);
    if (!region) continue;
    const placeNodes: GazetteerNode[] = [];
    for (const p of placesByProv.get(`${prov.regionCode}.${[...provs.entries()].find(([k, v]) => v === prov)![0].split('.')[1]}`) ?? []) {
      placeNodes.push({
        name: p.name,
        type: 'admin3',
        lat: round6(p.lat),
        lon: round6(p.lon),
      });
    }
    placeNodes.sort((a, b) => a.name.localeCompare(b.name, 'nl-BE'));
    region.children!.push({
      name: prov.name,
      type: 'admin2',
      aliases: prov.aliases.length > 0 ? prov.aliases : undefined,
      lat: round6(prov.lat),
      lon: round6(prov.lon),
      children: placeNodes,
    });
  }

  // For Brussels-Capital (no provinces), attach populated places directly.
  for (const r of rows) {
    if (r.featureClass !== 'P') continue;
    if (r.population < PLACE_MIN_POP) continue;
    if (r.admin1 !== 'BRU' || r.admin2) continue;
    const region = regionNodes.get('BRU');
    if (!region) continue;
    region.children!.push({
      name: r.name,
      type: 'admin2',
      lat: round6(r.lat),
      lon: round6(r.lon),
    });
  }

  for (const r of regionNodes.values()) {
    r.children!.sort((a, b) => a.name.localeCompare(b.name, 'nl-BE'));
    if (r.children!.length > 0) {
      const center = avgCoordinates(r.children!.map(c => ({ lat: c.lat, lon: c.lon })));
      r.lat = center.lat;
      r.lon = center.lon;
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
        name: 'Belgium',
        type: 'country',
        aliases: ['België', 'Belgique', 'Belgien', 'Belgio'],
        lat: 50.5,
        lon: 4.6,
        children: Array.from(regionNodes.values()),
      }],
    }],
  };

  const result = writeGazetteer({
    id: 'be-provinces',
    name: 'Belgium Regions, Provinces, and Populated Places',
    locale: 'nl-BE',
    description: 'Belgium: 3 regions (admin1) → 10 provinces (admin2) + Brussels-Capital → populated places ≥1000 pop. Bilingual NL/FR/DE aliases. Catholic parishes deferred.',
    kind: 'point',
    source: {
      name: 'GeoNames',
      url: 'https://download.geonames.org/export/dump/BE.zip',
      license: 'CC BY 4.0',
      attribution: `Source: GeoNames.org (CC BY 4.0), fetched ${FETCHED_DATE}`,
      fetched: FETCHED_DATE,
      notes: `Filter: P (populated place) ≥${PLACE_MIN_POP} pop + A/ADM1/ADM2. "Provincie X" / "Province de X" prefixes stripped from canonical name.`,
    },
    root,
  }, 'be-provinces.json');

  console.log(`[be] Wrote ${result.path} (${result.sizeKB} KB)`);
}

main();
