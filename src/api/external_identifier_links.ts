/**
 * Render-time resolution of an `external_identifiers` row to a URL.
 *
 * **Prime Directive:** the result is computed on every render and never written
 * back. The DB stores what the import file said — `v191316.b580.s52` — and
 * nothing else. If ArkivDigital changes its URL shape, this function changes
 * and every stored pointer resolves correctly the next time it is drawn.
 *
 * **The shape is the vendor's own, measured, not guessed.** Across the four
 * real ArkivDigital exports, 2726 of 2762 `_URL` values (98.7 %) are
 * `arkivdigital.se/aid/show/<aid>` — the remainder are Riksarkivet links and
 * one typo. **Zero** use `app.arkivdigital.se/volume/…?image=…`, which is the
 * form the free-text rule in `src/api/link-rules/sv.ts` produces. That form
 * also discards the `.sNN` page part; `aid/show` carries the whole pointer.
 *
 * Anchored patterns only: the value is a field, not prose. `link-rules/` is the
 * free-text linkifier, a different mechanism with different risks — its
 * ArkivDigital rule requires a literal `AID:` prefix and matches inside running
 * text, which is wrong for a stored identifier.
 *
 * The volume-level `arkivdigital` system is deliberately **not** resolved. A
 * bare `v191316` in `aid/show` is unattested in the corpus, and the source row
 * already carries the researcher's own authored `_URL` in `sources.url`, so a
 * synthesised volume link would add an unverified guess beside a real value.
 */

/** `v<volume>.b<image>` with an optional `.s<page>`, all of which the URL carries. */
const AD_IMAGE = /^v\d+\.b\d+(?:\.s\d+)?$/;

export function resolveExternalIdentifierUrl(system: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (system === 'arkivdigital.image') {
    return AD_IMAGE.test(v) ? `https://www.arkivdigital.se/aid/show/${v}` : null;
  }
  return null;
}
