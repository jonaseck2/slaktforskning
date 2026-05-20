// ── Phase: NAME / PLAC TRAN translations (T07) ─────────────────────────────
//
// GEDCOM 7.0 NAME and PLAC both accept TRAN substructures with LANG and an
// optional `_SCHEME` custom tag for the transliteration scheme. This phase
// reads from `ctx.originalTree` (the pre-normalize tree) so it sees the
// raw 7.0 NAME/TRAN structure — normalize.ts no longer expands TRAN into
// extra NAME nodes, so the original tree is the canonical source.
//
// 5.5.1 fallback: detect multiple NAME nodes on the same INDI where a
// secondary NAME has `2 TYPE <lang>` and lang matches a short BCP-47 code
// (ru, zh, ja, ar, he, el, …). Treat those as name translations so the
// degraded-export → degraded-import round-trip lands them back in
// name_translations.
//
// Wired into import-core.ts after phaseIndividuals + phasePlaceCitations
// so person_names + places exist to attach to.

import type { ImportContext } from '../import-types';
import type { GedcomNode } from '../../../gedcom/parser';
import { getChild, getChildren } from '../node-utils';
import { getPersonNames } from '../../../api/persons';
import { findOrCreatePlace } from '../../../api/places';
import { createNameTranslation, createPlaceTranslation } from '../../../api/translations';

// Two-letter BCP-47 codes commonly used as alternate-script language tags
// in 5.5.1 dialects. Extended to include 3-letter codes via length check.
const KNOWN_LANG_CODES = new Set<string>([
  'ru', 'zh', 'ja', 'ar', 'he', 'el', 'ko', 'th', 'hi', 'fa', 'uk', 'bg',
  'sr', 'mk', 'be', 'ka', 'hy', 'yi', 'ur', 'bn', 'ta', 'te', 'gu', 'kn',
  'pa', 'si', 'my', 'km', 'lo', 'am', 'ti', 'iu', 'cy', 'ga', 'is',
]);

function isLanguageTag(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  const m = v.match(/^([a-zA-Z]{2,3})(?:-[a-zA-Z0-9]+)?$/);
  if (!m) return false;
  const primary = m[1].toLowerCase();
  return KNOWN_LANG_CODES.has(primary) || primary.length === 3;
}

export async function phaseTranslations(ctx: ImportContext): Promise<void> {
  const tree = ctx.originalTree ?? ctx.tree;

  // ── NAME/TRAN under each INDI ────────────────────────────────────────────
  for (const indi of tree) {
    if (indi.tag !== 'INDI') continue;
    const xref = indi.xref;
    if (!xref) continue;
    const personId = ctx.personMap.get(xref);
    if (!personId) continue;

    const nameNodes = getChildren(indi, 'NAME');
    if (nameNodes.length === 0) continue;
    const personNames = await getPersonNames(ctx.db, personId);
    if (personNames.length === 0) continue;

    // 7.0 path: walk each NAME, attach TRAN children to the matching
    // person_name (by index — same order as individuals.ts inserted them).
    let sawAnyTran = false;
    for (let i = 0; i < nameNodes.length && i < personNames.length; i++) {
      const nameNode = nameNodes[i];
      const personNameId = personNames[i].id;
      for (const tran of getChildren(nameNode, 'TRAN')) {
        if (!tran.value) continue;
        sawAnyTran = true;
        const lang = getChild(tran, 'LANG')?.value?.trim() ?? '';
        const scheme = getChild(tran, '_SCHEME')?.value?.trim() ?? '';
        await createNameTranslation(ctx.db, {
          person_name_id: personNameId,
          value: tran.value,
          language: lang,
          transliteration_scheme: scheme,
        });
      }
    }

    // 5.5.1 fallback: only attempt this when no TRAN was seen on this INDI
    // (avoids double-recording when both styles are present). Trailing NAME
    // nodes (index >= personNames.length) carrying `TYPE <lang>` with a
    // recognized language code are treated as translations of the primary
    // (index 0) name. The primary name row was created by phaseIndividuals
    // from index 0; the additional NAMEs were skipped there because index
    // is past the bound.
    //
    // Note: phaseIndividuals creates one person_name row per NAME node
    // unconditionally. To distinguish "real second name (aka)" from "5.5.1
    // translation degradation", we require the `TYPE <lang>` value to be
    // a known language tag (not e.g. 'aka' / 'married' / 'birth').
    if (!sawAnyTran && nameNodes.length > 1 && personNames.length > 1) {
      const primaryName = personNames[0];
      for (let i = 1; i < nameNodes.length && i < personNames.length; i++) {
        const nameNode = nameNodes[i];
        const typeVal = getChild(nameNode, 'TYPE')?.value?.trim() ?? '';
        if (!typeVal || !isLanguageTag(typeVal)) continue;
        if (!nameNode.value) continue;
        await createNameTranslation(ctx.db, {
          person_name_id: primaryName.id,
          value: nameNode.value,
          language: typeVal,
          transliteration_scheme: '',
        });
      }
    }
  }

  // ── PLAC/TRAN — walk the whole tree for PLAC nodes carrying TRAN ─────────
  await walkPlacTrans(tree, ctx);
}

async function walkPlacTrans(nodes: GedcomNode[], ctx: ImportContext): Promise<void> {
  for (const n of nodes) {
    if (n.tag === 'PLAC' && n.value) {
      const trans = getChildren(n, 'TRAN');
      if (trans.length > 0) {
        const place = await findOrCreatePlace(ctx.db, n.value);
        for (const tran of trans) {
          if (!tran.value) continue;
          const lang = getChild(tran, 'LANG')?.value?.trim() ?? '';
          const scheme = getChild(tran, '_SCHEME')?.value?.trim() ?? '';
          await createPlaceTranslation(ctx.db, {
            place_id: place.id,
            value: tran.value,
            language: lang,
            transliteration_scheme: scheme,
          });
        }
      }
    }
    if (n.children.length > 0) await walkPlacTrans(n.children, ctx);
  }
}
