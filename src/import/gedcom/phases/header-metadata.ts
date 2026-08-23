// ── T09: Preserve originating-app HEAD metadata ────────────────────────────
//
// User goal: a GEDCOM round-trip preserves where the file *came from* —
// the originating app name, version, language, copyright. Without this,
// every re-export claims the file was produced by Släktforskning even when
// the original came from Ancestry / FamilySearch / Holger / Genney etc.
//
// Capture strategy: parse the HEAD block's SOUR, NAME (under SOUR), CORP,
// VERS, LANG, COPR sub-tags into a single JSON blob stored under the
// `header_metadata` db_settings key. Re-emitted on export as a custom
// `1 _ORIG_SOUR <json>` extension on the HEAD block. The `_` prefix marks
// it as an extension tag — neither 5.5.1 nor 7.0 rejects unknown extensions.
//
// Round-trip: per CLAUDE.md "⚠️ Prime Directive (cont.): Round-Trip Fidelity".
// header_metadata is row-keyed in db_settings (not column-tracked), so it
// has no entry in the GEDCOM fidelity registry; the per-file round-trip
// test in tests/unit/gedcom-head-preservation.test.ts is the mechanical
// enforcement instead.

import type { ImportContext } from '../import-types';
import { getChild } from '../node-utils';
import { setDbSetting } from '../../../api/db_settings';
import { markConsumed } from '../tag-accounting';

export interface HeaderMetadata {
  /** HEAD.SOUR value — e.g. "FOO" or "Ancestry.com" (a free-form code). */
  source_app?: string;
  /** HEAD.SOUR.NAME — the human-readable product name. */
  source_name?: string;
  /** HEAD.SOUR.CORP — the corporation / vendor. */
  source_corp?: string;
  /** HEAD.SOUR.VERS — product version. */
  source_version?: string;
  /** HEAD.LANG — file language code. */
  language?: string;
  /** HEAD.COPR — copyright statement. */
  copyright?: string;
}

export async function phaseHeaderMetadata(ctx: ImportContext): Promise<void> {
  // The parser's tree may include a HEAD node at level 0. Find the first
  // (there should only ever be one per GEDCOM file).
  const head = ctx.tree.find(n => n.tag === 'HEAD');
  if (head) markConsumed(head);
  if (!head) return;

  // T09 round-trip path: if a prior export wrote `1 _ORIG_SOUR <json>` (the
  // custom extension this module emits), prefer that JSON verbatim — it
  // preserves the original SOUR/NAME/CORP/VERS/LANG/COPR fields exactly,
  // even after a Släktforskning re-export overwrote the canonical HEAD.SOUR
  // with our own app identity. Per Prime Directive: the JSON is the
  // authored value (carried in from the importer's source file). Take it
  // as-is. Validation = JSON.parse round-trip (catches malformed extensions).
  const origSour = getChild(head, '_ORIG_SOUR');
  if (origSour?.value && origSour.value.trim()) {
    try {
      const parsed = JSON.parse(origSour.value.trim());
      if (parsed && typeof parsed === 'object') {
        await setDbSetting(ctx.db, 'header_metadata', JSON.stringify(parsed));
        return;
      }
    } catch {
      // Malformed extension — fall through to the standard HEAD parse.
    }
  }

  const sour = getChild(head, 'SOUR');
  const meta: HeaderMetadata = {};

  if (sour) {
    if (sour.value && sour.value.trim()) meta.source_app = sour.value.trim();
    const sourName = getChild(sour, 'NAME')?.value?.trim();
    if (sourName) meta.source_name = sourName;
    const sourCorp = getChild(sour, 'CORP')?.value?.trim();
    if (sourCorp) meta.source_corp = sourCorp;
    const sourVers = getChild(sour, 'VERS')?.value?.trim();
    if (sourVers) meta.source_version = sourVers;
  }

  const lang = getChild(head, 'LANG')?.value?.trim();
  if (lang) meta.language = lang;
  const copr = getChild(head, 'COPR')?.value?.trim();
  if (copr) meta.copyright = copr;

  // Only persist when at least one originating-app field is present — an
  // empty {} is noise. Per Prime Directive: nothing inferred — every value
  // here came from the file the user imported.
  if (Object.keys(meta).length === 0) return;

  await setDbSetting(ctx.db, 'header_metadata', JSON.stringify(meta));
}
