/**
 * Name / place translation emitter — T07 (GEDCOM alignment plan).
 *
 * GEDCOM 7.0: `NAME` and `PLAC` both accept `TRAN <value>` substructures
 * with `LANG` qualifier. We additionally emit `_SCHEME <scheme>` as a
 * 7.0-permitted custom-tag carrier for the transliteration scheme (the 7.0
 * spec leaves transliteration-scheme labelling unspecified; the importer
 * round-trips this custom tag without warning).
 *
 * GEDCOM 5.5.1 has neither structure:
 *   - Name translations degrade to an additional `1 NAME <value>` block
 *     with `2 TYPE <language>` (a common 5.5.1 convention for alternate-
 *     language names). The transliteration scheme cannot be carried.
 *   - Place translations cannot be expressed at all — skipped + warning.
 *
 * The fidelity registry encodes the per-version, per-column status. The
 * emitter is the source of truth for the actual emission; the registry
 * follows the emitter's behaviour.
 */

import type { Database } from 'node-sqlite3-wasm';
import type { NameTranslation, PlaceTranslation } from '../../api/types';
import { getTranslationsForName, getTranslationsForPlace } from '../../api/translations';

interface WarningSink {
  warnings: string[];
}

/**
 * Emit NAME TRAN sub-structures attached to a single person_name.
 *
 * 7.0 (lossless): emits the canonical TRAN/LANG block per row:
 *
 *     <baseLevel>   TRAN <value>
 *     <baseLevel+1> LANG <language>          (when set)
 *     <baseLevel+1> _SCHEME <scheme>         (when set — custom tag)
 *
 * 5.5.1 (lossy): emits an additional `1 NAME <value>` block at INDI level
 * (the NAME's parent — baseLevel-1) with `2 TYPE <language>` underneath.
 * The transliteration scheme cannot be represented.
 */
export async function emitNameTranslations(
  db: Database,
  personNameId: string,
  baseLevel: number,
  version: '5.5.1' | '7.0',
  lines: string[],
  report?: WarningSink,
  prefetchedTranslations?: NameTranslation[],
): Promise<void> {
  const translations = prefetchedTranslations ?? await getTranslationsForName(db, personNameId);
  if (translations.length === 0) return;

  if (version === '7.0') {
    for (const t of translations) {
      lines.push(`${baseLevel} TRAN ${t.value}`);
      if (t.language) lines.push(`${baseLevel + 1} LANG ${t.language}`);
      if (t.transliteration_scheme) lines.push(`${baseLevel + 1} _SCHEME ${t.transliteration_scheme}`);
    }
    return;
  }

  // 5.5.1: emit additional NAME blocks at the same level as the parent NAME
  // (one less than baseLevel, since baseLevel is the TRAN-sub-tag level —
  // i.e. NAME is at baseLevel-1).
  const nameLevel = baseLevel - 1;
  for (const t of translations) {
    lines.push(`${nameLevel} NAME ${t.value}`);
    if (t.language) lines.push(`${nameLevel + 1} TYPE ${t.language}`);
    if (report) {
      report.warnings.push(
        `Name translation '${t.value}' (lang=${t.language || 'unspecified'}) emitted as additional NAME with TYPE on 5.5.1 — language metadata may not survive interop with non-language-aware 5.5.1 tools, and transliteration scheme is dropped.`,
      );
    }
  }
}

/**
 * Emit PLAC TRAN sub-structures attached to a single place.
 *
 * 7.0 (lossless): emits TRAN/LANG (+ optional _SCHEME) under the PLAC node:
 *
 *     <baseLevel>   TRAN <value>
 *     <baseLevel+1> LANG <language>          (when set)
 *     <baseLevel+1> _SCHEME <scheme>         (when set — custom tag)
 *
 * 5.5.1 (lossy): no PLAC TRAN tag exists. Skip + push one warning per
 * dropped row so the user sees the data loss disclosure.
 */
export async function emitPlaceTranslations(
  db: Database,
  placeId: string,
  baseLevel: number,
  version: '5.5.1' | '7.0',
  lines: string[],
  report?: WarningSink,
  prefetchedTranslations?: PlaceTranslation[],
): Promise<void> {
  const translations = prefetchedTranslations ?? await getTranslationsForPlace(db, placeId);
  if (translations.length === 0) return;

  if (version === '7.0') {
    for (const t of translations) {
      lines.push(`${baseLevel} TRAN ${t.value}`);
      if (t.language) lines.push(`${baseLevel + 1} LANG ${t.language}`);
      if (t.transliteration_scheme) lines.push(`${baseLevel + 1} _SCHEME ${t.transliteration_scheme}`);
    }
    return;
  }

  // 5.5.1: PLAC has no TRAN slot. Disclose + drop.
  for (const t of translations) {
    if (report) {
      report.warnings.push(
        `Place translation '${t.value}' (lang=${t.language || 'unspecified'}) dropped on 5.5.1 export — the 5.5.1 spec has no PLAC translation tag.`,
      );
    }
  }
}
