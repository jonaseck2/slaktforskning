/**
 * Build gb-civil-divisions gazetteer from ONS Open Geography Portal.
 *
 * Source: ONS (Office for National Statistics) — Open Geography Portal
 *   URL: https://geoportal.statistics.gov.uk/
 *   License: Open Government Licence v3.0 (CC BY 4.0 compatible)
 *   Attribution: "Contains OS data © Crown copyright and database right <year>;
 *                 Source: Office for National Statistics licensed under the Open Government Licence v3.0"
 *
 * Hierarchy: World > Europe > United Kingdom (country) → home nation (admin1, 4)
 *            → Local Authority District (admin2, 361 BUC).
 *
 * BUC = Buffered Ultra Generalised — pre-simplified by ONS for web use; we
 * use it directly without further simplification.
 *
 * Civil parishes / communities / ecclesiastical parishes are NOT included in
 * this first cut. They live in:
 *   - England (~10,449 civil parishes), Wales (~860 communities),
 *     Scotland (historical kirk session parishes pre-1975) — separate
 *     follow-up gazetteer (gb-civil-parishes) when scoped.
 *   - C of E ecclesiastical parishes — separate gb-cofe-parishes plan.
 *
 * Usage:
 *   npx tsx scripts/build-gb-civil-divisions.ts
 *
 * Two REST queries (countries layer + LAD layer); no large download.
 */
import * as https from 'https';
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4, round6 } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);

const COUNTRIES_URL =
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Countries_December_2024_Boundaries_UK_BUC/FeatureServer/0/query'
  + '?where=1%3D1&outFields=CTRY24CD,CTRY24NM&returnGeometry=true&outSR=4326&f=geojson';

const LAD_URL =
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_December_2024_Boundaries_UK_BUC/FeatureServer/0/query'
  + '?where=1%3D1&outFields=LAD24CD,LAD24NM&returnGeometry=true&outSR=4326&resultRecordCount=2000&f=geojson';

// Map LAD code prefix to home-nation code (matches CTRY24CD prefix on the country layer).
const COUNTRY_BY_PREFIX: Record<string, string> = {
  E: 'E92000001', // England
  W: 'W92000004', // Wales
  S: 'S92000003', // Scotland
  N: 'N92000002', // Northern Ireland
};

interface ArcGISFeature {
  type: 'Feature';
  properties: Record<string, string | number>;
  geometry: GazetteerGeometry;
}

interface ArcGISCollection {
  type: 'FeatureCollection';
  features: ArcGISFeature[];
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 60000 }, res => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T); }
        catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function roundGeom(geom: GazetteerGeometry): GazetteerGeometry {
  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geom.coordinates.map(ring => ring.map(([x, y]) => [round4(x), round4(y)])),
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geom.coordinates.map(poly => poly.map(ring => ring.map(([x, y]) => [round4(x), round4(y)]))),
  };
}

async function main(): Promise<void> {
  console.log('[gb-civil] fetching ONS countries layer…');
  const countriesFC = await fetchJson<ArcGISCollection>(COUNTRIES_URL);
  console.log(`[gb-civil]   ${countriesFC.features.length} home nations`);

  console.log('[gb-civil] fetching ONS Local Authority Districts layer…');
  const ladFC = await fetchJson<ArcGISCollection>(LAD_URL);
  console.log(`[gb-civil]   ${ladFC.features.length} LADs`);

  // Build admin1 nodes keyed by CTRY24CD.
  const countryNodes = new Map<string, GazetteerNode>();
  for (const f of countriesFC.features) {
    const code = f.properties.CTRY24CD as string;
    const name = f.properties.CTRY24NM as string;
    const geom = roundGeom(f.geometry);
    const [lat, lon] = computeCentroid(geom);
    countryNodes.set(code, {
      name,
      type: 'admin1',
      lat: round6(lat),
      lon: round6(lon),
      geometry: geom,
      children: [],
    });
  }

  // Attach LADs as admin2 under their home nation.
  let orphanCount = 0;
  for (const f of ladFC.features) {
    const code = f.properties.LAD24CD as string;
    const name = f.properties.LAD24NM as string;
    const prefix = code.slice(0, 1);
    const countryCode = COUNTRY_BY_PREFIX[prefix];
    const parent = countryNodes.get(countryCode);
    if (!parent) {
      console.warn(`[gb-civil] orphan LAD ${name} (${code}); skipping.`);
      orphanCount++;
      continue;
    }
    const geom = roundGeom(f.geometry);
    const [lat, lon] = computeCentroid(geom);
    parent.children!.push({
      name,
      type: 'admin2',
      lat: round6(lat),
      lon: round6(lon),
      geometry: geom,
    });
  }

  // Sort children alphabetically (en-GB collation, diacritic-folded).
  for (const node of countryNodes.values()) {
    node.children!.sort((a, b) =>
      a.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
        .localeCompare(b.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()),
    );
  }

  // Sort home nations in genealogical-conventional order.
  const homeNationOrder = ['England', 'Scotland', 'Wales', 'Northern Ireland'];
  const sortedHomeNations = homeNationOrder
    .map(name => Array.from(countryNodes.values()).find(n => n.name === name))
    .filter((n): n is GazetteerNode => Boolean(n));

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
        name: 'United Kingdom',
        type: 'country',
        aliases: ['UK', 'Great Britain', 'Britain', 'Storbritannien'],
        lat: 54.0,
        lon: -2.5,
        children: sortedHomeNations,
      }],
    }],
  };

  const result = writeGazetteer({
    id: 'gb-civil-divisions',
    name: 'UK Home Nations & Local Authority Districts',
    locale: 'en-GB',
    description: 'United Kingdom civil divisions: 4 home nations (admin1) + 361 Local Authority Districts (admin2). Civil/ecclesiastical parishes deferred to follow-up gazetteers.',
    kind: 'boundary',
    source: {
      name: 'ONS Open Geography Portal',
      url: 'https://geoportal.statistics.gov.uk/',
      license: 'Open Government Licence v3.0',
      attribution: `Contains OS data © Crown copyright and database right ${FETCHED_DATE.slice(0, 4)}; Source: Office for National Statistics licensed under the Open Government Licence v3.0`,
      fetched: FETCHED_DATE,
      notes: 'Layers: Countries_December_2024_Boundaries_UK_BUC + Local_Authority_Districts_December_2024_Boundaries_UK_BUC. BUC = Buffered Ultra Generalised (pre-simplified by ONS).',
    },
    root,
  }, 'gb-civil-divisions.json');

  console.log(`[gb-civil] Wrote ${result.path} (${result.sizeKB} KB)`);
  console.log(`[gb-civil]     ${sortedHomeNations.length} home nations, ${ladFC.features.length - orphanCount} LADs`);
}

main().catch(err => { console.error(err); process.exit(1); });
