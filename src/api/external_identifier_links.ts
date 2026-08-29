/**
 * Render-time resolution of an `external_identifiers` row to a URL.
 *
 * **Prime Directive:** the result is computed on every render and never written
 * back. The DB stores what the import file said — `v191316.b580.s52` — and
 * nothing else. If ArkivDigital changes its URL shape, this function changes
 * and every stored pointer resolves correctly the next time it is drawn.
 *
 * Anchored patterns only: the value is a field, not prose. `src/api/link-rules/`
 * is the free-text linkifier, a different mechanism with different risks — its
 * ArkivDigital rule requires a literal `AID:` prefix and matches inside running
 * text, which is wrong for a stored identifier.
 */

/** `v<volume>.b<image>` with an optional `.s<page>` the URL does not carry. */
const AD_IMAGE = /^v(\d+)\.b(\d+)(?:\.s\d+)?$/;
const AD_VOLUME = /^v(\d+)$/;

export function resolveExternalIdentifierUrl(system: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (system === 'arkivdigital.image') {
    const m = AD_IMAGE.exec(v);
    return m ? `https://app.arkivdigital.se/volume/v${m[1]}?image=${m[2]}` : null;
  }
  if (system === 'arkivdigital') {
    const m = AD_VOLUME.exec(v);
    return m ? `https://app.arkivdigital.se/volume/v${m[1]}` : null;
  }
  return null;
}
