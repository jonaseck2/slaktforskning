/**
 * Composable for arrow-key traversal of family trees in chart views.
 *
 * Works with the ahnentafel-indexed PedigreeTree:
 *   1 = focal, 2 = father, 3 = mother, 4 = pat.grandfather, ...
 *
 * Arrow keys:
 *   Up    → father  (ahnNum * 2)
 *   Down  → child   (floor(ahnNum / 2)), or first child in descendant tree
 *   Left  → mother  (ahnNum * 2 + 1), or previous sibling
 *   Right → spouse / next sibling
 *   Enter → open person detail
 *   Space → expand/collapse subtree
 */

import { ref, type Ref } from 'vue';
import type { PedigreeTree, PersonNode, HourglassTree, DescendantNode } from '../utils/chart-layout';
import { narrateChartNode, narrateChartBoundary, type ChartNodeData } from '../utils/screenReaderNarration';

type T = (key: string, params?: Record<string, string | number>) => string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function personName(node: PersonNode): string {
  return [node.givenName, node.surname].filter(Boolean).join(' ') || '?';
}

function personSummary(node: PersonNode): string {
  const parts: string[] = [];
  if (node.birthDate) parts.push('* ' + node.birthDate);
  if (node.deathDate) parts.push('\u2020 ' + node.deathDate);
  return parts.join(', ');
}

function ahnentafelGeneration(ahnNum: number): number {
  return Math.floor(Math.log2(ahnNum)) + 1;
}

