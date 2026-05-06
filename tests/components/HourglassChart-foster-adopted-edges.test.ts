import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import HourglassChart from '../../src/renderer/components/charts/HourglassChart.vue';
import { i18n } from './setup';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// User goal (docs/plans/2026-05-06-hourglass-foster-vs-adoptive-distinct.md):
//   The genealogist looking at the hourglass chart can tell foster from
//   adopted at a glance — they have visually distinct dash patterns.
//   Mixed-subtype merged edges (one parent foster + the other adopted)
//   split into two separate edges so each subtype is visible.
//
// These component tests assert the *rendered SVG* has the right
// `<path stroke-dasharray="...">` attributes and that the legend appears
// when relevant — that's what the user actually sees.

type Rel = {
  type: 'parent_child' | 'couple';
  person1_id: string;
  person2_id: string;
  subtype?: string | null;
};

function setupApi(relsByPerson: Record<string, Rel[]>, sexByPerson: Record<string, string> = {}) {
  (window as unknown as { api: unknown }).api = {
    persons: {
      get: vi.fn().mockImplementation((id: unknown) =>
        Promise.resolve({ id, sex: sexByPerson[String(id)] ?? 'U', living: true }),
      ),
      getNames: vi.fn().mockImplementation((id: unknown) =>
        Promise.resolve([{ given_name: String(id), surname: 'Test', sort_order: 0 }]),
      ),
    },
    events: { forPerson: vi.fn().mockResolvedValue([]) },
    relationships: {
      getForPerson: vi.fn().mockImplementation((id: unknown) =>
        Promise.resolve(relsByPerson[String(id)] ?? []),
      ),
    },
    media: { profilePicRef: vi.fn().mockResolvedValue(null) },
  };
}

async function mountChart() {
  const wrapper = mount(HourglassChart, {
    global: { plugins: [i18n] },
    props: { personId: 'focal', selectedPersonId: null },
  });
  await flushPromises();
  // A second tick lets useEntityData's loader resolve and the layout
  // computed re-evaluate against the loaded tree.
  await flushPromises();
  return wrapper;
}

function dashArrays(html: string): string[] {
  // Pull every stroke-dasharray attribute value from the rendered SVG.
  const re = /stroke-dasharray="([^"]+)"/g;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) out.push(match[1]);
  return out;
}

