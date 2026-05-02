import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from './setup';
import PersonPanel from '../../src/renderer/components/PersonPanel.vue';
import PlacePanel from '../../src/renderer/components/PlacePanel.vue';
import SourcePanel from '../../src/renderer/components/SourcePanel.vue';
import GroupPanel from '../../src/renderer/components/GroupPanel.vue';
import ResearchTaskPanel from '../../src/renderer/components/ResearchTaskPanel.vue';
import MediaPanel from '../../src/renderer/components/MediaPanel.vue';
import ReportPanel from '../../src/renderer/components/ReportPanel.vue';
import WebsitePanel from '../../src/renderer/components/WebsitePanel.vue';

// Each panel mounted in a stable, low-side-effect state — sufficient to read
// the root element's CSS classes. Mounting stubs window.api to avoid network
// calls. Per-panel `props` is the minimal set that lets the panel mount
// without console errors. The single user-observable claim is: every right-
// side panel renders `<div class="side-panel">` (from EntityPanel) and never
// the colliding `.entity-panel` class (BaseSubPanel modal chrome).
const PANELS = [
  { name: 'PersonPanel',       comp: PersonPanel,       props: { personId: null } },
  { name: 'PlacePanel',        comp: PlacePanel,        props: { placeId: null } },
  { name: 'SourcePanel',       comp: SourcePanel,       props: { sourceId: null } },
  { name: 'GroupPanel',        comp: GroupPanel,        props: { groupId: null } },
  { name: 'ResearchTaskPanel', comp: ResearchTaskPanel, props: { taskId: null } },
  { name: 'MediaPanel',        comp: MediaPanel,        props: { mediaId: null } },
  { name: 'ReportPanel',       comp: ReportPanel,       props: { activeTab: 'pedigree', coupleRelationships: [] } },
  { name: 'WebsitePanel',      comp: WebsitePanel,      props: { exporting: false, lastOutput: null, bundleMissing: false } },
];

describe('panel layout consistency', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: { api: unknown } }).window.api = new Proxy({}, {
      get: () => () => Promise.resolve(null),
    });
  });

  it.each(PANELS)('$name root has .side-panel class', ({ comp, props }) => {
    const w = mount(comp as unknown as Parameters<typeof mount>[0], {
      global: { plugins: [i18n] },
      props,
    });
    const root = w.element as HTMLElement;
    expect(root.classList.contains('side-panel')).toBe(true);
  });

  it.each(PANELS)('$name root does NOT have .entity-panel class (collision guard)', ({ comp, props }) => {
    const w = mount(comp as unknown as Parameters<typeof mount>[0], {
      global: { plugins: [i18n] },
      props,
    });
    const root = w.element as HTMLElement;
    expect(root.classList.contains('entity-panel')).toBe(false);
  });
});