function relationshipLabel(ahnNum: number, t: T): string {
  // Common ahnentafel positions
  switch (ahnNum) {
    case 1: return t('screenReader.chartFocusPerson', { name: '', summary: '' }).split(':')[0];
    case 2: return t('screenReader.chartFather', { name: '', summary: '' }).split(':')[0];
    case 3: return t('screenReader.chartMother', { name: '', summary: '' }).split(':')[0];
    default: {
      // Build path description from ahnentafel
      const gen = ahnentafelGeneration(ahnNum);
      const parts: string[] = [];
      let n = ahnNum;
      while (n > 1) {
        parts.unshift(n % 2 === 0 ? 'father' : 'mother');
        n = Math.floor(n / 2);
      }
      // For deep ancestors, just note the generation
      if (gen <= 3) return parts.join("'s ");
      return `Generation ${gen} ancestor`;
    }
  }
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export interface ChartNavigationOptions {
  speak: (text: string) => void;
  t: T;
  onNavigate?: (personId: string) => void;
  onFocusChanged?: (personId: string) => void;
}

export interface ChartCursor {
  /** Ahnentafel number in pedigree tree (1=focal, 2=father, 3=mother, ...) */
  ahnNum: number;
  /** If navigating descendants (hourglass), the path of child indices from focal */
  descendantPath: number[] | null;
  /** If on a sibling, the sibling index */
  siblingIndex: number | null;
  /** If on a spouse, the spouse index */
  spouseIndex: number | null;
}

export function useChartNavigation(options: ChartNavigationOptions) {
  const { speak, t, onNavigate, onFocusChanged } = options;

  const cursor: Ref<ChartCursor | null> = ref(null);
  const pedigreeTree: Ref<PedigreeTree | null> = ref(null);
  const hourglassTree: Ref<HourglassTree | null> = ref(null);

  // ------ Narration helpers ------

  function narrateNode(node: PersonNode, ahnNum: number): void {
    const gen = ahnentafelGeneration(ahnNum);
    const data: ChartNodeData = {
      name: personName(node),
      summary: personSummary(node),
      relationship: relationshipLabel(ahnNum, t),
      generation: gen,
      childCount: countChildren(ahnNum),
    };
    const text = narrateChartNode(data, t);
    speak(text);
  }

  function narrateDescendantNode(node: PersonNode, _label: string): void {
    speak(t('screenReader.chartChild', { name: personName(node), summary: personSummary(node) }));
  }

  function narrateSiblingNode(node: PersonNode): void {
    speak(t('screenReader.chartSibling', { name: personName(node), summary: personSummary(node) }));
  }

  function narrateSpouseNode(node: PersonNode): void {
    speak(t('screenReader.chartSpouse', { name: personName(node), summary: personSummary(node) }));
  }

  function countChildren(ahnNum: number): number {
    if (!pedigreeTree.value) return 0;
    // In a pedigree tree, "children" at a given position means
    // the node that has this ahnNum as parent (ahnNum/2).
    // But since the pedigree tree is ancestors-only, childCount isn't
    // directly meaningful except for the focal person.
    if (ahnNum === 1 && hourglassTree.value?.descendantRoot) {
      return hourglassTree.value.descendantRoot.children.length;
    }
    return 0;
  }

  // ------ Current node resolution ------

  function currentPersonId(): string | null {
    const c = cursor.value;
    if (!c) return null;

    // Spouse
    if (c.spouseIndex !== null && hourglassTree.value) {
      const spouse = hourglassTree.value.spouses[c.spouseIndex];
      return spouse?.id ?? null;
    }

    // Sibling
    if (c.siblingIndex !== null && hourglassTree.value?.siblings) {
      const sibling = hourglassTree.value.siblings[c.siblingIndex];
      return sibling?.id ?? null;
    }

    // Descendant
    if (c.descendantPath !== null && hourglassTree.value) {
      const node = resolveDescendantNode(hourglassTree.value.descendantRoot, c.descendantPath);
      return node?.person.id ?? null;
    }

    // Ancestor (pedigree)
    const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
    if (!tree) return null;
    const node = tree.nodes.get(c.ahnNum);
    return node?.id ?? null;
  }

  function resolveDescendantNode(
    root: DescendantNode,
    path: number[],
  ): DescendantNode | null {
    let current = root;
    for (const idx of path) {
      if (idx < 0 || idx >= current.children.length) return null;
      current = current.children[idx];
    }
    return current;
  }

  // ------ Cursor movement ------

  function moveCursorAndAnnounce(newCursor: ChartCursor): void {
    cursor.value = newCursor;
    const pid = currentPersonId();
    if (pid) onFocusChanged?.(pid);
  }

  function initPedigree(tree: PedigreeTree): void {
    pedigreeTree.value = tree;
    const focalNode = tree.nodes.get(1);
    if (focalNode) {
      cursor.value = { ahnNum: 1, descendantPath: null, siblingIndex: null, spouseIndex: null };
      onFocusChanged?.(focalNode.id);
    }
  }

  function initHourglass(tree: HourglassTree): void {
    hourglassTree.value = tree;
    pedigreeTree.value = tree.ancestors;
    const focalNode = tree.ancestors.nodes.get(1);
    if (focalNode) {
      cursor.value = { ahnNum: 1, descendantPath: null, siblingIndex: null, spouseIndex: null };
      onFocusChanged?.(focalNode.id);
    }
  }

  function setCursorToPersonId(personId: string): void {
    // Search pedigree tree for a node with matching person id
    const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
    if (tree) {
      for (const [ahnNum, node] of tree.nodes) {
        if (node.id === personId) {
          cursor.value = { ahnNum, descendantPath: null, siblingIndex: null, spouseIndex: null };
          return;
        }
      }
    }
    // Search hourglass spouses
    if (hourglassTree.value) {
      const si = hourglassTree.value.spouses.findIndex(s => s.id === personId);
      if (si >= 0) {
        cursor.value = { ahnNum: 1, descendantPath: null, siblingIndex: null, spouseIndex: si };
        return;
      }
      // Search siblings
      const sibi = hourglassTree.value.siblings?.findIndex(s => s.id === personId) ?? -1;
      if (sibi >= 0) {
        cursor.value = { ahnNum: 1, descendantPath: null, siblingIndex: sibi, spouseIndex: null };
        return;
      }
    }
  }

  // ------ Arrow key movement ------

  function moveUp(): void {
    const c = cursor.value;
    if (!c) return;

    // If in descendant tree, move up toward focal
    if (c.descendantPath !== null && c.descendantPath.length > 0) {
      const newPath = c.descendantPath.slice(0, -1);
      const newCursor: ChartCursor = {
        ahnNum: 1,
        descendantPath: newPath.length > 0 ? newPath : null,
        siblingIndex: null,
        spouseIndex: null,
      };
      moveCursorAndAnnounce(newCursor);
      // Narrate
      if (newPath.length === 0) {
        // Back to focal
        const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
        const focalNode = tree?.nodes.get(1);
        if (focalNode) narrateNode(focalNode, 1);
      } else if (hourglassTree.value) {
        const node = resolveDescendantNode(hourglassTree.value.descendantRoot, newPath);
        if (node) narrateDescendantNode(node.person, 'parent');
      }
      return;
    }

    // If on a sibling or spouse, move to focal
    if (c.siblingIndex !== null || c.spouseIndex !== null) {
      const newCursor: ChartCursor = { ahnNum: 1, descendantPath: null, siblingIndex: null, spouseIndex: null };
      moveCursorAndAnnounce(newCursor);
      const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
      const focalNode = tree?.nodes.get(1);
      if (focalNode) narrateNode(focalNode, 1);
      return;
    }

    // In pedigree tree: up = father (ahnNum * 2)
    const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
    if (!tree) return;

    const fatherAhn = c.ahnNum * 2;
    const fatherNode = tree.nodes.get(fatherAhn);
    if (fatherNode) {
      const newCursor: ChartCursor = { ahnNum: fatherAhn, descendantPath: null, siblingIndex: null, spouseIndex: null };
      moveCursorAndAnnounce(newCursor);
      narrateNode(fatherNode, fatherAhn);
    } else {
      speak(narrateChartBoundary('father', t));
    }
  }

  function moveDown(): void {
    const c = cursor.value;
    if (!c) return;

    // If on a sibling or spouse, ignore down
    if (c.siblingIndex !== null || c.spouseIndex !== null) {
      speak(narrateChartBoundary('children', t));
      return;
    }

    // If in descendant tree, go to first child
    if (c.descendantPath !== null && hourglassTree.value) {
      const node = resolveDescendantNode(hourglassTree.value.descendantRoot, c.descendantPath);
      if (node && node.children.length > 0) {
        const newPath = [...c.descendantPath, 0];
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: newPath, siblingIndex: null, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        narrateDescendantNode(node.children[0].person, 'child');
      } else {
        speak(narrateChartBoundary('children', t));
      }
      return;
    }

    // In pedigree tree: down = child (floor(ahnNum / 2))
    if (c.ahnNum > 1) {
      const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
      if (!tree) return;
      const childAhn = Math.floor(c.ahnNum / 2);
      const childNode = tree.nodes.get(childAhn);
      if (childNode) {
        const newCursor: ChartCursor = { ahnNum: childAhn, descendantPath: null, siblingIndex: null, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        narrateNode(childNode, childAhn);
      }
      return;
    }

    // At focal (ahnNum === 1): go to first descendant child if hourglass
    if (c.ahnNum === 1 && hourglassTree.value) {
      const root = hourglassTree.value.descendantRoot;
      if (root.children.length > 0) {
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: [0], siblingIndex: null, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        narrateDescendantNode(root.children[0].person, 'child');
      } else {
        speak(narrateChartBoundary('children', t));
      }
      return;
    }

    speak(narrateChartBoundary('children', t));
  }

  function moveLeft(): void {
    const c = cursor.value;
    if (!c) return;

    // If on a spouse, move to previous spouse or back to focal
    if (c.spouseIndex !== null) {
      if (c.spouseIndex > 0) {
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: null, siblingIndex: null, spouseIndex: c.spouseIndex - 1 };
        moveCursorAndAnnounce(newCursor);
        if (hourglassTree.value) {
          narrateSpouseNode(hourglassTree.value.spouses[c.spouseIndex - 1]);
        }
      } else {
        // Back to focal
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: null, siblingIndex: null, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
        const focalNode = tree?.nodes.get(1);
        if (focalNode) narrateNode(focalNode, 1);
      }
      return;
    }

    // If on a sibling, move to previous sibling or back to focal
    if (c.siblingIndex !== null) {
      if (c.siblingIndex > 0) {
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: null, siblingIndex: c.siblingIndex - 1, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        if (hourglassTree.value?.siblings) {
          narrateSiblingNode(hourglassTree.value.siblings[c.siblingIndex - 1]);
        }
      } else {
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: null, siblingIndex: null, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
        const focalNode = tree?.nodes.get(1);
        if (focalNode) narrateNode(focalNode, 1);
      }
      return;
    }

    // If in descendant tree, move to previous sibling in same level
    if (c.descendantPath !== null && c.descendantPath.length > 0 && hourglassTree.value) {
      const lastIdx = c.descendantPath[c.descendantPath.length - 1];
      if (lastIdx > 0) {
        const newPath = [...c.descendantPath.slice(0, -1), lastIdx - 1];
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: newPath, siblingIndex: null, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        const node = resolveDescendantNode(hourglassTree.value.descendantRoot, newPath);
        if (node) narrateDescendantNode(node.person, 'sibling');
      }
      return;
    }

    // In pedigree tree: left = mother (ahnNum * 2 + 1)
    const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
    if (!tree) return;

    const motherAhn = c.ahnNum * 2 + 1;
    const motherNode = tree.nodes.get(motherAhn);
    if (motherNode) {
      const newCursor: ChartCursor = { ahnNum: motherAhn, descendantPath: null, siblingIndex: null, spouseIndex: null };
      moveCursorAndAnnounce(newCursor);
      narrateNode(motherNode, motherAhn);
    } else {
      speak(narrateChartBoundary('mother', t));
    }
  }

  function moveRight(): void {
    const c = cursor.value;
    if (!c) return;

    // If on a spouse, move to next spouse
    if (c.spouseIndex !== null && hourglassTree.value) {
      const nextIdx = c.spouseIndex + 1;
      if (nextIdx < hourglassTree.value.spouses.length) {
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: null, siblingIndex: null, spouseIndex: nextIdx };
        moveCursorAndAnnounce(newCursor);
        narrateSpouseNode(hourglassTree.value.spouses[nextIdx]);
      }
      return;
    }

    // If on a sibling, move to next sibling
    if (c.siblingIndex !== null && hourglassTree.value?.siblings) {
      const nextIdx = c.siblingIndex + 1;
      if (nextIdx < hourglassTree.value.siblings.length) {
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: null, siblingIndex: nextIdx, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        narrateSiblingNode(hourglassTree.value.siblings[nextIdx]);
      }
      return;
    }

    // If in descendant tree, move to next sibling in same level
    if (c.descendantPath !== null && c.descendantPath.length > 0 && hourglassTree.value) {
      const parentPath = c.descendantPath.slice(0, -1);
      const lastIdx = c.descendantPath[c.descendantPath.length - 1];
      const parentNode = resolveDescendantNode(hourglassTree.value.descendantRoot, parentPath);
      if (parentNode && lastIdx + 1 < parentNode.children.length) {
        const newPath = [...parentPath, lastIdx + 1];
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: newPath, siblingIndex: null, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        const node = resolveDescendantNode(hourglassTree.value.descendantRoot, newPath);
        if (node) narrateDescendantNode(node.person, 'sibling');
      }
      return;
    }

    // At focal: right = spouse (hourglass) or siblings
    if (c.ahnNum === 1) {
      if (hourglassTree.value && hourglassTree.value.spouses.length > 0) {
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: null, siblingIndex: null, spouseIndex: 0 };
        moveCursorAndAnnounce(newCursor);
        narrateSpouseNode(hourglassTree.value.spouses[0]);
        return;
      }
      // Try siblings
      if (hourglassTree.value?.siblings && hourglassTree.value.siblings.length > 0) {
        const newCursor: ChartCursor = { ahnNum: 1, descendantPath: null, siblingIndex: 0, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        narrateSiblingNode(hourglassTree.value.siblings[0]);
        return;
      }
      speak(narrateChartBoundary('spouse', t));
      return;
    }

    // In pedigree: at a parent node, right = spouse (the other parent at the same level)
    // Father (even) → Mother (odd) of same child: ahnNum ^ 1 toggles last bit
    const siblingAhn = c.ahnNum % 2 === 0 ? c.ahnNum + 1 : c.ahnNum - 1;
    const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
    if (tree) {
      const siblingNode = tree.nodes.get(siblingAhn);
      if (siblingNode) {
        const newCursor: ChartCursor = { ahnNum: siblingAhn, descendantPath: null, siblingIndex: null, spouseIndex: null };
        moveCursorAndAnnounce(newCursor);
        narrateNode(siblingNode, siblingAhn);
        return;
      }
    }
    // If current is father, no mother
    if (c.ahnNum % 2 === 0) {
      speak(narrateChartBoundary('mother', t));
    } else {
      speak(narrateChartBoundary('father', t));
    }
  }

  // ------ Key handler ------

  function handleKeydown(event: KeyboardEvent): boolean {
    if (!cursor.value) return false;

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        moveUp();
        return true;
      case 'ArrowDown':
        event.preventDefault();
        moveDown();
        return true;
      case 'ArrowLeft':
        event.preventDefault();
        moveLeft();
        return true;
      case 'ArrowRight':
        event.preventDefault();
        moveRight();
        return true;
      case 'Enter': {
        event.preventDefault();
        const pid = currentPersonId();
        if (pid) {
          const tree = pedigreeTree.value ?? hourglassTree.value?.ancestors;
          const node = tree?.nodes.get(cursor.value.ahnNum);
          const name = node ? personName(node) : '';
          if (name) speak(t('screenReader.chartOpening', { name }));
          onNavigate?.(pid);
        }
        return true;
      }
      default:
        return false;
    }
  }

  // ------ Public API ------

  return {
    cursor,
    currentPersonId,
    initPedigree,
    initHourglass,
    setCursorToPersonId,
    handleKeydown,
    moveUp,
    moveDown,
    moveLeft,
    moveRight,
  };
}
