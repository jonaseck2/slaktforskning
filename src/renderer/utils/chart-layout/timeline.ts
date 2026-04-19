// Timeline chart layout algorithm.

import type { TimelineEntry, TimelineLayout, BarLayout, TickMark, EventMarker } from './types';
import { yearFromDate } from './utils';

const TL_LEFT_MARGIN = 164;
const TL_RIGHT_MARGIN = 30;
const TL_TOP_PAD = 20;
const TL_BAR_H = 22;
const TL_ROW_H = 36;
const TL_DEFAULT_W = 800;
const TL_AXIS_H = 30;

const EVENT_SYMBOLS: Record<string, string> = {
  birth: '★',
  death: '†',
  marriage: '♥',
  divorce: '✕',
  christening: '✝',
  burial: '⚰',
};
const DEFAULT_SYMBOL = '◆';

export function eventSymbol(eventType: string): string {
  return EVENT_SYMBOLS[eventType] ?? DEFAULT_SYMBOL;
}

export function computeTimelineLayout(
  entries: TimelineEntry[],
  currentYear: number,
  containerWidth?: number,
): TimelineLayout {
  const svgW = containerWidth && containerWidth > 400 ? containerWidth : TL_DEFAULT_W;

  const years = entries
    .flatMap(e => [yearFromDate(e.person.birthDate), yearFromDate(e.person.deathDate)])
    .filter((y): y is number => y !== null);

  let minYear: number;
  let maxYear: number;
  if (years.length === 0) {
    minYear = currentYear - 50;
    maxYear = currentYear;
  } else if (years.length === 1) {
    minYear = years[0] - 10;
    maxYear = Math.max(currentYear, years[0] + 10);
  } else {
    minYear = Math.min(...years) - 5;
    maxYear = Math.max(...years, currentYear) + 5;
  }

  // Pick tick step so labels don't overlap at the current width. Candidates step
  // through nice year intervals; choose the smallest whose on-screen spacing is
  // >= MIN_TICK_PX for the current pixel-per-year scale.
  const MIN_TICK_PX = 48;
  const TICK_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
  const rawChartW = Math.max(1, (containerWidth && containerWidth > 400 ? containerWidth : TL_DEFAULT_W) - TL_LEFT_MARGIN - TL_RIGHT_MARGIN);
  const span = Math.max(1, maxYear - minYear);
  const pxPerYear = rawChartW / span;
  const tickStep = TICK_STEPS.find(s => s * pxPerYear >= MIN_TICK_PX) ?? 1000;

  minYear = Math.floor(minYear / tickStep) * tickStep;
  maxYear = Math.ceil(maxYear / tickStep) * tickStep;

  const sorted = [...entries].sort((a, b) => {
    const ay = yearFromDate(a.person.birthDate) ?? Infinity;
    const by = yearFromDate(b.person.birthDate) ?? Infinity;
    return ay - by;
  });

  const chartW = svgW - TL_LEFT_MARGIN - TL_RIGHT_MARGIN;
  const scale = chartW / (maxYear - minYear);
  const xOfYear = (year: number) => TL_LEFT_MARGIN + (year - minYear) * scale;

  const bars: BarLayout[] = sorted.map((entry, i) => {
    const birthYear = yearFromDate(entry.person.birthDate);
    const deathYear = yearFromDate(entry.person.deathDate);
    const isOpen = deathYear === null;
    const hasNoDate = birthYear === null;
    const startYear = birthYear ?? minYear;
    const endYear = isOpen ? currentYear : (deathYear ?? currentYear);
    const x = xOfYear(startYear);
    const endX = xOfYear(endYear);

    // Compute event markers
    const markers: EventMarker[] = [];
    if (entry.events) {
      for (const evt of entry.events) {
        const evtYear = yearFromDate(evt.date_value);
        if (evtYear !== null && evtYear >= startYear && evtYear <= endYear) {
          markers.push({
            x: xOfYear(evtYear),
            eventType: evt.event_type,
            year: evtYear,
            symbol: eventSymbol(evt.event_type),
          });
        }
      }
    }

    return {
      person: entry.person,
      isFocal: entry.isFocal,
      x, y: TL_TOP_PAD + i * TL_ROW_H,
      w: Math.max(endX - x, 4),
      h: TL_BAR_H,
      isOpen,
      hasNoDate,
      markers,
    };
  });

  const ticks: TickMark[] = [];
  for (let y = minYear; y <= maxYear; y += tickStep) {
    ticks.push({ x: xOfYear(y), year: y });
  }

  const axisY = TL_TOP_PAD + sorted.length * TL_ROW_H + 10;
  const todayX = xOfYear(currentYear);
  const svgHeight = axisY + TL_AXIS_H;

  return { bars, ticks, todayX, svgWidth: svgW, svgHeight, axisY };
}
