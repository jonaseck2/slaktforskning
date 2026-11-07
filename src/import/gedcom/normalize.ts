/**
 * GEDCOM 7.0 → 5.5.1 normalization layer.
 *
 * Converts a parsed GEDCOM 7.0 node tree into 5.5.1-compatible form so that
 * the shared import-core can handle both versions without branching.
 *
 * All transformations operate on the parsed GedcomNode[] tree in memory.
 * Returns the original nodes unchanged unless the major version is 7.
 */

import type { GedcomNode } from '../../gedcom/parser';
import { gedcomMajor, type GedcomVersion } from './detect';
import { getChild } from './node-utils';
import { markConsumed, recordOrigin } from './tag-accounting';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Every node this module builds goes through `derive`, so marking the copy marks
 * the parsed node it came from (`CLAUDE.md` Prime Directive (cont.) clause 1).
 * O(1): one spread and one WeakMap write.
 */
function derive(origin: GedcomNode, patch: Partial<GedcomNode>): GedcomNode {
  const result = { ...origin, ...patch };
  recordOrigin(result, origin);
  return result;
}

// ── Transformation 1: SNOTE pointer → inline NOTE ───────────────────────────

/**
 * Build a map from SNOTE xref (e.g. "@N1@") → resolved text (concatenating CONT children).
 * Top-level SNOTE records are then removed from the tree.
 */
function buildSnoteMap(nodes: GedcomNode[]): Map<string, string> {
  const snoteMap = new Map<string, string>();
  for (const node of nodes) {
    if (node.tag === 'SNOTE' && node.xref) {
      // The record's text is read here. Its children (LANG, TRAN, ...) are not:
      // they stay unmarked unless a phase reads them from the original tree.
      markConsumed(node);
      // The parser already folds CONT into node.value via newlines
      snoteMap.set(node.xref, node.value ?? '');
    }
  }
  return snoteMap;
}

/**
 * Recursively replace SNOTE pointer sub-nodes with inline NOTE nodes.
 */
function inlineSnotes(node: GedcomNode, snoteMap: Map<string, string>): GedcomNode {
  const newChildren: GedcomNode[] = [];
  for (const child of node.children) {
    if (child.tag === 'SNOTE' && child.value.startsWith('@') && child.value.endsWith('@')) {
      const text = snoteMap.get(child.value) ?? '';
      newChildren.push(derive(child, {
        level: child.level,
        xref: null,
        tag: 'NOTE',
        value: text,
        children: [],
      }));
    } else {
      newChildren.push(inlineSnotes(child, snoteMap));
    }
  }
  return derive(node, { children: newChildren });
}

// ── Transformation 2: EXID → synthetic REFN ─────────────────────────────────

/**
 * Convert EXID sub-nodes on INDI records to REFN sub-nodes.
 * The optional TYPE child becomes a REFN TYPE child.
 */
function convertExidToRefn(node: GedcomNode): GedcomNode {
  if (node.tag !== 'INDI') return node;
  const newChildren: GedcomNode[] = [];
  for (const child of node.children) {
    if (child.tag === 'EXID') {
      const typeNode = getChild(child, 'TYPE');
      const refnChildren: GedcomNode[] = [];
      if (typeNode) {
        refnChildren.push(derive(typeNode, {
          level: child.level + 1,
          xref: null,
          tag: 'TYPE',
          value: typeNode.value,
          children: [],
        }));
      }
      // Other EXID children are not carried. They stay unmarked and are reported.
      newChildren.push(derive(child, {
        level: child.level,
        xref: null,
        tag: 'REFN',
        value: child.value,
        children: refnChildren,
      }));
    } else {
      newChildren.push(child);
    }
  }
  return derive(node, { children: newChildren });
}

// ── Transformation 3: TRAN → additional NAME node — REMOVED (T07) ──────────
//
// Previously expanded NAME/TRAN into extra NAME nodes (typed 'aka'). T07
// moved NAME/TRAN into first-class name_translations rows handled by
// phases/translations.ts against ctx.originalTree. Removing the expansion
// here ensures phaseIndividuals doesn't create duplicate person_names rows
// from the translations.

// ── Transformation 4: Uppercase TYPE/PEDI values → lowercase ────────────────

function lowercaseTypeValues(node: GedcomNode): GedcomNode {
  let newValue = node.value;
  if (node.tag === 'TYPE' || node.tag === 'PEDI' || node.tag === 'RESN') {
    newValue = node.value.toLowerCase();
  }
  const newChildren = node.children.map(lowercaseTypeValues);
  if (newValue === node.value && newChildren === node.children) return node;
  return derive(node, { value: newValue, children: newChildren });
}

