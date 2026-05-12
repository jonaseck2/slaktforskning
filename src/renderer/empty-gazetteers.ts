// Tauri-renderer-side replacement for src/api/place-gazetteers/bundled.ts.
// The real file does fileURLToPath(import.meta.url) + readFileSync at module
// init — works in Node but throws on tauri:// URLs and there's no fs in the
// renderer.
//
// Lazy-chunk strategy: every JSON in src/api/place-gazetteers/data/ is
// import.meta.glob'd WITHOUT eager:true, so Vite emits one chunk per
// gazetteer that the webview only fetches on demand. Loaded gazetteers are
// cached in-memory; callers see a Promise on first access then a hot result
// for the lifetime of the page.
//
// The previous version of this file used { eager: true, import: 'default' }
// which inlined every JSON into one ~30 MB chunk that the webview parsed
// at app start AND that OOM'd Vite's rollup pass during production build
// (forcing the NODE_OPTIONS=--max-old-space-size=8192 workaround in
// package.json). Lazy chunks remove both costs.
//
// Surface contract vs the Node bundled.ts:
//   - getAllGazetteers / getGazetteerById are ASYNC here; they're sync in
//     bundled.ts. Every renderer-reachable caller in src/api/ must await.
//   - getBundledGazetteerIds / LAN_LETTER_CODES / HISTORICAL_LAN_ALIASES
//     stay synchronous (they don't touch JSON data).
//   - preloadGazetteer(id) warms the cache without waiting on a render path.

import {
  SV_RULES, DK_RULES, NO_RULES, FI_RULES, IS_RULES, EN_RULES, DE_RULES, GB_RULES,
} from '../gazetteer-build/normalize-rules';
import type { Gazetteer, GazetteerNode, GazetteerNormalizeRules } from '../api/place-gazetteers/types';

