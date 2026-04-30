import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FanChartSvg from '../../src/renderer/components/charts/FanChartSvg.vue';
import { computeFanLayout, fanViewBox } from '../../src/renderer/utils/fanLayout';
import type { PersonNode, PedigreeTree } from '../../src/renderer/utils/chart-layout/types';
import { i18n } from './setup';

function makeNode(id: string, given = 'Test', surname = 'Sareld'): PersonNode {
  return {
    id, givenName: given, surname, preferredName: null,
    nickname: null, sex: 'M', living: false,
    birthDate: '1900', deathDate: '1980',
  };
}

function makeTree(): PedigreeTree {
  const nodes = new Map<number, PersonNode>();
  // ahnNum 1 = focal/proband; 2 = father; 3 = mother
  nodes.set(1, makeNode('p-bengt', 'Bengt', 'Sareld'));
  nodes.set(2, makeNode('p-father', 'Father', 'Sareld'));
  nodes.set(3, makeNode('p-mother', 'Mother', 'Sareld'));
  return { nodes, generations: 2 };
}

describe('FanChartSvg link mode', () => {
  function mountFan(linkProps: Partial<{ linkBase: string; linkByAhnentafel: boolean }> = {}) {
    const tree = makeTree();
    const segments = computeFanLayout(tree, { arcSpan: 180, maxGen: 2 });
    const focal = segments.find(s => s.isFocal) ?? null;
    const vb = fanViewBox(180, 2);
    return mount(FanChartSvg, {
      global: { plugins: [i18n] },
      props: {
        segments,
        focalSegment: focal,
        focalCx: vb.cx,
        focalCy: vb.cy,
        vbWidth: vb.width,
        vbHeight: vb.height,
        arcSpan: 180,
        ...linkProps,
      },
    });
  }

  it('focal segment is never wrapped in <a> in linkBase mode (proband has no ancestor page)', () => {
    // Bengt bug fix: in YourAncestorsReport, ancestor pages start at ahnentafel 2.
    // The focal (ahnNum=1) has no #ancestor-1 anchor, so we must not render a link
    // from the centre segment.
    const wrapper = mountFan({ linkBase: '#ancestor-', linkByAhnentafel: true });
    const focalGroup = wrapper.find('g.fan-seg:last-of-type');
    expect(focalGroup.exists()).toBe(true);
    // The focal group must not contain an <a> child
    expect(focalGroup.find('a').exists()).toBe(false);
    // It must still contain the focal circle
    expect(focalGroup.find('circle').exists()).toBe(true);
  });

  it('non-focal segments are wrapped in <a> with ahnentafel-based href in linkBase mode', () => {
    const wrapper = mountFan({ linkBase: '#ancestor-', linkByAhnentafel: true });
    const links = wrapper.findAll('g.fan-seg a');
    expect(links.length).toBeGreaterThan(0);
    const hrefs = links.map(a => a.attributes('href'));
    // father is ahnNum 2, mother is ahnNum 3 — neither equals #ancestor-1
    expect(hrefs).toContain('#ancestor-2');
    expect(hrefs).toContain('#ancestor-3');
    expect(hrefs).not.toContain('#ancestor-1');
  });

  it('renders <title> tooltip on every populated segment (interactive mode)', () => {
    // Bengt bug fix: the bespoke ChartTooltip is replaced with the default
    // browser tooltip (<title>) so hover behaviour matches the rest of the app.
    const wrapper = mountFan();
    const titles = wrapper.findAll('g.fan-seg title');
    // Focal + father + mother should each have a <title>
    expect(titles.length).toBe(3);
    const texts = titles.map(t => t.text());
    expect(texts.some(t => t.includes('Bengt') && t.includes('Sareld'))).toBe(true);
    expect(texts.some(t => t.includes('Father'))).toBe(true);
    expect(texts.some(t => t.includes('Mother'))).toBe(true);
  });
});
