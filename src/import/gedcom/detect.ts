import type { GedcomNode } from '../../gedcom/parser';
import { getChild } from './node-utils';

/**
 * The version string the file declares in `HEAD.GEDC.VERS` (trimmed), or
 * `'unknown'` when it is missing, malformed, or of an unsupported major.
 * The import report shows this string as-is, so a `5.5` file reads `GEDCOM 5.5`.
 */
export type GedcomVersion = string;

/**
 * Semver: the same major is compatible, a new major is not. `7.0.13` is a patch
 * of 7.0 and `7.1` extends 7, so both import as 7. Supporting major 8 later is
 * one number here plus the transformations its spec needs in `normalize.ts`.
 */
const SUPPORTED_MAJORS = new Set([5, 7]);

const VERSION_RE = /^(\d+)\.(\d+)(?:\.(\d+))?$/;

function parseMajor(v: string): number | null {
  const m = VERSION_RE.exec(v);
  return m ? Number(m[1]) : null;
}

/** The major version of a detected version, or `null` for `'unknown'`. */
export function gedcomMajor(v: GedcomVersion): number | null {
  return parseMajor(v);
}

export function detectGedcomVersion(nodes: GedcomNode[]): GedcomVersion {
  // Top-level HEAD is a record, found in the root array; getChild marks the
  // GEDC and VERS nodes it reads, so they are accounted for inside the session.
  const head = nodes.find(n => n.tag === 'HEAD');
  if (!head) return 'unknown';
  const gedc = getChild(head, 'GEDC');
  if (!gedc) return 'unknown';
  const vers = getChild(gedc, 'VERS');
  if (!vers) return 'unknown';
  const v = vers.value.trim();
  const major = parseMajor(v);
  return major !== null && SUPPORTED_MAJORS.has(major) ? v : 'unknown';
}
