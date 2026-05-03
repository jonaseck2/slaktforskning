/**
 * Build Danish parish gazetteer from the DAWA API.
 *
 * Produces ONE gazetteer:
 *   dk-sogne-dawa — Danish parishes (sogne) from official government data
 *
 * This is a separate gazetteer from the Wikidata-based dk-sogne. DAWA
 * provides higher coordinate precision and is the official Danish
 * government address data source.
 *
 * Usage:
 *   npx tsx scripts/build-dk-parishes-dawa.ts
 *
 * Output:
 *   src/api/place-gazetteers/data/dk-sogne-dawa.json
 *
 * ──────────────────────────────────────────────────────────────────────
 * DATA SOURCE
 * ──────────────────────────────────────────────────────────────────────
 * DAWA (Danmarks Adressers Web API): https://api.dataforsyningen.dk
 * License: Danish Open Government Data
 *
 * ──────────────────────────────────────────────────────────────────────
 * DESIGN DECISIONS
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. HIERARCHY: sogn → kommune → region → Danmark
 *    DAWA's /sogne endpoint returns only parish code, name, and center.
 *    To build the hierarchy, we reverse-geocode each parish center via
 *    /kommuner/reverse to get its kommune + region.
 *
 * 2. COORDINATES
 *    Each parish has a `visueltcenter` [lon, lat] — the visual center
 *    point computed by the Danish authorities. Kommune and region
 *    centroids are computed as the mean of their children.
 *
 * 3. ALIASES
 *    - Parish: strip " Sogn" suffix
 *    - Kommune: strip " Kommune" suffix
 *    - Region: strip "Region " prefix
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { round6, avgCoordinates } from '../src/gazetteer-build/geo';

// ── Types ────────────────────────────────────────────────────────────

interface DawaSognRaw {
  kode: string;
  navn: string;
  visueltcenter: [number, number]; // [lon, lat]
}

interface DawaKommuneReverse {
  kode: string;
  navn: string;
  region: { kode: string; navn: string };
}

interface EnrichedSogn {
  kode: string;
  navn: string;
  lat: number;
  lon: number;
  kommuneKode: string;
  kommuneNavn: string;
  regionKode: string;
  regionNavn: string;
}

// ── Constants ────────────────────────────────────────────────────────

const SOGNE_URL = 'https://api.dataforsyningen.dk/sogne';
const KOMMUNE_REVERSE_URL = 'https://api.dataforsyningen.dk/kommuner/reverse';
const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');

/** Max concurrent reverse-geocode requests */
const CONCURRENCY = 30;

/** Run async tasks with bounded concurrency */
async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Fetch ────────────────────────────────────────────────────────────

