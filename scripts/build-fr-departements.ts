/**
 * Build fr-departements gazetteer from GeoNames FR.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Hierarchy: World > Europe > France → région (admin1, 13 metropolitan)
 *            → département (admin2, 96 metropolitan) → populated place
 *            (admin3, ≥10000 pop).
 *
 * Overseas departments (Mayotte, Guadeloupe, Martinique, Guyane, Réunion)
 * out of scope per design — they're not in geographical Europe and live in
 * world-admin1 already.
 *
 * Communes (~35k metropolitan) deferred to follow-up — would push the budget.
 * Pre-1789 paroisses out of scope; modern commune is the legal successor.
 *
 * Usage:
 *   curl -fsSL -o /tmp/geonames_fr/FR.zip https://download.geonames.org/export/dump/FR.zip
 *   unzip -o /tmp/geonames_fr/FR.zip -d /tmp/geonames_fr/
 *   npx tsx scripts/build-fr-departements.ts
 */
import * as fs from 'fs';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);
const GEONAMES_FILE = '/tmp/geonames_fr/FR.txt';
const PLACE_MIN_POP = 10000;

// Overseas-region codes to exclude (out of scope: not in geographical Europe).
const OVERSEAS_REGIONS = new Set(['01', '02', '03', '04', '06']);

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

function main(): void {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`Missing ${GEONAMES_FILE}.`);
    process.exit(1);
  }
  console.log('[fr] parsing GeoNames FR…');
  const rows = parseRows(GEONAMES_FILE);
  console.log(`[fr]   ${rows.length} rows`);

  // ADM1 regions
  interface RegMeta { name: string; aliases: string[]; lat: number; lon: number }
  const regs = new Map<string, RegMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM1') continue;
    if (!r.admin1 || OVERSEAS_REGIONS.has(r.admin1)) continue;
    const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean);
    regs.set(r.admin1, { name: r.name, aliases: altList.slice(0, 3), lat: r.lat, lon: r.lon });
  }
  console.log(`[fr]   ${regs.size} régions (metropolitan)`);

  // ADM2 départements
  interface DepMeta { name: string; aliases: string[]; lat: number; lon: number; regionCode: string }
  const deps = new Map<string, DepMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM2') continue;
    if (!r.admin1 || !r.admin2) continue;
    if (OVERSEAS_REGIONS.has(r.admin1)) continue;
    const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean);
    deps.set(`${r.admin1}.${r.admin2}`, {
      name: r.name,
      aliases: altList.slice(0, 3),
      lat: r.lat,
      lon: r.lon,
      regionCode: r.admin1,
    });
  }
  console.log(`[fr]   ${deps.size} départements`);

  // Populated places ≥10k pop by département.
  const placesByDep = new Map<string, Row[]>();
  let included = 0;
  for (const r of rows) {
    if (r.featureClass !== 'P') continue;
    if (r.population < PLACE_MIN_POP) continue;
    if (!r.admin1 || !r.admin2) continue;
    if (OVERSEAS_REGIONS.has(r.admin1)) continue;
    const key = `${r.admin1}.${r.admin2}`;
    if (!placesByDep.has(key)) placesByDep.set(key, []);
    placesByDep.get(key)!.push(r);
    included++;
  }
  console.log(`[fr]   ${included} populated places (≥${PLACE_MIN_POP} pop)`);

  // Build régions → départements → places.
  const regNodes = new Map<string, GazetteerNode>();
  for (const [code, meta] of regs) {
    regNodes.set(code, {
      name: meta.name,
      type: 'admin1',
      aliases: meta.aliases.length > 0 ? meta.aliases : undefined,
      lat: round6(meta.lat),
      lon: round6(meta.lon),
      children: [],
    });
  }

  for (const [key, dep] of deps) {
    const reg = regNodes.get(dep.regionCode);
    if (!reg) continue;
    const placeNodes: GazetteerNode[] = [];
    for (const p of placesByDep.get(key) ?? []) {
      placeNodes.push({
        name: p.name,
        type: 'admin3',
        lat: round6(p.lat),
        lon: round6(p.lon),
      });
    }
    placeNodes.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    reg.children!.push({
      name: dep.name,
      type: 'admin2',
      aliases: dep.aliases.length > 0 ? dep.aliases : undefined,
      lat: round6(dep.lat),
      lon: round6(dep.lon),
      children: placeNodes,
    });
  }

  for (const r of regNodes.values()) {
    r.children!.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
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
        name: 'France',
        type: 'country',
        aliases: ['République française', 'Frankreich', 'Frankrike', 'Francia'],
        lat: 46.5,
        lon: 2.5,
        children: Array.from(regNodes.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      }],
    }],
  };

  const result = writeGazetteer({
    id: 'fr-departements',
    name: 'France Régions, Départements, and Populated Places',
    locale: 'fr',
    description: 'Metropolitan France: 13 régions (admin1) → 96 départements (admin2) → populated places ≥10k pop. Overseas departments excluded (not in geographical Europe). ~35k communes deferred to follow-up.',
    kind: 'point',
    source: {
      name: 'GeoNames',
      url: 'https://download.geonames.org/export/dump/FR.zip',
      license: 'CC BY 4.0',
      attribution: `Source: GeoNames.org (CC BY 4.0), fetched ${FETCHED_DATE}`,
      fetched: FETCHED_DATE,
      notes: `Filter: P (populated place) ≥${PLACE_MIN_POP} pop + A/ADM1/ADM2; overseas regions ${[...OVERSEAS_REGIONS].join(', ')} excluded.`,
    },
    root,
  }, 'fr-departements.json');

  console.log(`[fr] Wrote ${result.path} (${result.sizeKB} KB)`);
}

main();