// Eager `as: 'url'` glob: each gazetteer JSON ships as a static asset under
// dist-tauri/assets/, and we collect a synchronous map of id → URL at build
// time. The JSONs are NEVER parsed by rollup (which OOMs on the 70 MB pile);
// we fetch + JSON.parse at runtime, on demand, in the browser/webview.
//
// Why not non-eager `import: 'default'`? Vite still treats JSON imports as
// modules and parses every one to emit a code-split chunk — the rollup step
// holds all 70 MB of parsed JSON in Node memory and OOMs the default 2 GB
// heap. The url-asset path skips parsing entirely.
const URL_MAP: Record<string, string> = import.meta.glob(
  '../api/place-gazetteers/data/*.json',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

// Order matters — same precedence list the real bundled.ts uses.
const BUNDLED_IDS: readonly string[] = [
  'sv-socknar', 'sv-forsamlingar', 'sv-orter', 'sv-gardar', 'sv-kyrkor',
  'sv-landskap', 'sv-sockenstad-boundaries',
  'dk-sogne', 'dk-sogne-dawa',
  'no-kommuner',
  'fi-kunnat',
  'is-sveitarfelog',
  'de-gemeinden', 'de-kirchgemeinden', 'de-gemeinden-boundaries',
  'gb-civil-divisions',
  'ie-counties',
  'nl-gemeenten',
  'be-provinces',
  'fr-departements',
  'ee-counties', 'lv-novadi', 'lt-savivaldybes',
  'pl-powiaty',
  'at-bezirke', 'ch-cantons', 'it-province', 'es-provincias', 'pt-distritos',
  'mt-localities', 'sm-castelli', 'li-gemeinden', 'ad-parroquies', 'mc-quartiers',
  'cz-okresy', 'sk-okresy', 'hu-jarasok', 'si-obcine', 'hr-zupanije',
  'ba-opstine', 'rs-okruzi', 'me-opstine', 'mk-opstini', 'al-bashkite',
  'xk-komunat', 'lu-communes',
  'bg-obshtini', 'ro-judete', 'md-raioane', 'gr-dimoi', 'cy-eparchies',
  'by-rajony', 'ua-oblasti', 'fo-kommunur', 'gl-kommune',
  'us-immigration-states', 'us-all-states', 'ca-provinces',
  'world-countries', 'world-admin1',
  'world-historical', 'europe-historical',
  'lang-sv-geonames', 'lang-sv-wikidata', 'lang-world-historical',
  'dk-sogne-boundaries', 'no-kommuner-boundaries', 'fi-kunnat-boundaries',
  'is-sveitarfelog-boundaries', 'us-counties-boundaries',
  'ca-divisions-boundaries', 'world-boundaries',
];

function loaderKeyFor(id: string): string {
  return `../api/place-gazetteers/data/${id}.json`;
}

export const HISTORICAL_LAN_ALIASES: Record<string, string[]> = {
  'Dalarnas län': ['Kopparbergs län', 'Kopparbergs'],
  'Västra Götalands län': ['Älvsborgs län', 'Älvsborgs', 'Skaraborgs län', 'Skaraborgs', 'Göteborgs och Bohus län'],
  'Skåne län': ['Malmöhus län', 'Malmöhus', 'Kristianstads län', 'Kristianstads'],
};

export const LAN_LETTER_CODES: Record<string, string[]> = {
  'Stockholms län': ['AB', 'A', 'B'],
  'Uppsala län': ['C'],
  'Södermanlands län': ['D'],
  'Östergötlands län': ['E'],
  'Jönköpings län': ['F'],
  'Kronobergs län': ['G'],
  'Kalmar län': ['H'],
  'Gotlands län': ['I'],
  'Blekinge län': ['K'],
  'Skåne län': ['L', 'M'],
  'Hallands län': ['N'],
  'Västra Götalands län': ['O', 'P', 'R'],
  'Värmlands län': ['S'],
  'Örebro län': ['T'],
  'Västmanlands län': ['U'],
  'Dalarnas län': ['W'],
  'Gävleborgs län': ['X'],
  'Västernorrlands län': ['Y'],
  'Jämtlands län': ['Z'],
  'Västerbottens län': ['AC'],
  'Norrbottens län': ['BD'],
};

const NORMALIZE_RULES_BY_ID: Record<string, GazetteerNormalizeRules> = {
  'sv-socknar': SV_RULES, 'sv-forsamlingar': SV_RULES, 'sv-orter': SV_RULES,
  'sv-gardar': SV_RULES, 'sv-kyrkor': SV_RULES, 'sv-landskap': SV_RULES,
  'sv-sockenstad-boundaries': SV_RULES,
  'dk-sogne': DK_RULES, 'dk-sogne-dawa': DK_RULES, 'dk-sogne-boundaries': DK_RULES,
  'no-kommuner': NO_RULES, 'no-kommuner-boundaries': NO_RULES,
  'fi-kunnat': FI_RULES, 'fi-kunnat-boundaries': FI_RULES,
  'is-sveitarfelog': IS_RULES, 'is-sveitarfelog-boundaries': IS_RULES,
  'gb-civil-divisions': GB_RULES, 'ie-counties': GB_RULES,
  'de-gemeinden': DE_RULES, 'de-kirchgemeinden': DE_RULES,
  'de-gemeinden-boundaries': DE_RULES,
  'us-immigration-states': EN_RULES, 'us-all-states': EN_RULES, 'ca-provinces': EN_RULES,
  'us-counties-boundaries': EN_RULES, 'ca-divisions-boundaries': EN_RULES,
};

function attachNormalizeRules(gaz: Gazetteer): Gazetteer {
  const explicit = NORMALIZE_RULES_BY_ID[gaz.id];
  if (explicit && !gaz.normalize) (gaz as { normalize?: GazetteerNormalizeRules }).normalize = explicit;
  return gaz;
}

function enrichHistoricalAliases(gaz: Gazetteer): Gazetteer {
  if (gaz.id !== 'sv-landskap' && !gaz.id.startsWith('sv-')) return gaz;
  function walk(node: GazetteerNode | { name?: string; aliases?: string[]; children?: GazetteerNode[] }): void {
    if (node && 'name' in node && node.name && HISTORICAL_LAN_ALIASES[node.name]) {
      const merged = Array.from(new Set([
        ...(node.aliases ?? []),
        ...HISTORICAL_LAN_ALIASES[node.name],
        ...(LAN_LETTER_CODES[node.name] ?? []),
      ]));
      (node as GazetteerNode).aliases = merged;
    }
    if (node?.children) for (const child of node.children) walk(child);
  }
  walk(gaz.root);
  return gaz;
}

// In-memory cache: id → fully-decorated Gazetteer (after normalize-rules +
// historical-aliases). The same Gazetteer reference is returned to every
// caller so the resolver's WeakMap-keyed indexes (nameIndexCache,
// perGazetteerNameDepth, mergedDepthByArray) stay warm across calls.
const cache: Map<string, Gazetteer> = new Map();
// In-flight loads: id → Promise. Prevents the "two callers in the same tick
// each kick off a fetch for the same chunk" race.
const inflight: Map<string, Promise<Gazetteer | undefined>> = new Map();

async function loadOne(id: string): Promise<Gazetteer | undefined> {
  const cached = cache.get(id);
  if (cached) return cached;
  const existing = inflight.get(id);
  if (existing) return existing;
  const url = URL_MAP[loaderKeyFor(id)];
  if (!url) return undefined;
  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
      }
      const raw = (await res.json()) as Gazetteer;
      const decorated = enrichHistoricalAliases(attachNormalizeRules(raw));
      cache.set(id, decorated);
      return decorated;
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, p);
  return p;
}

export async function getAllGazetteers(): Promise<Gazetteer[]> {
  // Load (or pull from cache) every bundled gazetteer in parallel.
  // Preserves BUNDLED_IDS order (the resolver precedence list).
  const loaded = await Promise.all(BUNDLED_IDS.map(id => loadOne(id)));
  return loaded.filter((g): g is Gazetteer => !!g);
}

export async function getGazetteerById(id: string): Promise<Gazetteer | undefined> {
  return loadOne(id);
}

export function getBundledGazetteerIds(): string[] {
  return [...BUNDLED_IDS];
}

/**
 * Warm the in-memory cache for one gazetteer. Useful for the
 * usePlaceResolver composable to start the user-enabled-set fetch in the
 * background after the app boots.
 */
export async function preloadGazetteer(id: string): Promise<void> {
  await loadOne(id);
}
