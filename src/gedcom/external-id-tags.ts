/**
 * The two tag shapes that carry an `external_identifiers` row through a GEDCOM
 * file, as pure functions. Nothing else in the exporter or the importer emits
 * or parses these tags by hand.
 *
 * Design: `docs/plans/2026-08-29-external-identifier-roundtrip-design.md`,
 * section "The carrier table".
 *
 * Two shapes, because GEDCOM offers a standard slot in one place and not in
 * the other:
 *
 *   - `source`, `repository` and `media` are records. Both 5.5.1 and 7.0 allow
 *     a reference tag on them, so the identifier rides the standard one —
 *     `REFN` under 5.5.1, `EXID` under 7.0, matching what `person_identifiers`
 *     already emits (`exporter.ts:759`). Another program reading the export
 *     understands the result.
 *   - A citation is a `SOUR` pointer substructure and a `PLAC` block is a
 *     substructure. Neither has a reference slot in either specification, so
 *     both take the custom `_EXID`, identical under both versions.
 *
 * `TYPE` carries the `system` column verbatim. The host record or block
 * carries `entity_type`. Together they reconstruct the row.
 */

import type { ExternalIdentifier, ExternalIdentifierInput } from '../api/external_identifiers';
import type { GedcomNode } from './parser';

/**
 * The `(entity_type, system)` pairs that already have a vendor-shaped tag. A
 * row matching a pair is emitted by its vendor emitter and by nothing else —
 * emitting it twice would put a `REFN` next to a `_AID` in an ArkivDigital
 * file and change what ArkivDigital reads back.
 *
 * **The override is a property of the pair, not of the system.** The design
 * spec's carrier table gives `repository` and `media` a vendor override of
 * "none", so an `arkivdigital` row on a repository and an
 * `arkivdigital.image` row on a media both ride the generic tag. Keying this
 * set on the system alone silently dropped those two cells.
 *
 * Each entry names its emit site, verified 2026-08-29 against the file:
 *   `source`   + `arkivdigital`        → `exporter.ts:427`, `1 _AID` on SOUR
 *   `place`    + `arkivdigital.parish` → `exporter.ts:119`, `_PARISH_AID` in _ADPL
 *   `citation` + `arkivdigital.image`  → `exporter.ts:213`, `_AID` in the SOUR block
 */
export const VENDOR_CARRIED_PAIRS: ReadonlySet<string> = new Set([
  vendorPairKey('source', 'arkivdigital'),
  vendorPairKey('place', 'arkivdigital.parish'),
  vendorPairKey('citation', 'arkivdigital.image'),
]);

/** Key shape for {@link VENDOR_CARRIED_PAIRS}. */
export function vendorPairKey(entityType: string, system: string): string {
  return `${entityType}\u0000${system}`;
}

/**
 * A `REFN`/`EXID`/`_EXID` with no `TYPE` reads back as this system, and a row
 * with this system emits no `TYPE`. Symmetric, so a file that already carried
 * untyped references keeps its exact bytes. Matches the `identifier_type:
 * 'refn'` case in the person emitter (`exporter.ts:761`).
 */
export const UNTYPED_SYSTEM = 'refn';

/**
 * The rows a generic emitter is responsible for: everything a vendor tag does
 * not already carry.
 *
 * The row carries its own `entity_type`, so no caller has to restate where the
 * identifier is attached — which is what keeps the pair rule from drifting
 * apart across the five emit sites.
 */
export function generic(idents: readonly ExternalIdentifier[]): ExternalIdentifier[] {
  return idents.filter(i => !VENDOR_CARRIED_PAIRS.has(vendorPairKey(i.entity_type, i.system)));
}

/**
 * Record-level carrier: `REFN` under 5.5.1, `EXID` under 7.0. Both
 * specifications allow the tag on SOUR, REPO and OBJE records.
 */
export function emitRecordExternalIds(
  lines: string[],
  idents: readonly ExternalIdentifier[],
  level: number,
  version: '5.5.1' | '7.0',
): void {
  const tag = version === '7.0' ? 'EXID' : 'REFN';
  for (const i of generic(idents)) {
    lines.push(`${level} ${tag} ${i.value}`);
    if (i.system !== UNTYPED_SYSTEM) lines.push(`${level + 1} TYPE ${i.system}`);
  }
}

/**
 * Substructure carrier: `_EXID`. A GEDCOM citation is a SOUR pointer
 * substructure and a PLAC block is a substructure — neither has a `REFN` slot
 * in either specification, so the tag is custom and identical under both
 * versions.
 *
 * Vendor-carried pairs are left to their vendor tag. Use
 * {@link emitAllSubstructureExternalIds} where no vendor tag is emitted for
 * the same entity.
 */
export function emitSubstructureExternalIds(
  lines: string[],
  idents: readonly ExternalIdentifier[],
  level: number,
): void {
  emitAllSubstructureExternalIds(lines, generic(idents), level);
}

/**
 * The same `_EXID` shape, emitting **every** row handed to it — vendor-carried
 * pairs included.
 *
 * Correct only where the caller emits no vendor tag for that entity anywhere
 * in the file, because then `generic()` is not keeping two carriers apart, it
 * is deleting the only one. Today that is one site: the top-level `0 @Pn@
 * _PLAC` record, which carries `NAME`, `_PLAC_ID` and the place's citations
 * and no `_ADPL` block, so a parish reachable only through a place-level
 * citation had nowhere to put its `_PARISH_AID` and lost it. Measured
 * 2026-08-29: both `arkivdigital.parish` and `gramps.handle` were dropped.
 *
 * `_PLAC` is a custom level-0 record that ArkivDigital never writes and skips
 * on read, so carrying its vendor pair in `_EXID` here cannot change what
 * ArkivDigital reads back — which is the whole reason the vendor-override rule
 * exists.
 */
export function emitAllSubstructureExternalIds(
  lines: string[],
  idents: readonly ExternalIdentifier[],
  level: number,
): void {
  for (const i of idents) {
    lines.push(`${level} _EXID ${i.value}`);
    if (i.system !== UNTYPED_SYSTEM) lines.push(`${level + 1} TYPE ${i.system}`);
  }
}

/**
 * Read either shape back off a node.
 *
 * `getChild`/`getChildren` are injected rather than imported so this module
 * stays out of an import cycle with `src/import/`. Both mark the nodes they
 * return as consumed (`node-utils.ts`), so a tag read through here is
 * accounted for and cannot show up in `unaccountedFor`.
 */
export function readExternalIds(
  node: GedcomNode,
  tags: readonly string[],
  entity_type: string,
  entity_id: string,
  getChild: (n: GedcomNode, t: string) => GedcomNode | undefined,
  getChildren: (n: GedcomNode, t: string) => GedcomNode[],
): ExternalIdentifierInput[] {
  const out: ExternalIdentifierInput[] = [];
  for (const tag of tags) {
    for (const n of getChildren(node, tag)) {
      const value = n.value.trim();
      if (!value) continue;
      const system = getChild(n, 'TYPE')?.value.trim() || UNTYPED_SYSTEM;
      out.push({ entity_type, entity_id, system, value });
    }
  }
  return out;
}