// ── Transformation 5: Drop CONC nodes ───────────────────────────────────────
// GEDCOM 7.0 reserves CONC (parser already folds them, but handle any stragglers)

function dropConcNodes(node: GedcomNode): GedcomNode {
  const newChildren = node.children
    .filter(c => c.tag !== 'CONC')
    .map(dropConcNodes);
  return derive(node, { children: newChildren });
}

// ── Transformation 6: PHRASE under DATE → date_original fallback ─────────────

/**
 * If a DATE node has a PHRASE child and its value is empty/unknown,
 * set the DATE value to the PHRASE text so import-core picks it up as date_original.
 */
function applyDatePhrase(node: GedcomNode): GedcomNode {
  const newChildren: GedcomNode[] = node.children.map(child => {
    if (child.tag === 'DATE') {
      // Plain find, not the marking getChild: a PHRASE whose text is dropped
      // because the DATE already has a value must stay unmarked and be reported.
      const phraseNode = child.children.find(c => c.tag === 'PHRASE');
      if (phraseNode && phraseNode.value) {
        const dateVal = child.value.trim();
        if (!dateVal || dateVal.toUpperCase() === 'UNKNOWN') {
          // Replace the DATE value with the phrase text
          markConsumed(phraseNode);
          return derive(child, { value: phraseNode.value });
        }
      }
      return applyDatePhrase(child);
    }
    return applyDatePhrase(child);
  });
  return derive(node, { children: newChildren });
}

// ── Transformation 7: Multiple GIVN/SURN → concatenate ──────────────────────

/**
 * If a NAME node has multiple GIVN or SURN children, merge them into one each.
 */
function mergeMultipleGivnSurn(node: GedcomNode): GedcomNode {
  if (node.tag !== 'NAME') {
    return derive(node, { children: node.children.map(mergeMultipleGivnSurn) });
  }
  // Plain filter, not the marking getChildren: marking every duplicate would mark
  // the 2nd..nth GIVN/SURN. Only the first is carried (as the merged node), so the
  // others stay unmarked and are reported.
  const givnNodes = node.children.filter(c => c.tag === 'GIVN');
  const surnNodes = node.children.filter(c => c.tag === 'SURN');
  if (givnNodes.length <= 1 && surnNodes.length <= 1) {
    return derive(node, { children: node.children.map(mergeMultipleGivnSurn) });
  }

  const newChildren: GedcomNode[] = [];
  let givnAdded = false;
  let surnAdded = false;
  for (const child of node.children) {
    if (child.tag === 'GIVN') {
      if (!givnAdded && givnNodes.length > 1) {
        newChildren.push(derive(child, {
          value: givnNodes.map(g => g.value).join(' '),
        }));
        givnAdded = true;
      } else if (givnNodes.length === 1) {
        newChildren.push(child);
      }
      // skip duplicates
    } else if (child.tag === 'SURN') {
      if (!surnAdded && surnNodes.length > 1) {
        newChildren.push(derive(child, {
          value: surnNodes.map(s => s.value).join(' '),
        }));
        surnAdded = true;
      } else if (surnNodes.length === 1) {
        newChildren.push(child);
      }
      // skip duplicates
    } else {
      newChildren.push(mergeMultipleGivnSurn(child));
    }
  }
  return derive(node, { children: newChildren });
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Normalize a parsed GEDCOM node tree from 7.0 conventions to 5.5.1-compatible form.
 * Returns the input unchanged unless the major version is 7 (semver: 7.0.x and
 * 7.1 are compatible with 7.0, see `detect.ts`).
 */
export function normalizeForImport(nodes: GedcomNode[], version: GedcomVersion): GedcomNode[] {
  if (gedcomMajor(version) !== 7) return nodes;

  // 1. Build SNOTE map and remove top-level SNOTE records
  const snoteMap = buildSnoteMap(nodes);
  let working = nodes
    .filter(n => n.tag !== 'SNOTE')
    .map(n => inlineSnotes(n, snoteMap));

  // 2–7: Apply remaining transformations
  working = working.map(n => {
    n = convertExidToRefn(n);
    // T07: previously expanded NAME/TRAN into extra NAME nodes (typed 'aka').
    // Now NAME/TRAN is a first-class name_translations row, handled by
    // phaseTranslations against ctx.originalTree. Do NOT expand.
    n = lowercaseTypeValues(n);
    n = dropConcNodes(n);
    n = applyDatePhrase(n);
    n = mergeMultipleGivnSurn(n);
    return n;
  });

  return working;
}
