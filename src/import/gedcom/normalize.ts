/**
 * GEDCOM 7.0 → 5.5.1 normalization layer.
 *
 * Converts a parsed GEDCOM 7.0 node tree into 5.5.1-compatible form so that
 * the shared import-core can handle both versions without branching.
 *
 * All transformations operate on the parsed GedcomNode[] tree in memory.
 * Returns the original nodes unchanged for non-7.0 versions.
 */

import type { GedcomNode } from '../../gedcom/parser';
import type { GedcomVersion } from './detect';

// ── Helpers ─────────────────────────────────────────────────────────────────

function cloneNode(node: GedcomNode): GedcomNode {
  return {
    level: node.level,
    xref: node.xref,
    tag: node.tag,
    value: node.value,
    children: node.children.map(cloneNode),
  };
}

function getChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter(c => c.tag === tag);
}

function getChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find(c => c.tag === tag);
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
      newChildren.push({
        level: child.level,
        xref: null,
        tag: 'NOTE',
        value: text,
        children: [],
      });
    } else {
      newChildren.push(inlineSnotes(child, snoteMap));
    }
  }
  return { ...node, children: newChildren };
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
        refnChildren.push({
          level: child.level + 1,
          xref: null,
          tag: 'TYPE',
          value: typeNode.value,
          children: [],
        });
      }
      newChildren.push({
        level: child.level,
        xref: null,
        tag: 'REFN',
        value: child.value,
        children: refnChildren,
      });
    } else {
      newChildren.push(child);
    }
  }
  return { ...node, children: newChildren };
}

// ── Transformation 3: TRAN → additional NAME node ───────────────────────────

/**
 * For NAME records with a TRAN child, create an additional NAME node (aka) from TRAN value.
 * Applied recursively so it catches NAME records inside INDI nodes.
 */
function expandNameTran(node: GedcomNode): GedcomNode {
  const newChildren: GedcomNode[] = [];
  for (const child of node.children) {
    newChildren.push(expandNameTran(child));
    if (child.tag === 'NAME') {
      for (const tran of getChildren(child, 'TRAN')) {
        if (tran.value) {
          newChildren.push({
            level: child.level,
            xref: null,
            tag: 'NAME',
            value: tran.value,
            children: [
              {
                level: child.level + 1,
                xref: null,
                tag: 'TYPE',
                value: 'aka',
                children: [],
              },
            ],
          });
        }
      }
    }
  }
  return { ...node, children: newChildren };
}

// ── Transformation 4: Uppercase TYPE/PEDI values → lowercase ────────────────

function lowercaseTypeValues(node: GedcomNode): GedcomNode {
  let newValue = node.value;
  if (node.tag === 'TYPE' || node.tag === 'PEDI' || node.tag === 'RESN') {
    newValue = node.value.toLowerCase();
  }
  const newChildren = node.children.map(lowercaseTypeValues);
  if (newValue === node.value && newChildren === node.children) return node;
  return { ...node, value: newValue, children: newChildren };
}

// ── Transformation 5: Drop CONC nodes ───────────────────────────────────────
// GEDCOM 7.0 reserves CONC (parser already folds them, but handle any stragglers)

function dropConcNodes(node: GedcomNode): GedcomNode {
  const newChildren = node.children
    .filter(c => c.tag !== 'CONC')
    .map(dropConcNodes);
  return { ...node, children: newChildren };
}

// ── Transformation 6: PHRASE under DATE → date_original fallback ─────────────

/**
 * If a DATE node has a PHRASE child and its value is empty/unknown,
 * set the DATE value to the PHRASE text so import-core picks it up as date_original.
 */
function applyDatePhrase(node: GedcomNode): GedcomNode {
  const newChildren: GedcomNode[] = node.children.map(child => {
    if (child.tag === 'DATE') {
      const phraseNode = getChild(child, 'PHRASE');
      if (phraseNode && phraseNode.value) {
        const dateVal = child.value.trim();
        if (!dateVal || dateVal.toUpperCase() === 'UNKNOWN') {
          // Replace the DATE value with the phrase text
          return { ...child, value: phraseNode.value };
        }
      }
      return applyDatePhrase(child);
    }
    return applyDatePhrase(child);
  });
  return { ...node, children: newChildren };
}

// ── Transformation 7: Multiple GIVN/SURN → concatenate ──────────────────────

/**
 * If a NAME node has multiple GIVN or SURN children, merge them into one each.
 */
function mergeMultipleGivnSurn(node: GedcomNode): GedcomNode {
  if (node.tag !== 'NAME') {
    return { ...node, children: node.children.map(mergeMultipleGivnSurn) };
  }
  const givnNodes = getChildren(node, 'GIVN');
  const surnNodes = getChildren(node, 'SURN');
  if (givnNodes.length <= 1 && surnNodes.length <= 1) {
    return { ...node, children: node.children.map(mergeMultipleGivnSurn) };
  }

  const newChildren: GedcomNode[] = [];
  let givnAdded = false;
  let surnAdded = false;
  for (const child of node.children) {
    if (child.tag === 'GIVN') {
      if (!givnAdded && givnNodes.length > 1) {
        newChildren.push({
          ...child,
          value: givnNodes.map(g => g.value).join(' '),
        });
        givnAdded = true;
      } else if (givnNodes.length === 1) {
        newChildren.push(child);
      }
      // skip duplicates
    } else if (child.tag === 'SURN') {
      if (!surnAdded && surnNodes.length > 1) {
        newChildren.push({
          ...child,
          value: surnNodes.map(s => s.value).join(' '),
        });
        surnAdded = true;
      } else if (surnNodes.length === 1) {
        newChildren.push(child);
      }
      // skip duplicates
    } else {
      newChildren.push(mergeMultipleGivnSurn(child));
    }
  }
  return { ...node, children: newChildren };
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Normalize a parsed GEDCOM node tree from 7.0 conventions to 5.5.1-compatible form.
 * Returns the input unchanged for non-7.0 versions.
 */
export function normalizeForImport(nodes: GedcomNode[], version: GedcomVersion): GedcomNode[] {
  if (version !== '7.0') return nodes;

  // 1. Build SNOTE map and remove top-level SNOTE records
  const snoteMap = buildSnoteMap(nodes);
  let working = nodes
    .filter(n => n.tag !== 'SNOTE')
    .map(n => inlineSnotes(n, snoteMap));

  // 2–7: Apply remaining transformations
  working = working.map(n => {
    n = convertExidToRefn(n);
    n = expandNameTran(n);
    n = lowercaseTypeValues(n);
    n = dropConcNodes(n);
    n = applyDatePhrase(n);
    n = mergeMultipleGivnSurn(n);
    return n;
  });

  return working;
}
