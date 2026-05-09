/**
 * Build pl-powiaty gazetteer from GeoNames PL.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Hierarchy: World > Europe > Poland → województwo (admin1, 16) → powiat
 *            (admin2, 380) → populated place (admin3, ≥10000 pop).
 *
 * Polish admin1 names: GeoNames primary is English ("Lublin Voivodeship");
 * Polish form ("Lubelskie") pulled from altNames if available and used as
 * canonical name (English → alias).
 *
 * Catholic parafie (~10k actual; ~5k in Wikidata Q17143723) deferred to
 * follow-up `pl-parafie`. Pre-1989 województwa, partition-era admin → europe-historical.
 *
 * Usage:
 *   curl -fsSL -o /tmp/geonames_pl/PL.zip https://download.geonames.org/export/dump/PL.zip
 *   unzip -o /tmp/geonames_pl/PL.zip -d /tmp/geonames_pl/
 *   npx tsx scripts/build-pl-powiaty.ts
 */
import * as fs from 'fs';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);
const GEONAMES_FILE = '/tmp/geonames_pl/PL.txt';
const PLACE_MIN_POP = 10000;

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

// Pick the Polish-language single-word adjectival form (e.g. "Małopolskie")
// from altNames as the canonical voivodeship name. The English "X Voivodeship"
// form drops to alias.
function pickPolishVoivodeshipName(englishName: string, altNames: string): { name: string; aliases: string[] } {
  const alts = altNames.split(',').map(s => s.trim()).filter(Boolean);
  // Polish voivodeship adjectival forms typically end in -skie / -opolskie / -orskie.
  const polishAdjective = alts.find(a => /(skie|opolskie|orskie)$/i.test(a) && !a.includes(' '));
  if (polishAdjective) {
    return { name: polishAdjective, aliases: [englishName, ...alts.filter(a => a !== polishAdjective).slice(0, 3)] };
  }
  return { name: englishName, aliases: alts.slice(0, 4) };
}

function main(): void {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`Missing ${GEONAMES_FILE}.`);
    process.exit(1);
  }
  console.log('[pl] parsing GeoNames PL…');
  const rows = parseRows(GEONAMES_FILE);
  console.log(`[pl]   ${rows.length} rows`);

  // ADM1 województwa
  interface VoiMeta { name: string; aliases: string[]; lat: number; lon: number }
  const vois = new Map<string, VoiMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM1') continue;
    if (!r.admin1) continue;
    const picked = pickPolishVoivodeshipName(r.name, r.altNames);
    vois.set(r.admin1, { ...picked, lat: r.lat, lon: r.lon });
  }
  console.log(`[pl]   ${vois.size} województwa`);

  // ADM2 powiaty
  interface PowMeta { name: string; aliases: string[]; lat: number; lon: number; voiCode: string }
  const pows = new Map<string, PowMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM2') continue;
    if (!r.admin1 || !r.admin2) continue;
    const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
    pows.set(`${r.admin1}.${r.admin2}`, {
      name: r.name,
      aliases: altList,
      lat: r.lat,
      lon: r.lon,
      voiCode: r.admin1,
    });
  }
  console.log(`[pl]   ${pows.size} powiaty`);

  // Populated places ≥10k pop by powiat.
  const placesByPow = new Map<string, Row[]>();
  let included = 0;
  for (const r of rows) {
    if (r.featureClass !== 'P') continue;
    if (r.population < PLACE_MIN_POP) continue;
    if (!r.admin1 || !r.admin2) continue;
    const key = `${r.admin1}.${r.admin2}`;
    if (!placesByPow.has(key)) placesByPow.set(key, []);
    placesByPow.get(key)!.push(r);
    included++;
  }
  console.log(`[pl]   ${included} populated places ≥${PLACE_MIN_POP} pop`);

  // Build voivodeships → powiaty → places.
  const voiNodes = new Map<string, GazetteerNode>();
  for (const [code, meta] of vois) {
    voiNodes.set(code, {
      name: meta.name,
      type: 'admin1',
      aliases: meta.aliases.length > 0 ? meta.aliases : undefined,
      lat: round6(meta.lat),
      lon: round6(meta.lon),
      children: [],
    });
  }

  for (const [key, pow] of pows) {
    const voi = voiNodes.get(pow.voiCode);
    if (!voi) continue;
    const placeNodes: GazetteerNode[] = [];
    for (const p of placesByPow.get(key) ?? []) {
      placeNodes.push({
        name: p.name,
        type: 'admin3',
        lat: round6(p.lat),
        lon: round6(p.lon),
      });
    }
    placeNodes.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    voi.children!.push({
      name: pow.name,
      type: 'admin2',
      aliases: pow.aliases.length > 0 ? pow.aliases : undefined,
      lat: round6(pow.lat),
      lon: round6(pow.lon),
      children: placeNodes,
    });
  }

  for (const v of voiNodes.values()) {
    v.children!.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    if (v.children!.length > 0) {
      const center = avgCoordinates(v.children!.map(c => ({ lat: c.lat, lon: c.lon })));
      v.lat = center.lat;
      v.lon = center.lon;
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
        name: 'Poland',
        type: 'country',
        aliases: ['Polska', 'Polen', 'Pologne', 'Polonia'],
        lat: 52.2,
        lon: 19.4,
        children: Array.from(voiNodes.values()).sort((a, b) => a.name.localeCompare(b.name, 'pl')),
      }],
    }],
  };

  const result = writeGazetteer({
    id: 'pl-powiaty',
    name: 'Poland Województwa, Powiaty, and Populated Places',
    locale: 'pl',
    description: 'Poland: 16 województwa (admin1) → 380 powiaty (admin2) → 492 populated places ≥10000 pop. Polish adjectival voivodeship names (Małopolskie, Wielkopolskie, …) used as canonical with English forms as aliases.',
    kind: 'point',
    source: {
      name: 'GeoNames',
      url: 'https://download.geonames.org/export/dump/PL.zip',
      license: 'CC BY 4.0',
      attribution: `Source: GeoNames.org (CC BY 4.0), fetched ${FETCHED_DATE}`,
      fetched: FETCHED_DATE,
      notes: `Filter: P (populated place) ≥${PLACE_MIN_POP} pop + A/ADM1/ADM2. Catholic parafie + ~2,500 gminy + partition-era admin deferred.`,
    },
    root,
  }, 'pl-powiaty.json');

  console.log(`[pl] Wrote ${result.path} (${result.sizeKB} KB)`);
}

main();
