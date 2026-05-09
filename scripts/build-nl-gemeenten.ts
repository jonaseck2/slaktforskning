/**
 * Build nl-gemeenten gazetteer from GeoNames NL.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Hierarchy: World > Europe > Netherlands → province (admin1, 12)
 *            → gemeente (admin2, ~342) → populated place (admin3, ≥1000 pop).
 *
 * Historical (former) gemeenten via Wikidata Q2039348 + P582 (end-time)
 * deferred to follow-up `nl-historical-gemeenten` plan.
 *
 * Usage:
 *   curl -fsSL -o /tmp/geonames_nl/NL.zip https://download.geonames.org/export/dump/NL.zip
 *   unzip -o /tmp/geonames_nl/NL.zip -d /tmp/geonames_nl/
 *   npx tsx scripts/build-nl-gemeenten.ts
 */
import * as fs from 'fs';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);
const GEONAMES_FILE = '/tmp/geonames_nl/NL.txt';
const PLACE_MIN_POP = 1000;

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

function stripPrefix(name: string, prefix: string): { name: string; alias: string | null } {
  const re = new RegExp(`^${prefix}\\s+`, 'i');
  if (re.test(name)) return { name: name.replace(re, '').trim(), alias: name.trim() };
  return { name: name.trim(), alias: null };
}

function main(): void {
  if (!fs.existsSync(GEONAMES_FILE)) {
    console.error(`Missing ${GEONAMES_FILE}.`);
    process.exit(1);
  }
  console.log('[nl] parsing GeoNames NL…');
  const rows = parseRows(GEONAMES_FILE);
  console.log(`[nl]   ${rows.length} rows`);

  // ADM1 = province (with "Provincie X" naming).
  interface ProvMeta { name: string; aliases: string[]; lat: number; lon: number }
  const provs = new Map<string, ProvMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM1') continue;
    if (!r.admin1) continue;
    const cleaned = stripPrefix(r.name, 'Provincie');
    const aliases = cleaned.alias ? [cleaned.alias] : [];
    provs.set(r.admin1, { name: cleaned.name, aliases, lat: r.lat, lon: r.lon });
  }
  console.log(`[nl]   ${provs.size} provinces`);

  // ADM2 = gemeente (with "Gemeente X" naming).
  interface GemMeta { name: string; aliases: string[]; lat: number; lon: number; provinceCode: string }
  const gems = new Map<string, GemMeta>();
  for (const r of rows) {
    if (r.featureClass !== 'A' || r.featureCode !== 'ADM2') continue;
    if (!r.admin1 || !r.admin2) continue;
    const cleaned = stripPrefix(r.name, 'Gemeente');
    const aliases = cleaned.alias ? [cleaned.alias] : [];
    const altList = r.altNames.split(',').map(s => s.trim()).filter(Boolean);
    for (const a of altList) {
      const ac = stripPrefix(a, 'Gemeente');
      if (ac.name && ac.name !== cleaned.name && !aliases.includes(ac.name)) aliases.push(ac.name);
    }
    gems.set(`${r.admin1}.${r.admin2}`, {
      name: cleaned.name,
      aliases,
      lat: r.lat,
      lon: r.lon,
      provinceCode: r.admin1,
    });
  }
  console.log(`[nl]   ${gems.size} gemeenten`);

  // Populated places by gemeente.
  const placesByGem = new Map<string, Row[]>();
  let included = 0;
  for (const r of rows) {
    if (r.featureClass !== 'P') continue;
    if (r.population < PLACE_MIN_POP) continue;
    if (!r.admin1 || !r.admin2) continue;
    const key = `${r.admin1}.${r.admin2}`;
    if (!placesByGem.has(key)) placesByGem.set(key, []);
    placesByGem.get(key)!.push(r);
    included++;
  }
  console.log(`[nl]   ${included} populated places (≥${PLACE_MIN_POP} pop)`);

  // Build provinces → gemeenten → places.
  const provNodes = new Map<string, GazetteerNode>();
  for (const [code, p] of provs) {
    provNodes.set(code, {
      name: p.name,
      type: 'admin1',
      aliases: p.aliases.length > 0 ? p.aliases : undefined,
      lat: round6(p.lat),
      lon: round6(p.lon),
      children: [],
    });
  }

  for (const [key, gem] of gems) {
    const prov = provNodes.get(gem.provinceCode);
    if (!prov) {
      console.warn(`[nl] orphan gemeente ${gem.name} (province=${gem.provinceCode}); skipping.`);
      continue;
    }
    const placeNodes: GazetteerNode[] = [];
    for (const p of placesByGem.get(key) ?? []) {
      placeNodes.push({
        name: p.name,
        type: 'admin3',
        lat: round6(p.lat),
        lon: round6(p.lon),
      });
    }
    placeNodes.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    prov.children!.push({
      name: gem.name,
      type: 'admin2',
      aliases: gem.aliases.length > 0 ? gem.aliases : undefined,
      lat: round6(gem.lat),
      lon: round6(gem.lon),
      children: placeNodes,
    });
  }

  for (const p of provNodes.values()) {
    p.children!.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    const center = avgCoordinates(p.children!.map(c => ({ lat: c.lat, lon: c.lon })));
    p.lat = center.lat;
    p.lon = center.lon;
  }

  const provArr = Array.from(provNodes.values()).sort((a, b) => a.name.localeCompare(b.name, 'nl'));

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
        name: 'Netherlands',
        type: 'country',
        aliases: ['Nederland', 'Holland', 'Niederlande', 'Pays-Bas', 'Países Bajos'],
        lat: 52.1,
        lon: 5.3,
        children: provArr,
      }],
    }],
  };

  const result = writeGazetteer({
    id: 'nl-gemeenten',
    name: 'Netherlands Provinces, Gemeenten, and Populated Places',
    locale: 'nl',
    description: 'Netherlands: 12 provinces (admin1) → 342 gemeenten (admin2) → populated places ≥1000 pop. Historical gemeenten + Catholic parishes deferred to follow-up gazetteers.',
    kind: 'point',
    source: {
      name: 'GeoNames',
      url: 'https://download.geonames.org/export/dump/NL.zip',
      license: 'CC BY 4.0',
      attribution: `Source: GeoNames.org (CC BY 4.0), fetched ${FETCHED_DATE}`,
      fetched: FETCHED_DATE,
      notes: `Filter: P (populated place) ≥${PLACE_MIN_POP} pop + A/ADM1/ADM2. "Provincie X" / "Gemeente X" prefixes stripped from canonical name; original kept as alias.`,
    },
    root,
  }, 'nl-gemeenten.json');

  console.log(`[nl] Wrote ${result.path} (${result.sizeKB} KB)`);
}

main();
