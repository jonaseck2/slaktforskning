// Chart layout types — shared across all layout algorithms.

export interface PersonNode {
  id: string;
  givenName: string | null;
  surname: string | null;
  preferredName: string | null;
  nickname: string | null;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  birthDate: string | null;  // ISO date string e.g. "1850-03-15" or partial "1850"
  deathDate: string | null;
}

export interface BoxLayout {
  person: PersonNode;
  isFocal: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CollapseButton {
  personId: string;
  direction: 'up' | 'down' | 'left' | 'right';
  cx: number;
  cy: number;
  isExpanded: boolean;
  isLoadMore?: boolean; // true → click fetches new data; false/absent → toggles visibility
  /** For focal 'down' buttons: which co-parent group this button controls (undefined = non-focal). */
  coParentId?: string | null;
}

export interface PlaceholderBox {
  type: 'placeholder';
  role: 'father' | 'mother' | 'child' | 'spouse';
  /** The person this placeholder is attached to. */
  childPersonId: string;
  x: number;
  y: number;
}

/**
 * Uniform tree node for the hourglass layout.
 * Each person can have N parents, M children, K spouses.
 * The layout algorithm treats all nodes identically — real and placeholder.
 */
export interface TreePerson {
  person: PersonNode;
  parents: TreePerson[];
  children: TreePerson[];
  spouses: TreePerson[];
  isFocal?: boolean;
  /** True for outline placeholder nodes (rendered with dashed style). */
  isPlaceholder?: boolean;
  /** Role of the placeholder relative to its owner. */
  placeholderRole?: 'father' | 'mother' | 'child' | 'spouse';
  /** Person ID this placeholder belongs to. */
  placeholderForPersonId?: string;
  /** Whether more ancestors exist in DB but aren't loaded. */
  hasMoreAncestors?: boolean;
  /** Whether more children exist in DB but aren't loaded. */
  hasMoreChildren?: boolean;
  /** For focal's direct children: which spouse is the co-parent. */
  coParentId?: string | null;
}

export interface ChartLayout {
  boxes: BoxLayout[];
  lines: Line[];
  svgWidth: number;
  svgHeight: number;
  /** Minimum Y coordinate for the viewBox (negative when placeholders extend above boxes). */
  viewBoxMinY: number;
  collapseButtons: CollapseButton[];
  placeholders: PlaceholderBox[];
  placeholderLines: Line[];
}

/**
 * Ahnentafel-indexed ancestor tree.
 * Key 1 = focal, 2 = father, 3 = mother, 4 = pat.grandfather, …
 * `generations` includes focal (e.g. 5 = focal + 4 ancestor levels).
 * `hasMoreAncestors`: ahnentafel keys where parents exist in DB but are not loaded.
 */
export interface PedigreeTree {
  nodes: Map<number, PersonNode>;
  generations: number;
  hasMoreAncestors?: Set<number>;
}

/** Recursive descendant tree node. */
export interface DescendantNode {
  person: PersonNode;
  children: DescendantNode[];
  hasMoreChildren?: boolean; // children exist in DB but not loaded (meaningful at max depth)
  /** Set on focal's direct children only: which of focal's spouses is the other parent (null = none). */
  coParentId?: string | null;
}

/**
 * Hourglass tree: ancestor section (ahnentafel) above focal,
 * descendant tree below, and spouses displayed to the right of focal.
 * `ancestors.generations` = focal + ancestor levels shown above.
 * `descendantGenerations` = levels below focal.
 */
export interface HourglassTree {
  ancestors: PedigreeTree;
  descendantRoot: DescendantNode;
  descendantGenerations: number;
  spouses: PersonNode[];
  siblings?: PersonNode[];
}

export interface BarLayout {
  person: PersonNode;
  isFocal: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  isOpen: boolean;
  hasNoDate: boolean;
}

export interface TickMark {
  x: number;
  year: number;
}

export interface TimelineLayout {
  bars: BarLayout[];
  ticks: TickMark[];
  todayX: number;
  svgWidth: number;
  svgHeight: number;
  axisY: number;
}

export interface TimelineEntry {
  person: PersonNode;
  isFocal: boolean;
}
