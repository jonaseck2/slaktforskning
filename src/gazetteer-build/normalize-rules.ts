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
    'landskap',
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

export const GB_RULES: GazetteerNormalizeRules = {
  // Civil-administrative + ecclesiastical British-isles suffixes. Longest-first;
  // resolver applies them case-insensitively. The base EN_RULES set already
  // covers `county` / `parish` / `province` / `state`; GB adds the home-nation-
  // specific layers (council area, principal area, community, civil parish,
  // royal burgh, etc.).
  stripSuffixes: [
    'civil parish', 'ecclesiastical parish', 'royal burgh', 'council area',
    'principal area', 'ceremonial county', 'unitary authority', 'metropolitan borough',
    'borough', 'burgh', 'district', 'community', 'parish', 'town', 'village', 'hamlet',
  ],
  stripPrefixes: [
    'civil parish of', 'ecclesiastical parish of',
    'county of', 'city of', 'borough of', 'royal burgh of', 'parish of',
  ],
};

export const DE_RULES: GazetteerNormalizeRules = {
  stripSuffixes: [
    // Civil-administrative
    'Land', 'Bezirk', 'Kreis', 'Landkreis', 'Stadtkreis',
    'Gemeinde', 'Stadt', 'Markt', 'Ortsteil',
    // Ecclesiastical (added 2026-05-09 by de-gazetteer-upgrade plan)
    'Kirchengemeinde', 'Kirchgemeinde',
    'Pfarrkirchengemeinde', 'Pfarrgemeinde', 'Pfarrei-Verband', 'Pfarrei',
    'Kirchspiel', 'Pfarrbezirk',
  ],
};
