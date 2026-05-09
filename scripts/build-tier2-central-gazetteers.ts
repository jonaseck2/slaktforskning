/**
 * Build Tier 2 Central Europe gazetteers from GeoNames in one shot.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Per the European gazetteer roadmap design § 2.1:
 *   admin1 + admin2 + populated places (≥5000 pop). No parishes.
 *
 * Cyrillic / Latin script duality (RS, BA, ME, MK): GeoNames altNames carry
 * both forms; we pick the GeoNames primary (typically Latin) as canonical and
 * keep the other as alias.
 *
 * Usage:
 *   for cc in cz sk hu si hr ba rs me mk al xk lu; do
 *     curl -fsSL -o /tmp/geonames_$cc/$CC.zip https://download.geonames.org/export/dump/$CC.zip
 *     unzip -o /tmp/geonames_$cc/$CC.zip -d /tmp/geonames_$cc/
 *   done
 *   npx tsx scripts/build-tier2-central-gazetteers.ts
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
  { cc: 'cz', outputId: 'cz-okresy', outputName: 'Czechia Kraje + Okresy', countryName: 'Czechia', countryAliases: ['Česko', 'Czech Republic', 'Tschechien'], countryLat: 49.8, countryLon: 15.5, description: 'Czechia: 14 kraje (admin1) + 98 okresy (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'sk', outputId: 'sk-okresy', outputName: 'Slovakia Kraje + Okresy', countryName: 'Slovakia', countryAliases: ['Slovensko', 'Slovak Republic'], countryLat: 48.7, countryLon: 19.7, description: 'Slovakia: 8 kraje (admin1) + 79 okresy (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'hu', outputId: 'hu-jarasok', outputName: 'Hungary Megyék + Járások', countryName: 'Hungary', countryAliases: ['Magyarország', 'Ungarn', 'Hongrie'], countryLat: 47.2, countryLon: 19.5, description: 'Hungary: 20 megyék (admin1, including Budapest) + 197 járások (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'si', outputId: 'si-obcine', outputName: 'Slovenia Občine', countryName: 'Slovenia', countryAliases: ['Slovenija'], countryLat: 46.1, countryLon: 14.8, description: 'Slovenia: 212 občine (admin1 in GeoNames; no statistical-region layer) + 17 admin2 + populated places ≥5000 pop. Statistical regions deferred — Slovenia has no constitutional admin1.', hierarchy: 'two-tier' },
  { cc: 'hr', outputId: 'hr-zupanije', outputName: 'Croatia Županije', countryName: 'Croatia', countryAliases: ['Hrvatska', 'Republika Hrvatska'], countryLat: 45.1, countryLon: 15.2, description: 'Croatia: 21 županije (admin1, including Zagreb) + 572 općine/gradovi (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'ba', outputId: 'ba-opstine', outputName: 'Bosnia and Herzegovina Općine', countryName: 'Bosnia and Herzegovina', countryAliases: ['Bosna i Hercegovina', 'Босна и Херцеговина'], countryLat: 43.9, countryLon: 17.7, description: 'Bosnia and Herzegovina: 3 entities (Federation/Republika Srpska/Brčko District — admin1) + 18 cantons/regions (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'rs', outputId: 'rs-okruzi', outputName: 'Serbia Okruzi + Opštine', countryName: 'Serbia', countryAliases: ['Srbija', 'Република Србија', 'Republika Srbija'], countryLat: 44.0, countryLon: 21.0, description: 'Serbia: 2 statistical regions (admin1 in GeoNames; legal okruzi structure is statistical) + 25 admin2 + populated places ≥5000 pop. Cyrillic + Latin aliases via GeoNames altNames.', hierarchy: 'two-tier' },
  { cc: 'me', outputId: 'me-opstine', outputName: 'Montenegro Opštine', countryName: 'Montenegro', countryAliases: ['Crna Gora', 'Црна Гора'], countryLat: 42.7, countryLon: 19.4, description: 'Montenegro: 25 opštine (admin1; no admin2 layer in GeoNames) + populated places ≥5000 pop.', hierarchy: 'one-tier' },
  { cc: 'mk', outputId: 'mk-opstini', outputName: 'North Macedonia Opštini', countryName: 'North Macedonia', countryAliases: ['Северна Македонија', 'Republika e Maqedonisë së Veriut'], countryLat: 41.6, countryLon: 21.7, description: 'North Macedonia: 71 opštini (admin1 in GeoNames; statistical regions deferred) + 10 admin2 + populated places ≥5000 pop. Cyrillic + Latin via altNames.', hierarchy: 'two-tier' },
  { cc: 'al', outputId: 'al-bashkite', outputName: 'Albania Qarqe + Bashkite', countryName: 'Albania', countryAliases: ['Shqipëria', 'Republika e Shqipërisë'], countryLat: 41.2, countryLon: 20.0, description: 'Albania: 12 qarqe (admin1) + 61 bashkite (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'xk', outputId: 'xk-komunat', outputName: 'Kosovo Komunat', countryName: 'Kosovo', countryAliases: ['Kosova', 'Republika e Kosovës', 'Косово'], countryLat: 42.6, countryLon: 20.9, description: 'Kosovo: 7 districts (admin1) + 38 komunat (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
  { cc: 'lu', outputId: 'lu-communes', outputName: 'Luxembourg Districts + Cantons', countryName: 'Luxembourg', countryAliases: ['Lëtzebuerg', 'Letzebuerg', 'Luxemburg'], countryLat: 49.8, countryLon: 6.1, description: 'Luxembourg: 12 cantons (admin1, ex-districts abolished 2015) + 105 communes (admin2) + populated places ≥5000 pop.', hierarchy: 'two-tier' },
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

  const root: GazetteerNode = {
    name: 'World',
    type: 'world',
    lat: 0, lon: 0,
    children: [{
      name: 'Europe',
      type: 'continent',
      lat: 50.0, lon: 10.0,
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
