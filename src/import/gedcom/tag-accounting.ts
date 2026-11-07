/**
 * Import-time tag accounting session.
 *
 * `CLAUDE.md` Prime Directive (cont.) clause 1: the importer accounts for every
 * node in the parsed tree — a phase reads it, or the report names it. This module
 * holds the "a phase read it" half.
 *
 * Module-scoped rather than threaded through ImportContext because `getChild` /
 * `getChildren` have 211 call sites across 22 files and no access to the context.
 * Marking on read is what makes the accounting impossible to forget: not reading a
 * node is precisely what makes it unaccounted for.
 *
 * One session at a time. `beginAccounting` throws on re-entry rather than merging
 * two imports' node sets, which would let a concurrent import mask a real drop.
 * The multi-file import queue is sequential by design for this reason.
 */
import type { GedcomNode } from '../../gedcom/parser';

let session: Set<GedcomNode> | null = null;
// derived node -> root parsed node. Created and dropped with the session.
let provenance: WeakMap<GedcomNode, GedcomNode> | null = null;

export function beginAccounting(): void {
  if (session !== null) {
    throw new Error('tag accounting: a session is already active — imports must not overlap');
  }
  session = new Set();
  provenance = new WeakMap();
}

export function endAccounting(): Set<GedcomNode> {
  if (session === null) {
    throw new Error('tag accounting: no active session to end');
  }
  const collected = session;
  session = null;
  provenance = null;
  return collected;
}

export function isAccounting(): boolean {
  return session !== null;
}

/**
 * Record that `derived` was built from `origin` (a normalizer's copy of a parsed
 * node). Stores the root origin, so a chain of derivations never grows and
 * `markConsumed` needs one lookup. No-op outside a session.
 */
export function recordOrigin(derived: GedcomNode, origin: GedcomNode): void {
  provenance?.set(derived, provenance.get(origin) ?? origin);
}

/** The parsed node `node` came from, or `node` itself when none is recorded. */
export function originOf(node: GedcomNode): GedcomNode {
  return provenance?.get(node) ?? node;
}

/** No-op when no session is active, so callers never need to check. Also marks the origin. */
export function markConsumed(node: GedcomNode): void {
  if (session === null) return;
  session.add(node);
  const origin = provenance?.get(node);
  if (origin !== undefined) session.add(origin);
}
