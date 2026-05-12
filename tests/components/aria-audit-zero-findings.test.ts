// CI enforcement test: every surface listed below must produce zero ARIA
// audit findings (or only findings present in the per-surface allow-list).
//
// "Audit findings" come from `runAriaQuery('audit', …)` — the same logic the
// dev MCP's `ui_aria_audit` runs against the live app. We mount each surface
// in happy-dom and run the audit against the rendered DOM.
//
// What this test catches that lint/unit tests don't:
//   - Adding an <input> without a programmatic label association.
//   - Adding a chip strip with role=button instead of role=tab.
//   - Removing the <main aria-label> wiring.
//   - Adding a landmark without an aria-label.
//
// Adding a surface here is cheap; adding a finding to the allow-list requires
// a one-line rationale comment explaining why it's acceptable. The default
// behavior is failure: any new a11y gap fails CI.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { runAriaQuery, type AriaAuditResult } from '../../src/mcp/tools/dev/ui-aria-script';
import LinkRuleModal from '../../src/renderer/components/modals/LinkRuleModal.vue';
import SettingsView from '../../src/renderer/views/SettingsView.vue';
import { i18n } from './setup';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/settings', params: {}, query: {} }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    afterEach: vi.fn(),
    currentRoute: { value: { path: '/settings' } },
  }),
}));

// SettingsView lazy-renders DatabaseView/DefaultsView/LinkRulesView/GazetteersView.
// Stub each so the test focuses on the SettingsView shell — the tab strip + the
// tabpanel container. Each child view has its own surface coverage elsewhere
// (LinkRuleModal here; the remaining views' audit pass is Task 6, run live).
vi.mock('../../src/renderer/views/DatabaseView.vue', () => ({
  default: { template: '<div data-testid="database-stub" />' },
}));
vi.mock('../../src/renderer/views/DefaultsView.vue', () => ({
  default: { template: '<div data-testid="defaults-stub" />' },
}));
vi.mock('../../src/renderer/views/LinkRulesView.vue', () => ({
  default: { template: '<div data-testid="link-rules-stub" />' },
}));
vi.mock('../../src/renderer/views/GazetteersView.vue', () => ({
  default: { template: '<div data-testid="gazetteers-stub" />' },
}));

// BaseSubPanel renders Teleport(to=body) — happy-dom needs document.body to exist.

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  document.body.replaceChildren();
});

type AuditEntry = {
  /** Mount a fresh wrapper for the surface. */
  mount: () => Promise<VueWrapper>;
  /** Allow-listed audit findings: kind + a one-line rationale.  */
  allow?: Array<{ kind: string; reason: string }>;
};

const SURFACES: Record<string, AuditEntry> = {
  'SettingsView (tab strip + tabpanel)': {
    mount: async () => {
      const wrapper = mount(SettingsView, {
        global: { plugins: [i18n] },
        attachTo: document.body,
      });
      return wrapper;
    },
  },
  'LinkRuleModal (+Regel form)': {
    mount: async () => {
      const wrapper = mount(LinkRuleModal, {
        props: { mode: 'add' },
        global: { plugins: [i18n] },
        attachTo: document.body,
      });
      return wrapper;
    },
    // The BaseSubPanel close button (✕) is icon-only; its aria-label comes
    // from the BaseSubPanel implementation. If the audit flags anything for
    // this surface in the future, document the rationale here.
    allow: [],
  },
};

describe('ui_aria_audit zero findings (CI enforcement)', () => {
  for (const [name, entry] of Object.entries(SURFACES)) {
    it(`${name} — audit returns 0 findings (or allow-listed only)`, async () => {
      const wrapper = await entry.mount();
      try {
        const result = runAriaQuery('audit', {}) as AriaAuditResult;
        const allowed = new Set((entry.allow ?? []).map((a) => a.kind));
        const unexpected = result.findings.filter((f) => !allowed.has(f.kind));
        if (unexpected.length > 0) {
          // Pretty-print for the failure message — every finding includes a hint.
          const detail = unexpected.map((f) => `  - ${f.kind} on <${f.tag}>${f.role ? ` role=${f.role}` : ''}${f.region ? ` in "${f.region}"` : ''}: ${f.hint}`).join('\n');
          throw new Error(
            `${name} produced ${unexpected.length} unexpected ARIA finding(s):\n${detail}\n\nFix the surface or add the finding kind to the surface's allow-list with a one-line rationale.`,
          );
        }
        expect(unexpected).toEqual([]);
      } finally {
        wrapper.unmount();
      }
    });
  }
});
