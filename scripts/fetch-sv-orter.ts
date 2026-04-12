/**
 * Fetch Swedish populated places (tätorter + småorter) from Wikidata SPARQL
 * and generate a gazetteer JSON file.
 *
 * Usage: npx tsx scripts/fetch-sv-orter.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'Slaktforskning-Gazetteer-Fetcher/1.0 (genealogy app)';

interface RawPlace {
  name: string;
  lat: number;
  lon: number;
  municipality: string;
  county: string;
  type: 'tätort' | 'småort';
}

async function sparqlQuery(query: string): Promise<any[]> {
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/sparql-results+json',
    },
  });
  if (!res.ok) {
    throw new Error(`SPARQL query failed: ${res.status} ${res.statusText}\n${await res.text()}`);
  }
  const data = await res.json();
  return data.results.bindings;
}

async function fetchTatorter(): Promise<RawPlace[]> {
  console.log('Fetching tätorter...');
  const query = `
SELECT ?itemLabel ?lat ?lon ?munLabel ?countyLabel WHERE {
  ?item wdt:P31 wd:Q12813115 .
  ?item wdt:P625 ?coords .
  ?item wdt:P131 ?mun .
  ?mun wdt:P31 wd:Q127448 .
  ?mun wdt:P131 ?county .
  ?county wdt:P31 wd:Q200547 .
  BIND(geof:latitude(?coords) AS ?lat)
  BIND(geof:longitude(?coords) AS ?lon)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "sv,en" . }
}
`;
  const rows = await sparqlQuery(query);
  console.log(`  Got ${rows.length} tätorter`);
  return rows.map((r: any) => ({
    name: r.itemLabel.value,
    lat: parseFloat(r.lat.value),
    lon: parseFloat(r.lon.value),
    municipality: r.munLabel.value,
    county: r.countyLabel.value,
    type: 'tätort' as const,
  }));
}

async function fetchSmåorter(): Promise<RawPlace[]> {
  console.log('Fetching småorter...');
  // Småorter can be numerous — fetch in batches by county
  const countyQuery = `
SELECT ?county ?countyLabel WHERE {
  ?county wdt:P31 wd:Q200547 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "sv,en" . }
} ORDER BY ?countyLabel
`;
  const counties = await sparqlQuery(countyQuery);
  console.log(`  Found ${counties.length} counties`);

  const allPlaces: RawPlace[] = [];

  for (const c of counties) {
    const countyUri = c.county.value;
    const countyName = c.countyLabel.value;

    const query = `
SELECT ?itemLabel ?lat ?lon ?munLabel WHERE {
  ?item wdt:P31 wd:Q15630849 .
  ?item wdt:P625 ?coords .
  ?item wdt:P131 ?mun .
  ?mun wdt:P31 wd:Q127448 .
  ?mun wdt:P131 <${countyUri}> .
  BIND(geof:latitude(?coords) AS ?lat)
  BIND(geof:longitude(?coords) AS ?lon)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "sv,en" . }
}
`;
    const rows = await sparqlQuery(query);
    console.log(`  ${countyName}: ${rows.length} småorter`);

    for (const r of rows) {
      allPlaces.push({
        name: r.itemLabel.value,
        lat: parseFloat(r.lat.value),
        lon: parseFloat(r.lon.value),
        municipality: r.munLabel.value,
        county: countyName,
        type: 'småort' as const,
      });
    }

    // Be polite to Wikidata
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`  Total småorter: ${allPlaces.length}`);
  return allPlaces;
}

interface GazetteerNode {
  name: string;
  type: string;
  aliases?: string[];
  lat: number;
  lon: number;
  children?: GazetteerNode[];
}

function buildGazetteer(places: RawPlace[]) {
  // Group by county → municipality → places
  const counties = new Map<string, Map<string, RawPlace[]>>();

  for (const p of places) {
    if (!counties.has(p.county)) counties.set(p.county, new Map());
    const muns = counties.get(p.county)!;
    if (!muns.has(p.municipality)) muns.set(p.municipality, []);
    muns.get(p.municipality)!.push(p);
  }

  // Deduplicate: if same name appears in same municipality, keep the one with more specific coords
  // (prefer tätort over småort if both exist)
  function dedup(arr: RawPlace[]): RawPlace[] {
    const byName = new Map<string, RawPlace>();
    for (const p of arr) {
      const key = p.name.toLowerCase();
      const existing = byName.get(key);
      if (!existing || (existing.type === 'småort' && p.type === 'tätort')) {
        byName.set(key, p);
      }
    }
    return Array.from(byName.values());
  }

  const countyNodes: GazetteerNode[] = [];

  for (const [countyName, muns] of [...counties.entries()].sort((a, b) => a[0].localeCompare(b[0], 'sv'))) {
    const munNodes: GazetteerNode[] = [];

    for (const [munName, munPlaces] of [...muns.entries()].sort((a, b) => a[0].localeCompare(b[0], 'sv'))) {
      const uniquePlaces = dedup(munPlaces);
      const placeNodes: GazetteerNode[] = uniquePlaces
        .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
        .map(p => ({
          name: p.name,
          type: p.type === 'tätort' ? 'locality' : 'small_locality',
          lat: Math.round(p.lat * 1000000) / 1000000,
          lon: Math.round(p.lon * 1000000) / 1000000,
        }));

      if (placeNodes.length === 0) continue;

      // Municipality center = average of its places
      const avgLat = placeNodes.reduce((s, p) => s + p.lat, 0) / placeNodes.length;
      const avgLon = placeNodes.reduce((s, p) => s + p.lon, 0) / placeNodes.length;

      munNodes.push({
        name: munName,
        type: 'municipality',
        lat: Math.round(avgLat * 1000000) / 1000000,
        lon: Math.round(avgLon * 1000000) / 1000000,
        children: placeNodes,
      });
    }

    if (munNodes.length === 0) continue;

    const avgLat = munNodes.reduce((s, n) => s + n.lat, 0) / munNodes.length;
    const avgLon = munNodes.reduce((s, n) => s + n.lon, 0) / munNodes.length;

    countyNodes.push({
      name: countyName,
      type: 'county',
      lat: Math.round(avgLat * 1000000) / 1000000,
      lon: Math.round(avgLon * 1000000) / 1000000,
      children: munNodes,
    });
  }

  return {
    id: 'sv-orter',
    name: 'Swedish Populated Places (Orter)',
    locale: 'sv',
    description: 'Tätorter (urban localities, ~2000) and småorter (small localities, ~10000) — named populated places in Sweden. More granular than parishes.',
    source: {
      name: 'Wikidata',
      url: 'https://www.wikidata.org/wiki/Q12813115',
      license: 'CC0 1.0',
      fetched: new Date().toISOString().slice(0, 10),
    },
    root: {
      name: 'Sverige',
      type: 'country',
      aliases: ['Sweden'],
      lat: 62,
      lon: 15,
      children: countyNodes,
    },
  };
}

async function main() {
  const tatorter = await fetchTatorter();
  const smaorter = await fetchSmåorter();

  const allPlaces = [...tatorter, ...smaorter];
  console.log(`\nTotal places: ${allPlaces.length}`);

  const gazetteer = buildGazetteer(allPlaces);

  // Count places
  let placeCount = 0;
  let munCount = 0;
  for (const county of gazetteer.root.children!) {
    for (const mun of county.children!) {
      munCount++;
      placeCount += mun.children!.length;
    }
  }
  console.log(`Gazetteer: ${gazetteer.root.children!.length} counties, ${munCount} municipalities, ${placeCount} places`);

  const outPath = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data', 'sv-orter.json');
  fs.writeFileSync(outPath, JSON.stringify(gazetteer, null, 2) + '\n');
  console.log(`Written to ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