async function fetchSogne(): Promise<DawaSognRaw[]> {
  console.log(`Fetching ${SOGNE_URL} ...`);
  const response = await fetch(SOGNE_URL, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DAWA sogne fetch failed: ${response.status} ${response.statusText}\n${body}`);
  }

  return response.json() as Promise<DawaSognRaw[]>;
}

async function reverseKommune(lon: number, lat: number): Promise<DawaKommuneReverse | null> {
  const url = `${KOMMUNE_REVERSE_URL}?x=${lon}&y=${lat}`;
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) return null;

  const data = await response.json() as DawaKommuneReverse;
  return data;
}

async function enrichSogne(sogne: DawaSognRaw[]): Promise<EnrichedSogn[]> {
  console.log(`Reverse-geocoding ${sogne.length} parishes to find kommune/region (concurrency: ${CONCURRENCY})...`);
  let done = 0;
  let skipped = 0;

  const results = await mapConcurrent(sogne, CONCURRENCY, async (sogn) => {
    const [lon, lat] = sogn.visueltcenter;
    const kommune = await reverseKommune(lon, lat);
    done++;
    if (done % 200 === 0 || done === sogne.length) {
      process.stdout.write(`  ${done}/${sogne.length}\r`);
    }

    if (!kommune || !kommune.region) {
      skipped++;
      return null;
    }

    return {
      kode: sogn.kode,
      navn: sogn.navn,
      lat: round6(lat),
      lon: round6(lon),
      kommuneKode: kommune.kode,
      kommuneNavn: kommune.navn,
      regionKode: kommune.region.kode,
      regionNavn: kommune.region.navn,
    } as EnrichedSogn;
  });

  console.log(''); // newline after progress
  if (skipped > 0) console.log(`  Skipped ${skipped} parishes (reverse geocode failed)`);

  return results.filter((r): r is EnrichedSogn => r !== null);
}

// ── Tree building ────────────────────────────────────────────────────

function buildTree(sogne: EnrichedSogn[]): GazetteerNode {
  // region code → { name, kommuner: Map<code, { name, parishes }> }
  const regions = new Map<string, {
    name: string;
    kommuner: Map<string, {
      name: string;
      parishes: GazetteerNode[];
    }>;
  }>();

  for (const sogn of sogne) {
    if (!regions.has(sogn.regionKode)) {
      regions.set(sogn.regionKode, { name: sogn.regionNavn, kommuner: new Map() });
    }
    const region = regions.get(sogn.regionKode)!;

    if (!region.kommuner.has(sogn.kommuneKode)) {
      region.kommuner.set(sogn.kommuneKode, { name: sogn.kommuneNavn, parishes: [] });
    }
    const kommune = region.kommuner.get(sogn.kommuneKode)!;

    // Parish: canonical Danish form drops " Sogn"; original kept as alias.
    const canonicalParish = sogn.navn.replace(/\s+Sogn$/i, '').trim() || sogn.navn;
    const parishAliases: string[] = canonicalParish !== sogn.navn ? [sogn.navn] : [];

    const parishNode: GazetteerNode = {
      name: canonicalParish,
      type: 'admin3',
      lat: sogn.lat,
      lon: sogn.lon,
    };
    if (parishAliases.length > 0) parishNode.aliases = parishAliases;

    kommune.parishes.push(parishNode);
  }

  // Build sorted tree
  const regionNodes: GazetteerNode[] = [];

  for (const [, regionData] of [...regions.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'da'))) {
    const kommuneNodes: GazetteerNode[] = [];

    for (const [, kommuneData] of [...regionData.kommuner.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'da'))) {
      kommuneData.parishes.sort((a, b) => a.name.localeCompare(b.name, 'da'));

      const kommuneCoords = avgCoordinates(kommuneData.parishes);

      // Kommune: canonical drops " Kommune", original as alias.
      const canonicalKommune = kommuneData.name.replace(/\s+Kommune$/i, '').trim() || kommuneData.name;
      const kommuneNode: GazetteerNode = {
        name: canonicalKommune,
        type: 'admin2',
        lat: kommuneCoords.lat,
        lon: kommuneCoords.lon,
        children: kommuneData.parishes,
      };
      if (canonicalKommune !== kommuneData.name) kommuneNode.aliases = [kommuneData.name];

      kommuneNodes.push(kommuneNode);
    }

    const regionCoords = avgCoordinates(kommuneNodes);

    // Region: keep canonical Danish form. Bare form goes in aliases.
    const regionNode: GazetteerNode = {
      name: regionData.name,
      type: 'admin1',
      lat: regionCoords.lat,
      lon: regionCoords.lon,
      children: kommuneNodes,
    };

    const bareRegion = regionData.name.replace(/^Region\s+/i, '').trim();
    if (bareRegion && bareRegion !== regionData.name) {
      regionNode.aliases = [bareRegion];
    }

    regionNodes.push(regionNode);
  }

  // Wrap in World > Europe > Denmark.
  const denmark: GazetteerNode = {
    name: 'Denmark',
    type: 'country',
    aliases: ['Danmark'],
    lat: 56.0,
    lon: 10.0,
    children: regionNodes,
  };
  const europe: GazetteerNode = {
    name: 'Europe',
    type: 'continent',
    lat: 54,
    lon: 15,
    children: [denmark],
  };
  return {
    name: 'World',
    type: 'world',
    lat: 0,
    lon: 0,
    children: [europe],
  };
}

// ── Stats ────────────────────────────────────────────────────────────

function printStats(root: GazetteerNode): void {
  // root is World; descend to Denmark
  const denmark = root.children?.[0]?.children?.[0];
  if (!denmark) return;

  let regionCount = 0;
  let kommuneCount = 0;
  let parishCount = 0;

  for (const region of denmark.children ?? []) {
    regionCount++;
    for (const kommune of region.children ?? []) {
      kommuneCount++;
      parishCount += (kommune.children ?? []).length;
    }
  }

  console.log(`    Regions (admin1):  ${regionCount}`);
  console.log(`    Kommuner (admin2): ${kommuneCount}`);
  console.log(`    Parishes (admin3): ${parishCount}`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('Building Danish parish gazetteer from DAWA API...\n');

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const rawSogne = await fetchSogne();
  console.log(`Got ${rawSogne.length} parishes from /sogne`);

  const enriched = await enrichSogne(rawSogne);
  console.log(`Enriched ${enriched.length} parishes with kommune/region`);

  console.log('Building hierarchy...');
  const root = buildTree(enriched);

  const gazetteer = {
    id: 'dk-sogne-dawa',
    name: 'Danish Parishes — DAWA (Sogne)',
    locale: 'da',
    description: 'Danish parishes (sogne) from the official Danish government DAWA API.',
    source: {
      name: 'DAWA (Danmarks Adressers Web API)',
      url: 'https://api.dataforsyningen.dk/sogne',
      license: 'Danish Open Government Data',
      fetched: new Date().toISOString().slice(0, 10),
    },
    root,
  };

  const outputPath = path.join(DATA_DIR, 'dk-sogne-dawa.json');
  const json = JSON.stringify(gazetteer, null, 2);
  fs.writeFileSync(outputPath, json + '\n', 'utf-8');

  const sizeMb = (Buffer.byteLength(json) / 1_048_576).toFixed(2);
  console.log(`\nWritten to dk-sogne-dawa.json (${sizeMb} MB)`);
  printStats(root);

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
