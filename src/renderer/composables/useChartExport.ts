import { ref, computed, type Ref, type ComputedRef } from 'vue';
import {
  getPaperDimensions,
  computeTileViewBoxes,
  generateTileSvg,
  MM_TO_PX,
  type PaperSize,
  type Orientation,
  type ColorMode,
} from '../../api/chart-export';

interface ChartApi {
  saveSvg: (svg: string) => Promise<void>;
  saveTiledPdf: (pages: string[]) => Promise<void>;
}
function chartApi(): ChartApi {
  return (window.api as { chart: ChartApi }).chart;
}

export function buildExportSvgString(el: SVGElement): string {
  const clone = el.cloneNode(true) as SVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  return new XMLSerializer().serializeToString(clone);
}

export function wrapWithTitle(svgString: string, title: string): string {
  const escaped = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\u2014/g, '&#8212;');
  const titleNode = `<text x="50%" y="32" text-anchor="middle" font-size="24" font-family="system-ui, sans-serif" fill="currentColor">${escaped}</text>`;
  return svgString.replace(/(<svg[^>]*>)/, `$1${titleNode}`);
}

export interface UseChartExportOptions {
  svgRef: Ref<SVGElement | null>;
  title: ComputedRef<string> | Ref<string>;
  defaultPaperSize?: PaperSize;
  defaultOrientation?: Orientation;
  defaultColorMode?: ColorMode;
}

export function useChartExport(opts: UseChartExportOptions) {
  const paperSize = ref<PaperSize>(opts.defaultPaperSize ?? 'A2');
  const orientation = ref<Orientation>(opts.defaultOrientation ?? 'landscape');
  const colorMode = ref<ColorMode>(opts.defaultColorMode ?? 'themed');
  const customWidth = ref<number>(420);
  const customHeight = ref<number>(594);

  const paperDims = computed(() => getPaperDimensions({
    paperSize: paperSize.value,
    orientation: orientation.value,
    customWidth: customWidth.value,
    customHeight: customHeight.value,
  }));

  const tileCount = computed(() => {
    const W = Math.round(paperDims.value.width * MM_TO_PX);
    const H = Math.round(paperDims.value.height * MM_TO_PX);
    const tiles = computeTileViewBoxes(W, H);
    if (tiles.length <= 1) return null;
    const rows = Math.max(...tiles.map(t => t.row)) + 1;
    const cols = Math.max(...tiles.map(t => t.col)) + 1;
    return { count: tiles.length, rows, cols };
  });

  async function saveSvg() {
    if (!opts.svgRef.value) return;
    const raw = buildExportSvgString(opts.svgRef.value);
    const titled = wrapWithTitle(raw, opts.title.value);
    await chartApi().saveSvg(titled);
  }

  async function savePdf() {
    if (!opts.svgRef.value) return;
    const raw = buildExportSvgString(opts.svgRef.value);
    const titled = wrapWithTitle(raw, opts.title.value);
    const W = Math.round(paperDims.value.width * MM_TO_PX);
    const H = Math.round(paperDims.value.height * MM_TO_PX);
    const tiles = computeTileViewBoxes(W, H);
    const pages = tiles.length === 1
      ? [titled]
      : tiles.map(t => generateTileSvg(titled, t));
    await chartApi().saveTiledPdf(pages);
  }

  return {
    paperSize,
    orientation,
    colorMode,
    customWidth,
    customHeight,
    paperDims,
    tileCount,
    saveSvg,
    savePdf,
  };
}
