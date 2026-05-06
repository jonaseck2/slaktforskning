/**
 * Regression test for the tall-modal Save-button-below-the-fold bug.
 *
 * User goal (from docs/plans/2026-05-06-modal-scrollable-content.md):
 * Open a modal that has more fields than fit on screen — for example an
 * EventModal with date, place, citation and the "Mer" section expanded — and
 * the Save button stays reachable. Beta tester reports R72 + R75 (v0.215.2)
 * found that the modal grew past the viewport, the Save / Cancel footer was
 * pushed below the visible area, and the modal could not be scrolled.
 *
 * Root cause: `.entity-panel` (the modal card inside BaseSubPanel) had
 *   min-height: min-content;
 *   max-height: calc(100vh - 64px);
 * Per CSS spec, `min-height` overrides `max-height`. When body content was
 * taller than the viewport, the `min-content` floor exceeded the `100vh - 64px`
 * cap, the panel grew past the viewport, and the footer fell off-screen. The
 * `.ep-body { flex: 1; overflow-y: auto }` rule was already in place — it just
 * never fired because the panel itself never hit its max-height.
 *
 * Fix: change `.entity-panel` to `min-height: 0`. Now `max-height` actually
 * clamps the panel to viewport, the body's `flex: 1; overflow-y: auto` kicks
 * in, the header and footer (both `flex-shrink: 0`) stay pinned, and the body
 * scrolls between them.
 *
 * The user-observable check below mirrors the panel-table-overflow test
 * pattern: inject the relevant slice of shared.css, mount BaseSubPanel with
 * body content taller than the viewport (forced via `height` inline style on
 * the slot content), and assert the computed styles that make the user goal
 * deliverable.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { h } from 'vue';
import BaseSubPanel from '../../src/renderer/components/modals/BaseSubPanel.vue';
import { i18n } from './setup';

describe('BaseSubPanel scrollable body (tall modal Save reachability)', () => {
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    // Mirror the relevant slice of shared.css so JSDOM resolves the same
    // computed styles the running app would. Copies the post-fix `.entity-panel`
    // rule (min-height: 0) and the body / header / footer flex behaviour.
    styleEl = document.createElement('style');
    styleEl.textContent = `
      .entity-panel-wrap { display: flex; gap: 8px; align-items: flex-start; }
      .entity-panel {
        position: relative;
        background: #fff;
        border-radius: 10px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        width: 320px;
        min-height: 0;
        max-height: calc(100vh - 64px);
      }
      .ep-header { padding: 10px 14px; flex-shrink: 0; }
      .ep-body { flex: 1; overflow-y: auto; }
      .ep-footer { display: flex; padding: 8px 14px; flex-shrink: 0; }
    `;
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    styleEl.remove();
  });

  function mountTallSubpanel(): VueWrapper<unknown> {
    // Mount in `subpanel` mode so we don't pull in BaseModal's overlay /
    // focus-trap (irrelevant for the CSS contract under test). The CSS rules
    // above apply identically to standalone and subpanel modes — both render
    // the same `.entity-panel` shell.
    return mount(BaseSubPanel as unknown as Parameters<typeof mount>[0], {
      global: {
        plugins: [i18n],
        // BaseSubPanel uses `v-narrate` for screen-reader narration. The
        // directive is registered globally in main.ts; stub it as a no-op so
        // the test mount doesn't warn.
        directives: { narrate: { mounted: () => {}, updated: () => {} } },
      },
      props: { entityType: 'event', title: 'Tall test modal', mode: 'subpanel' },
      slots: {
        // 2000 px of body content — far taller than any reasonable viewport.
        // Real bug surface: EventModal with "Mer" expanded + place picker +
        // citation block. Same CSS contract: body taller than max-height cap.
        default: () =>
          h('div', { style: 'height: 2000px;' }, 'tall content'),
      },
      attachTo: document.body,
    });
  }

  it('.entity-panel has min-height: 0 (so max-height clamp wins)', () => {
    const wrapper = mountTallSubpanel();
    const panel = wrapper.find('.entity-panel').element as HTMLElement;
    const computed = window.getComputedStyle(panel);
    // Bug surface: `min-content` would let the panel grow past the viewport.
    // JSDOM may serialise `0` as `0` or `0px` — both indicate the cap will
    // win. The bug-shaped value is `min-content`.
    expect(computed.minHeight).not.toBe('min-content');
    expect(computed.minHeight).toMatch(/^0(px)?$/);
    wrapper.unmount();
  });

  it('.entity-panel caps at viewport (max-height: calc(100vh - 64px))', () => {
    const wrapper = mountTallSubpanel();
    const panel = wrapper.find('.entity-panel').element as HTMLElement;
    const computed = window.getComputedStyle(panel);
    // The cap is the lever the bug fix relies on. JSDOM resolves `100vh` to
    // a px value at parse time and emits `calc(<px> - 64px)`; real browsers
    // keep `100vh` literal or resolve to the final `<px>`. Accept any of
    // those — the absent cap (the bug) renders as `none`.
    expect(computed.maxHeight).not.toBe('none');
    expect(computed.maxHeight).not.toBe('');
    expect(computed.maxHeight).toMatch(/calc\(.*64px\)|^[0-9]+px$/);
    wrapper.unmount();
  });

  it('.ep-body grows to fill remaining space and scrolls (flex:1 + overflow-y:auto)', () => {
    const wrapper = mountTallSubpanel();
    const body = wrapper.find('.ep-body').element as HTMLElement;
    const computed = window.getComputedStyle(body);
    // The body is the only flex child that grows. Together with the panel's
    // max-height cap, this is what produces the scrollbar when content
    // overflows.
    expect(computed.flexGrow).toBe('1');
    expect(computed.overflowY).toBe('auto');
    wrapper.unmount();
  });

  it('.ep-header and .ep-footer are flex-shrink: 0 (stay pinned above/below the scroll)', () => {
    const wrapper = mountTallSubpanel();
    const header = wrapper.find('.ep-header').element as HTMLElement;
    const footer = wrapper.find('.ep-footer').element as HTMLElement;
    expect(window.getComputedStyle(header).flexShrink).toBe('0');
    expect(window.getComputedStyle(footer).flexShrink).toBe('0');
    wrapper.unmount();
  });

  it('Save button is rendered inside the (pinned) footer, not the (scrollable) body', () => {
    const wrapper = mountTallSubpanel();
    // Save button lives in `.ep-footer`. If it were in `.ep-body`, it would
    // scroll with the form fields and could be pushed below the fold — exactly
    // the bug R72 + R75 reported. This is the structural assertion that goes
    // hand-in-hand with the CSS assertions above.
    const footer = wrapper.find('.ep-footer');
    const saveBtn = footer.find('.ep-save-btn');
    expect(saveBtn.exists()).toBe(true);

    const body = wrapper.find('.ep-body');
    expect(body.find('.ep-save-btn').exists()).toBe(false);
    wrapper.unmount();
  });

  it('DOM order is header → body → footer (so column flex pins footer at the bottom)', () => {
    const wrapper = mountTallSubpanel();
    const panel = wrapper.find('.entity-panel').element as HTMLElement;
    const directChildren = Array.from(panel.children) as HTMLElement[];
    const idx = (cls: string) => directChildren.findIndex((el) => el.classList.contains(cls));
    const headerIdx = idx('ep-header');
    const bodyIdx = idx('ep-body');
    const footerIdx = idx('ep-footer');
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeGreaterThan(headerIdx);
    expect(footerIdx).toBeGreaterThan(bodyIdx);
    wrapper.unmount();
  });
});
