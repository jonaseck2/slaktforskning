// Renderer-safe barrel. Re-exports pure logic and types.
//
// Does NOT re-export from ./bundled — bundled.ts statically imports ~40 MB of
// JSON and must never be reachable from a renderer import chain. Main-process
// and MCP code should import from './bundled' directly when they need the
// bundled gazetteer data.

export { loadGazetteers } from './merge';
export { resolvePlace, resolveBoundary, searchGazetteer } from './resolver';
export type { GazetteerSearchHit, BoundaryHint } from './resolver';
export type {
  GeoJSONPolygon,
  GeoJSONMultiPolygon,
  GazetteerGeometry,
  GazetteerNode,
  GazetteerSource,
  Gazetteer,
  PlaceResolveResult,
  BoundaryResolveResult,
  GazetteerConfig,
  GazetteerInfo,
} from './types';
