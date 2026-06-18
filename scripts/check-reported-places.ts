// Reproduce the 9 reported place-resolution outliers.
// Resolves each via the merged gazetteer set (as the app does) AND prints
// per-gazetteer best candidate so we can see WHY ambiguity/wrong-country fires.

import { resolvePlace, tokenizePlaceString } from '../src/api/place-gazetteers/resolver';
import { loadGazetteers } from '../src/api/place-gazetteers/merge';
import { getAllGazetteers } from '../src/api/place-gazetteers/bundled';
import type { Gazetteer } from '../src/api/place-gazetteers/types';

const ENABLED = ["sv-socknar","sv-forsamlingar","sv-orter","sv-gardar","sv-kyrkor","sv-landskap","sv-sockenstad-boundaries","dk-sogne","dk-sogne-dawa","no-kommuner","fi-kunnat","is-sveitarfelog","de-gemeinden","de-kirchgemeinden","de-gemeinden-boundaries","gb-civil-divisions","ie-counties","nl-gemeenten","be-provinces","fr-departements","ee-counties","lv-novadi","lt-savivaldybes","pl-powiaty","at-bezirke","ch-cantons","it-province","es-provincias","pt-distritos","mt-localities","sm-castelli","li-gemeinden","ad-parroquies","mc-quartiers","cz-okresy","sk-okresy","hu-jarasok","si-obcine","hr-zupanije","ba-opstine","rs-okruzi","me-opstine","mk-opstini","al-bashkite","xk-komunat","lu-communes","bg-obshtini","ro-judete","md-raioane","gr-dimoi","cy-eparchies","by-rajony","ua-oblasti","fo-kommunur","gl-kommune","us-immigration-states","us-all-states","ca-provinces","world-countries","world-admin1","world-historical","europe-historical","lang-sv-geonames","lang-sv-wikidata","lang-world-historical","dk-sogne-boundaries","no-kommuner-boundaries","fi-kunnat-boundaries","us-counties-boundaries","ca-divisions-boundaries","world-boundaries"];

const allGaz = getAllGazetteers();
const enabled: Gazetteer[] = allGaz.filter(g => ENABLED.includes(g.id));
// The app resolves against the MERGED tree. Replicate that.
const merged = loadGazetteers({ enabledGazetteers: ENABLED }, allGaz, []);

const CASES = [
  'Tun, Lindköpings kn (R)',
  'Tun, Lidköpings kn (R)',
  'Mellangården, Edum',
  'Turkiet',
  'Rasht, Iran',
  'New York',
  'Västra Vingåkers sn',
  'Spanien',
  'Barcelona, Spanien',
  'Genève, Schweiz',
];

for (const name of CASES) {
  console.log(`\n========== "${name}"`);
  console.log(`  tokens: ${JSON.stringify(tokenizePlaceString(name))}`);
  const r = resolvePlace(name, merged);
  if (!r) {
    console.log('  MERGED → UNRESOLVED');
  } else {
    const node = r.matchedNode as { __contributors?: string[] };
    console.log(`  MERGED → ${r.matchedPath.join(' > ')}  [${r.matchQuality}]  contributors=${JSON.stringify(node.__contributors ?? [])}`);
  }
  // Per-gazetteer (un-merged) view to see which gazetteers contribute and at what coords.
  for (const g of enabled) {
    const rg = resolvePlace(name, [g]);
    if (rg) {
      const n = rg.matchedNodes[rg.matchedNodes.length - 1];
      console.log(`    [${g.id}] ${rg.matchedPath.join(' > ')}  (${n.lat?.toFixed(3)},${n.lon?.toFixed(3)}) ${rg.matchQuality}`);
    }
  }
}
