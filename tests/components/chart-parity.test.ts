import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ChartCanvas from '../../src/renderer/components/charts/ChartCanvas.vue';
import type { ChartLayout, BoxLayout } from '../../src/renderer/utils/chart-layout/types';
import { onBoxKeydown } from '../../src/renderer/composables/useChartKeyboardNav';
import type { ChartOrientation } from '../../src/renderer/composables/useChartKeyboardNav';
import { BOX_W, H_GAP, PAD } from '../../src/renderer/utils/chart-layout';
import en from '../../src/renderer/i18n/en';

// Resolve chart source paths relative to THIS test file, not the process CWD —
// when vitest runs from a worktree the controller's CWD may be the main repo
// (see .claude/rules/worktrees.md §2), so a bare relative path reads the wrong
// copy. import.meta.url pins us to the worktree's tree.
const chartsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/renderer/components/charts');

function box(id: string, isFocal = false, x = 0, y = 0): BoxLayout {
  return { person: { id, givenName: 'A', surname: 'B', preferredName: null, nickname: null, sex: 'U', living: true, birthDate: null, deathDate: null, birthPlace: null, deathPlace: null, photoUrl: null }, isFocal, x, y, w: 180, h: 56 };
}

const layout: ChartLayout = {
  boxes: [box('focal', true, 0, 100), box('p2', false, 220, 100)],
  lines: [], paths: [], svgWidth: 500, svgHeight: 300, viewBoxMinY: 0,
  collapseButtons: [{ personId: 'focal', direction: 'right', cx: 190, cy: 128, isExpanded: true }],
  placeholders: [{ type: 'placeholder', role: 'father', childPersonId: 'focal', x: 220, y: 0 }],
  placeholderLines: [],
};

function mountCanvas(props = {}) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });
  return mount(ChartCanvas, {
    props: { layout, tree: {}, loading: false, zoom: 1, isPanning: false, selectedId: 'focal', ariaLabel: 'a11y.pedigreeChart', addBtnStyle: 'plus', readonly: false, ...props },
    global: { plugins: [i18n] },
  });
}

describe('chart parity (shared ChartCanvas)', () => {
  it('renders role=tree on the svg and role=treeitem on every box', () => {
    const w = mountCanvas();
    expect(w.find('svg[role="tree"]').exists()).toBe(true);
    expect(w.findAll('[role="treeitem"]').length).toBe(2);
  });
  it('emits focus-person on box double-click (re-root)', async () => {
    const w = mountCanvas();
    await w.find('[data-testid="person-box-focal"]').trigger('dblclick');
    expect(w.emitted('focus-person')?.[0]).toEqual(['focal']);
  });
  it('emits navigate on box click', async () => {
    const w = mountCanvas();
    await w.find('[data-testid="person-box-p2"]').trigger('click');
    expect(w.emitted('navigate')?.[0]).toEqual(['p2']);
  });
  it('emits person-context-menu from the + affordance', async () => {
    const w = mountCanvas();
    await w.find('.add-relative-btn').trigger('click');
    expect(w.emitted('person-context-menu')).toBeTruthy();
  });
  it('emits add-from-placeholder when a ghost box is activated', async () => {
    const w = mountCanvas();
    await w.find('.ghost-box').trigger('click');
    expect(w.emitted('add-from-placeholder')?.[0]?.[0]).toMatchObject({ role: 'father', childPersonId: 'focal' });
  });
  it('emits collapse-toggle on collapse-button click', async () => {
    const w = mountCanvas();
    await w.find('.collapse-btn').trigger('click');
    expect(w.emitted('collapse-toggle')).toBeTruthy();
  });
  it('emits box-keydown so the chart can drive arrow-key navigation', async () => {
    const w = mountCanvas();
    await w.find('[data-testid="person-box-focal"]').trigger('keydown', { key: 'ArrowRight' });
    expect(w.emitted('box-keydown')).toBeTruthy();
    const payload = (w.emitted('box-keydown') as any)[0][0];
    expect(payload.box.person.id).toBe('focal');
    expect(payload.event.key).toBe('ArrowRight');
  });
});

describe('all three charts render via ChartCanvas (no bespoke SVG shell)', () => {
  for (const f of ['PedigreeChart', 'HourglassChart', 'DescendantChart']) {
    it(`${f} delegates rendering to ChartCanvas`, () => {
      const src = readFileSync(resolve(chartsDir, `${f}.vue`), 'utf8');
      expect(src).toMatch(/<ChartCanvas/);
      expect(src).not.toMatch(/<svg[^>]*role="tree"/);
    });
  }
});

