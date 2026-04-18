// Barrel re-export — preserves the exact public API of the original chartLayout.ts.

export type {
  PersonNode,
  BoxLayout,
  Line,
  CollapseButton,
  PlaceholderBox,
  TreePerson,
  ChartLayout,
  PedigreeTree,
  DescendantNode,
  HourglassTree,
  BarLayout,
  TickMark,
  TimelineLayout,
  TimelineEntry,
  EventMarker,
} from './types';

export { BOX_W, MIN_BOX_H, V_GAP, H_GAP, GEN_GAP, PAD, PORTRAIT_W, PORTRAIT_H, BOX_PAD_Y, BOX_PAD_X_LEFT, PORTRAIT_GAP, BOX_PAD_X_RIGHT, CURVE_R, TEXT_AREA_W } from './constants';
export { wrapName, measureBoxHeight } from './measure';
export { curvedElbow } from './connectors';
export { yearFromDate, maxDescendantDepth } from './utils';
export { computePedigreeLayout } from './pedigree';
export { computeHourglassLayout, maxDescendantDepthTP } from './hourglass';
export { computeTimelineLayout, eventSymbol } from './timeline';
export { computeDescendantLayout } from './descendant';
export { buildHourglassTree, buildPedigreeTreePerson, buildDescendantTreePerson, injectOutlines, PLACEHOLDER_PREFIX } from './hourglass-tree';
export type { FanSegment, ArcSpan, FanLayoutOptions } from '../fanLayout';
