/**
 * Build Tier 2 Eastern Europe gazetteers from GeoNames in one shot.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Per the European gazetteer roadmap design § 2.1:
 *   admin1 + admin2 + populated places (≥5000 pop). No parishes.
 *
 * SKIPPED: ru-eu (European Russia, west of Urals) and tr-eu (European Turkey,
 * Thrace) — GeoNames RU.zip and TR.zip are very large and would require
 * longitude-based filtering to extract the European-only subsets. Both
 * deferred to follow-up plans.
 *
 * Faroe Islands (FO) and Greenland (GL) are emitted as standalone-rooted
 * gazetteers (per design § 2.1: not folded into the Danish dk-* tree).
 *
 * Cyrillic-script countries (BG, BY, UA): GeoNames altNames carry both forms;
 * canonical = primary (Latin transliteration), Cyrillic in aliases.
 *
 * Usage:
 *   for cc in bg ro md gr cy by ua fo gl; do
 *     curl -fsSL -o /tmp/geonames_$cc/$CC.zip https://download.geonames.org/export/dump/$CC.zip
 *     unzip -o /tmp/geonames_$cc/$CC.zip -d /tmp/geonames_$cc/
 *   done
 *   npx tsx scripts/build-tier2-eastern-gazetteers.ts
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
  hierarchy: 'two-tier' | 'one-tier';
}

const COUNTRIES: Country[] = [
  { cc: 'bg', outputId: 'bg-obshtini', outputName: 'Bulgaria Oblasti + Obshtini', countryName: 'Bulgaria', countryAliases: ['България', 'Republika Bulgaria'], countryLat: 42.7, countryLon: 25.5, description: 'Bulgaria: 28 oblasti (admin1) + 265 obshtini (admin2) + populated places ≥5000 pop. Cyrillic + Latin via altNames.', hierarchy: 'two-tier' },
  { cc: 'ro', outputId: 'ro-judete', outputName: 'Romania Județe + Comune', countryName: 'Romania', countryAliases: ['România'], countryLat: 45.9, countryLon: 24.9, description: 'Romania: 42 județe (admin1, including București) + 3,181 comune/orașe (admin2) + populated places ≥5000 pop. Hungarian aliases for Transylvanian places where available.', hierarchy: 'two-tier' },
  { cc: 'md', outputId: 'md-raioane', outputName: 'Moldova Raioane', countryName: 'Moldova', countryAliases: ['Republica Moldova', 'Молдова'], countryLat: 47.0, countryLon: 28.8, description: 'Moldova: 37 raioane (admin1; no admin2 layer) + populated places ≥5000 pop. Includes Transnistria and Gagauzia per Wikidata model.', hierarchy: 'one-tier' },
  { cc: 'gr', outputId: 'gr-dimoi', outputName: 'Greece Periféries + Dímoi', countryName: 'Greece', countryAliases: ['Ελλάδα', 'Hellas', 'Hellenic Republic'], countryLat: 39.0, countryLon: 22.5, description: 'Greece: 14 periféries (admin1) + 54 periferiakés enótites/dímoi (admin2) + populated places ≥5000 pop. Greek + transliterated Latin via altNames.', hierarchy: 'two-tier' },
  { cc: 'cy', outputId: 'cy-eparchies', outputName: 'Cyprus Eparchies', countryName: 'Cyprus', countryAliases: ['Κύπρος', 'Kıbrıs'], countryLat: 35.0, countryLon: 33.0, description: 'Cyprus: 6 eparchies (admin1) + 615 dimotika diamerísmata (admin2) + populated places ≥5000 pop. Greek + Turkish names where applicable.', hierarchy: 'two-tier' },
  { cc: 'by', outputId: 'by-rajony', outputName: 'Belarus Voblasci + Rajony', countryName: 'Belarus', countryAliases: ['Беларусь', 'Bielaruś'], countryLat: 53.7, countryLon: 27.9, description: 'Belarus: 7 voblasci (admin1, including Minsk City) + 158 rajony (admin2) + populated places ≥5000 pop. Cyrillic + Łacinka via altNames.', hierarchy: 'two-tier' },
  { cc: 'ua', outputId: 'ua-oblasti', outputName: 'Ukraine Oblasti + Rajony', countryName: 'Ukraine', countryAliases: ['Україна', 'Ukrayina'], countryLat: 49.0, countryLon: 31.5, description: 'Ukraine: 27 oblasti (admin1, including Kyiv + Sevastopol per Wikidata) + 146 admin2 + populated places ≥5000 pop. Cyrillic + Latin via altNames. Crimea modeled per Wikidata as part of Ukraine.', hierarchy: 'two-tier' },
  { cc: 'fo', outputId: 'fo-kommunur', outputName: 'Faroe Islands Kommunur', countryName: 'Faroe Islands', countryAliases: ['Føroyar', 'Færøerne'], countryLat: 62.0, countryLon: -7.0, description: 'Faroe Islands (Danish dependency, treated as standalone gazetteer per roadmap § 2.1): 6 sýslur/regions (admin1) + 29 kommunur (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'gl', outputId: 'gl-kommune', outputName: 'Greenland Kommunit', countryName: 'Greenland', countryAliases: ['Kalaallit Nunaat', 'Grønland'], countryLat: 72.0, countryLon: -42.0, description: 'Greenland (Danish dependency, standalone gazetteer): 5 kommunit (admin1) + 3 admin2 + populated places ≥5000 pop. Genealogical relevance: Inuit + Danish-Greenlandic family lines.', hierarchy: 'two-tier' },
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

  interface AdmMeta { name: string; aliases: string[]; lat: number; lon: number }
  const adm1s = new Map<string, AdmMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM1') continue;
    if (!r.admin1) continue;
    const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
    adm1s.set(r.admin1, { name: r.name, aliases: altList, lat: r.lat, lon: r.lon });
  }
  console.log(`[${country.cc}]   ${adm1s.size} admin1`);

  interface Adm2Meta extends AdmMeta { adm1Code: string }
  const adm2s = new Map<string, Adm2Meta>();
  if (country.hierarchy === 'two-tier') {
    for (const r of rows) {
      if (r.featureClass !== 'A' || r.featureCode !== 'ADM2') continue;
      if (!r.admin1 || !r.admin2) continue;
      const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
      adm2s.set(`${r.admin1}.${r.admin2}`, { name: r.name, aliases: altList, lat: r.lat, lon: r.lon, adm1Code: r.admin1 });
    }
    console.log(`[${country.cc}]   ${adm2s.size} admin2`);
  }

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

  if (country.hierarchy === 'two-tier') {
    for (const [key, adm2] of adm2s) {
      const parent = adm1Nodes.get(adm2.adm1Code);
      if (!parent) continue;
      const places: GazetteerNode[] = (placesByKey.get(key) ?? []).map(p => ({ name: p.name, type: 'admin3', lat: round6(p.lat), lon: round6(p.lon) }));
      places.sort((a, b) => a.name.localeCompare(b.name));
      parent.children!.push({
        name: adm2.name,
        type: 'admin2',
        aliases: adm2.aliases.length > 0 ? adm2.aliases : undefined,
        lat: round6(adm2.lat),
        lon: round6(adm2.lon),
        children: places,
      });
    }
  } else {
    for (const [adm1Code, places] of placesByKey) {
      const parent = adm1Nodes.get(adm1Code);
      if (!parent) continue;
      for (const p of places) parent.children!.push({ name: p.name, type: 'admin2', lat: round6(p.lat), lon: round6(p.lon) });
      parent.children!.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  for (const n of adm1Nodes.values()) {
    n.children!.sort((a, b) => a.name.localeCompare(b.name));
    if (n.children!.length > 0) {
      const c = avgCoordinates(n.children!.map(c => ({ lat: c.lat, lon: c.lon })));
      n.lat = c.lat; n.lon = c.lon;
    }
  }

  // Continent root for Greenland is North America; for everyone else Europe.
  const continent = country.cc === 'gl' ? 'North America' : 'Europe';
  const continentLat = country.cc === 'gl' ? 50.0 : 50.0;
  const continentLon = country.cc === 'gl' ? -100.0 : 10.0;

  const root: GazetteerNode = {
    name: 'World',
    type: 'world',
    lat: 0, lon: 0,
    children: [{
      name: continent,
      type: 'continent',
      lat: continentLat, lon: continentLon,
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
