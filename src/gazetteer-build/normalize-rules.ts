// Per-gazetteer normalization rule sets, sourced from the language-agnostic
// resolver overhaul. The resolver applies universal rules first (lowercase,
// trim, strip parens, hyphen↔space) and then these per-gazetteer rules.
//
// Build scripts and the bundled-gazetteer loader can import these constants;
// the rules themselves are plain data so they can also be embedded in JSON.

import type { GazetteerNormalizeRules } from '../api/place-gazetteers/types';

export const SV_RULES: GazetteerNormalizeRules = {
  stripSuffixes: [
    'församling', 'socken', 'kommun', 'stad', 'härad', 'län', 'distrikt', 'pastorat',
    'kn', 'sn', 'fs',
  ],
};

export const DK_RULES: GazetteerNormalizeRules = {
  stripSuffixes: ['sogn', 'kirkedistrikt', 'kommune', 'amt', 'herred'],
};

export const NO_RULES: GazetteerNormalizeRules = {
  stripSuffixes: ['fylke', 'prestegjeld', 'sokn'],
};

export const FI_RULES: GazetteerNormalizeRules = {
  stripSuffixes: ['kunta', 'kaupunki', 'maakunta', 'seurakunta'],
};

export const IS_RULES: GazetteerNormalizeRules = {
  stripSuffixes: ['sýsla', 'hreppur', 'sveitarfélag', 'sókn'],
};

export const EN_RULES: GazetteerNormalizeRules = {
  stripSuffixes: ['county', 'parish', 'township', 'borough', 'province', 'state'],
  stripPrefixes: ['county of', 'province of', 'state of'],
};
