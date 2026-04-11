// Timeline chart layout algorithm.

import type { TimelineEntry, TimelineLayout, BarLayout, TickMark } from './types';
import { yearFromDate } from './utils';

const TL_LEFT_MARGIN = 164;
const TL_RIGHT_MARGIN = 30;
const TL_TOP_PAD = 20;
const TL_BAR_H = 22;
const TL_ROW_H = 36;
const TL_SVG_W = 800;
const TL_AXIS_H = 30;

export function computeTimelineLayout(entries: TimelineEntry[], currentYear: number): TimelineLayout {
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

  minYear = Math.floor(minYear / 10) * 10;
  maxYear = Math.ceil(maxYear / 10) * 10;

  const sorted = [...entries].sort((a, b) => {
    const ay = yearFromDate(a.person.birthDate) ?? Infinity;
    const by = yearFromDate(b.person.birthDate) ?? Infinity;
    return ay - by;
  });

  const chartW = TL_SVG_W - TL_LEFT_MARGIN - TL_RIGHT_MARGIN;
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
    return {
      person: entry.person,
      isFocal: entry.isFocal,
      x, y: TL_TOP_PAD + i * TL_ROW_H,
      w: Math.max(endX - x, 4),
      h: TL_BAR_H,
      isOpen,
      hasNoDate,
    };
  });

  const ticks: TickMark[] = [];
  for (let y = minYear; y <= maxYear; y += 10) {
    ticks.push({ x: xOfYear(y), year: y });
  }

  const axisY = TL_TOP_PAD + sorted.length * TL_ROW_H + 10;
  const todayX = xOfYear(currentYear);
  const svgHeight = axisY + TL_AXIS_H;

  return { bars, ticks, todayX, svgWidth: TL_SVG_W, svgHeight, axisY };
}
