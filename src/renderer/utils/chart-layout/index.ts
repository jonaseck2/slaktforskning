// Barrel re-export — preserves the exact public API of the original chartLayout.ts.

export type {
  PersonNode,
  BoxLayout,
  Line,
  CollapseButton,
  PlaceholderBox,
  ChartLayout,
  PedigreeTree,
  DescendantNode,
  HourglassTree,
  BarLayout,
  TickMark,
  TimelineLayout,
  TimelineEntry,
} from './types';

export { BOX_W, BOX_H, V_GAP, H_GAP, GEN_GAP } from './constants';
export { yearFromDate, maxDescendantDepth } from './utils';
export { computePedigreeLayout } from './pedigree';
export { computeHourglassLayout } from './hourglass';
export { computeTimelineLayout } from './timeline';
export { computeDescendantLayout } from './descendant';
