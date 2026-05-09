/**
 * Build de-gemeinden-boundaries gazetteer from BKG vg250.
 *
 * Source: BKG (Bundesamt für Kartographie und Geodäsie) — Verwaltungsgebiete 1:250 000
 *   URL: https://daten.gdz.bkg.bund.de/produkte/vg/vg250_ebenen_0101/aktuell/vg250_01-01.utm32s.gpkg.ebenen.zip
 *   File: DE_VG250.gpkg (inside vg250_ebenen_0101/)
 *   License: Datenlizenz Deutschland — Namensnennung 2.0 (CC BY 4.0 compatible)
 *   Attribution: "© GeoBasis-DE / BKG <fetched-year>"
 *
 * Hierarchy: World > Europe > Germany (country) → Bundesland (admin1, 16) → Kreis (admin2, 400).
 * Geometry: Polygon / MultiPolygon, WGS84, simplified to 200m via ogr2ogr's
 * Douglas-Peucker. The boundary's UX purpose is uncertainty hint, not pin
 * precision — aggressive simplification is correct (per european-gazetteers
 * design § Q4).
 *
 * Filter: GF=4 (Geofaktor 4 = land area only). Excludes coastal sea, inland
 * water, and other non-administrative polygons that share the layer.
 *
 * Usage:
 *   curl -fsSL -o /tmp/bkg_vg250/vg250.zip <URL>
 *   unzip -o /tmp/bkg_vg250/vg250.zip -d /tmp/bkg_vg250/
 *   npx tsx scripts/build-de-boundaries.ts
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode, GazetteerGeometry } from '../src/api/place-gazetteers/types';
import { computeCentroid, round4, round6 } from '../src/gazetteer-build/geo';
import { writeGazetteer } from '../src/gazetteer-build/io';

const FETCHED_DATE = new Date().toISOString().slice(0, 10);
const SOURCE_GPKG = '/tmp/bkg_vg250/vg250_01-01.utm32s.gpkg.ebenen/vg250_ebenen_0101/DE_VG250.gpkg';
const TMP_DIR = '/tmp/bkg_vg250/converted';
const SIMPLIFY_M = 500;

interface FeatureProps {
  GEN: string;
  ARS: string;
  SN_L: string;
  GF: number;
  [k: string]: unknown;
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: FeatureProps;
  geometry: GazetteerGeometry;
}

interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

function reprojectAndSimplify(layer: string): GeoJSONCollection {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const out = path.join(TMP_DIR, `${layer}.wgs84.geojson`);
  if (fs.existsSync(out)) fs.unlinkSync(out);
  console.log(`[de-boundaries] Reprojecting + simplifying ${layer} (simplify=${SIMPLIFY_M}m)…`);
  execFileSync('ogr2ogr', [
    '-f', 'GeoJSON',
    '-t_srs', 'EPSG:4326',
    '-simplify', String(SIMPLIFY_M),
    '-lco', 'COORDINATE_PRECISION=4',
    '-where', 'GF = 4',
    out,
    SOURCE_GPKG,
    layer,
  ], { stdio: 'pipe' });
  const fc = JSON.parse(fs.readFileSync(out, 'utf-8')) as GeoJSONCollection;
  console.log(`[de-boundaries]   ${fc.features.length} features after GF=4 filter`);
  return fc;
}

function mergeGeometries(features: GeoJSONFeature[]): GazetteerGeometry {
  if (features.length === 1) return features[0].geometry;
  const polygons: number[][][][] = [];
  for (const f of features) {
    if (f.geometry.type === 'Polygon') {
      polygons.push(f.geometry.coordinates as number[][][]);
    } else {
      for (const p of f.geometry.coordinates as number[][][][]) polygons.push(p);
    }
  }
  return { type: 'MultiPolygon', coordinates: polygons };
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

function bundeslandSortKey(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function main(): void {
  if (!fs.existsSync(SOURCE_GPKG)) {
    console.error(`Source not found: ${SOURCE_GPKG}`);
    console.error('Download: curl -fsSL -o /tmp/bkg_vg250/vg250.zip https://daten.gdz.bkg.bund.de/produkte/vg/vg250_ebenen_0101/aktuell/vg250_01-01.utm32s.gpkg.ebenen.zip');
    console.error('Unzip:    unzip -o /tmp/bkg_vg250/vg250.zip -d /tmp/bkg_vg250/');
    process.exit(1);
  }

  const lanFC = reprojectAndSimplify('vg250_lan');
  const krsFC = reprojectAndSimplify('vg250_krs');

  // Group Bundesländer by SN_L (a single LAN can have multiple polygons,
  // e.g. a coastline-fragmented island).
  const lanByCode = new Map<string, GeoJSONFeature[]>();
  for (const f of lanFC.features) {
    const code = f.properties.SN_L;
    if (!code) continue;
    if (!lanByCode.has(code)) lanByCode.set(code, []);
    lanByCode.get(code)!.push(f);
  }

  // Build admin1 nodes.
  const bundeslander = new Map<string, GazetteerNode>();
  for (const [code, feats] of lanByCode) {
    const name = feats[0].properties.GEN;
    const geom = roundGeom(mergeGeometries(feats));
    const [lat, lon] = computeCentroid(geom);
    bundeslander.set(code, {
      name,
      type: 'admin1',
      lat: round6(lat),
      lon: round6(lon),
      geometry: geom,
      children: [],
    });
  }
  console.log(`[de-boundaries] ${bundeslander.size} Bundesländer assembled`);

  // Group Kreise by ARS (12-digit hierarchical code; first 2 chars = SN_L).
  const krsByArs = new Map<string, GeoJSONFeature[]>();
  for (const f of krsFC.features) {
    const ars = f.properties.ARS;
    if (!ars) continue;
    if (!krsByArs.has(ars)) krsByArs.set(ars, []);
    krsByArs.get(ars)!.push(f);
  }

  let orphanCount = 0;
  for (const [ars, feats] of krsByArs) {
    const name = feats[0].properties.GEN;
    const lanCode = ars.slice(0, 2);
    const parent = bundeslander.get(lanCode);
    if (!parent) {
      console.warn(`[de-boundaries] orphan Kreis ${name} (${ars}); skipping.`);
      orphanCount++;
      continue;
    }
    const geom = roundGeom(mergeGeometries(feats));
    const [lat, lon] = computeCentroid(geom);
    parent.children!.push({
      name,
      type: 'admin2',
      lat: round6(lat),
      lon: round6(lon),
      geometry: geom,
    });
  }
  console.log(`[de-boundaries] ${krsByArs.size} Kreise assembled (${orphanCount} orphans)`);

  // Sort Bundesländer alphabetically (German collation, diacritic-folded).
  const bundeslanderArr = Array.from(bundeslander.values()).sort((a, b) =>
    bundeslandSortKey(a.name).localeCompare(bundeslandSortKey(b.name)));
  for (const bl of bundeslanderArr) {
    bl.children!.sort((a, b) => a.name.localeCompare(b.name, 'de'));
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
        name: 'Germany',
        type: 'country',
        aliases: ['Deutschland', 'Tyskland', 'Allemagne', 'Germania'],
        lat: 51.0,
        lon: 10.5,
        children: bundeslanderArr,
      }],
    }],
  };

  const fetchedYear = FETCHED_DATE.slice(0, 4);
  const result = writeGazetteer({
    id: 'de-gemeinden-boundaries',
    name: 'German Bundesländer & Kreise — Boundaries',
    locale: 'de',
    description: 'German Bundesland (admin1) and Kreis (admin2) boundary polygons from BKG vg250.',
    kind: 'boundary',
    source: {
      name: 'BKG vg250',
      url: 'https://daten.gdz.bkg.bund.de/produkte/vg/vg250_ebenen_0101/aktuell/',
      license: 'Datenlizenz Deutschland — Namensnennung 2.0',
      attribution: `© GeoBasis-DE / BKG ${fetchedYear}`,
      fetched: FETCHED_DATE,
      notes: `Filter: GF=4 (land only). Reprojected EPSG:25832 → EPSG:4326 with Douglas-Peucker simplify=${SIMPLIFY_M}m via ogr2ogr.`,
    },
    root,
  }, 'de-gemeinden-boundaries.json');

  console.log(`[de-boundaries] Wrote ${result.path} (${result.sizeKB} KB)`);
  console.log(`[de-boundaries]     ${bundeslanderArr.length} Bundesländer, ${krsByArs.size - orphanCount} Kreise`);
}

main();