// --------------------------------------------------------------------------
// Strongest lock on Task 14: arrow-key resolution per orientation. Mount-free —
// call onBoxKeydown with a fake boxes array + a stub scrollEl whose
// querySelector returns an element with a spy focus(), and assert the id that
// got focused for each orientation/key combination. This proves the natural-
// orientation mapping is wired correctly without relying on a real DOM tree.
// --------------------------------------------------------------------------
describe('useChartKeyboardNav resolves arrow keys per orientation', () => {
  // Stub scroll element: querySelector returns a fake box element whose focus()
  // records which person-box id it was called on.
  function makeNav(boxes: BoxLayout[], orientation: ChartOrientation) {
    let focusedId: string | null = null;
    const onActivate = vi.fn();
    const scrollEl = {
      querySelector(sel: string) {
        const m = sel.match(/person-box-(.+)"\]$/);
        const id = m ? m[1] : null;
        return { focus: () => { focusedId = id; } } as unknown as HTMLElement;
      },
    } as unknown as HTMLElement;
    function press(box: BoxLayout, key: string) {
      focusedId = null;
      const event = { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
      onBoxKeydown(event, box, { boxes, orientation, scrollEl, onActivate });
      return { focusedId, prevented: (event.preventDefault as any).mock.calls.length > 0 };
    }
    return { press, onActivate };
  }

  it('Enter/Space activate (navigate) regardless of orientation', () => {
    const boxes = [box('focal', true, 0, 0)];
    const { press, onActivate } = makeNav(boxes, 'pedigree');
    const r = press(boxes[0], 'Enter');
    expect(onActivate).toHaveBeenCalledWith('focal');
    expect(r.prevented).toBe(true);

    const sp = makeNav(boxes, 'hourglass');
    sp.press(boxes[0], ' ');
    expect(sp.onActivate).toHaveBeenCalledWith('focal');
  });

  it('pedigree: Right=ancestor, Left=focal, Up/Down=sibling', () => {
    // Two generations: focal at gen 0 (x=PAD), father+mother at gen 1, ordered
    // by y (father above mother). genX(1) = PAD + (BOX_W + H_GAP).
    const genX = (g: number) => PAD + g * (BOX_W + H_GAP);
    const boxes = [
      box('focal', true, genX(0), 100),
      box('father', false, genX(1), 60),
      box('mother', false, genX(1), 140),
    ];
    const { press } = makeNav(boxes, 'pedigree');
    // Right from focal → toward ancestors (gen 1), nearest on y → father (y=60
    // is closer to focal y=100 than mother y=140).
    expect(press(boxes[0], 'ArrowRight').focusedId).toBe('father');
    // Left from father → toward focal (gen 0) → focal.
    expect(press(boxes[1], 'ArrowLeft').focusedId).toBe('focal');
    // Down from father → next sibling at same gen, larger y → mother.
    expect(press(boxes[1], 'ArrowDown').focusedId).toBe('mother');
    // Up from mother → previous sibling, smaller y → father.
    expect(press(boxes[2], 'ArrowUp').focusedId).toBe('father');
    // Up from father → no previous sibling → nothing focused, not prevented.
    const top = press(boxes[1], 'ArrowUp');
    expect(top.focusedId).toBe(null);
    expect(top.prevented).toBe(false);
  });

  it('hourglass: Up=ancestor, Down=descendant, Left/Right=row neighbor', () => {
    // Three rows by y: parents (y=0), focal+spouse (y=200), child (y=400).
    const boxes = [
      box('father', false, 0, 0),
      box('focal', true, 0, 200),
      box('spouse', false, 220, 200),
      box('child', false, 0, 400),
    ];
    const { press } = makeNav(boxes, 'hourglass');
    // Up from focal → toward ancestors (row above) → father.
    expect(press(boxes[1], 'ArrowUp').focusedId).toBe('father');
    // Down from focal → toward descendants (row below) → child.
    expect(press(boxes[1], 'ArrowDown').focusedId).toBe('child');
    // Right from focal → next on same row (larger x) → spouse.
    expect(press(boxes[1], 'ArrowRight').focusedId).toBe('spouse');
    // Left from spouse → previous on same row (smaller x) → focal.
    expect(press(boxes[2], 'ArrowLeft').focusedId).toBe('focal');
  });

  it('descendant: Down=descendant, Up=focal, Left/Right=sibling', () => {
    // Two rows by y: focal (y=0), two children (y=200) ordered by x.
    const boxes = [
      box('focal', true, 200, 0),
      box('childA', false, 0, 200),
      box('childB', false, 400, 200),
    ];
    const { press } = makeNav(boxes, 'descendant');
    // Down from focal → toward descendants → nearest child on x (childA x=0
    // dist 200, childB x=400 dist 200 — tie; first wins → childA).
    expect(press(boxes[0], 'ArrowDown').focusedId).toBe('childA');
    // Up from childA → toward focal (row above) → focal.
    expect(press(boxes[1], 'ArrowUp').focusedId).toBe('focal');
    // Right from childA → next sibling (larger x) → childB.
    expect(press(boxes[1], 'ArrowRight').focusedId).toBe('childB');
    // Left from childB → previous sibling (smaller x) → childA.
    expect(press(boxes[2], 'ArrowLeft').focusedId).toBe('childA');
  });
});