describe('HourglassChart — foster vs adoptive parent_child edge styles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mixed subtype: focal biological + co-parent adopted child → BOTH styles render (distinct)', async () => {
    // Focal has spouse 'mom'. Their child is biological to focal but
    // adopted to mom. The chart MUST render two separate parent_child
    // edges so the user sees both relationship types.
    setupApi(
      {
        focal: [
          { type: 'couple', person1_id: 'focal', person2_id: 'mom' },
          { type: 'parent_child', person1_id: 'focal', person2_id: 'kid', subtype: 'biological' },
        ],
        kid: [
          { type: 'parent_child', person1_id: 'focal', person2_id: 'kid', subtype: 'biological' },
          { type: 'parent_child', person1_id: 'mom', person2_id: 'kid', subtype: 'adopted' },
        ],
        mom: [
          { type: 'couple', person1_id: 'focal', person2_id: 'mom' },
          { type: 'parent_child', person1_id: 'mom', person2_id: 'kid', subtype: 'adopted' },
        ],
      },
      { focal: 'M', mom: 'F', kid: 'U' },
    );

    const wrapper = await mountChart();
    const html = wrapper.html();
    const dashes = dashArrays(html);

    // Adoptive edge is dotted ('2 3'); foster pattern would be '8 4'.
    expect(dashes).toContain('2 3');
    // No foster edges in this seed — the only '8 4' would be a (wrongly
    // emitted) foster path.
    expect(dashes.includes('8 4')).toBe(false);

    // Adopted edge tooltip text appears in the SVG so the user gets a
    // tooltip on hover. (The foster tooltip would be 'Foster relationship'.)
    expect(html).toContain('Adoptive relationship');
  });

  it('same-subtype regression guard: both parents foster → ONE merged foster edge', async () => {
    // Both parents are foster to the same child. Plan rule: same-subtype
    // cases keep the existing merged-couple-edge render — emitting two
    // separate paths here would be a regression. Foster dash ('8 4') must
    // appear; adopted dash ('2 3') must NOT.
    setupApi(
      {
        focal: [
          { type: 'couple', person1_id: 'focal', person2_id: 'mom' },
          { type: 'parent_child', person1_id: 'focal', person2_id: 'kid', subtype: 'foster' },
        ],
        kid: [
          { type: 'parent_child', person1_id: 'focal', person2_id: 'kid', subtype: 'foster' },
          { type: 'parent_child', person1_id: 'mom', person2_id: 'kid', subtype: 'foster' },
        ],
        mom: [
          { type: 'couple', person1_id: 'focal', person2_id: 'mom' },
          { type: 'parent_child', person1_id: 'mom', person2_id: 'kid', subtype: 'foster' },
        ],
      },
      { focal: 'M', mom: 'F', kid: 'U' },
    );

    const wrapper = await mountChart();
    const html = wrapper.html();
    const dashes = dashArrays(html);

    // Foster dashes appear, adopted dashes do not.
    expect(dashes).toContain('8 4');
    expect(dashes.includes('2 3')).toBe(false);

    // Exactly one foster path emits in the SVG (count occurrences of
    // 8 4 on path elements). The legend swatch is on a <line>, not a
    // <path>, so the gate stays clean.
    const fosterPathCount = (html.match(/<path[^>]+stroke-dasharray="8 4"/g) ?? []).length;
    expect(fosterPathCount).toBe(1);
  });

  it('mixed: focal foster + co-parent adopted → both 8 4 AND 2 3 dashes render', async () => {
    setupApi(
      {
        focal: [
          { type: 'couple', person1_id: 'focal', person2_id: 'mom' },
          { type: 'parent_child', person1_id: 'focal', person2_id: 'kid', subtype: 'foster' },
        ],
        kid: [
          { type: 'parent_child', person1_id: 'focal', person2_id: 'kid', subtype: 'foster' },
          { type: 'parent_child', person1_id: 'mom', person2_id: 'kid', subtype: 'adopted' },
        ],
        mom: [
          { type: 'couple', person1_id: 'focal', person2_id: 'mom' },
          { type: 'parent_child', person1_id: 'mom', person2_id: 'kid', subtype: 'adopted' },
        ],
      },
      { focal: 'M', mom: 'F', kid: 'U' },
    );

    const wrapper = await mountChart();
    const html = wrapper.html();
    const dashes = dashArrays(html);

    expect(dashes).toContain('8 4');
    expect(dashes).toContain('2 3');
  });

  it('legend appears when foster or adoptive edges render, and only those entries are shown', async () => {
    setupApi(
      {
        focal: [
          { type: 'parent_child', person1_id: 'focal', person2_id: 'kid', subtype: 'adopted' },
        ],
        kid: [
          { type: 'parent_child', person1_id: 'focal', person2_id: 'kid', subtype: 'adopted' },
        ],
      },
      { focal: 'M', kid: 'U' },
    );

    const wrapper = await mountChart();
    const legend = wrapper.find('.chart-legend');
    expect(legend.exists()).toBe(true);
    expect(legend.html()).toContain('Adoptive relationship');
    // Foster legend entry hidden — no foster edges in this seed.
    expect(legend.html().includes('Foster relationship')).toBe(false);
  });

  it('no legend when the chart has only biological edges', async () => {
    setupApi(
      {
        focal: [
          { type: 'parent_child', person1_id: 'focal', person2_id: 'kid', subtype: 'biological' },
        ],
        kid: [
          { type: 'parent_child', person1_id: 'focal', person2_id: 'kid', subtype: 'biological' },
        ],
      },
      { focal: 'M', kid: 'U' },
    );

    const wrapper = await mountChart();
    const legend = wrapper.find('.chart-legend');
    expect(legend.exists()).toBe(false);
  });
});
