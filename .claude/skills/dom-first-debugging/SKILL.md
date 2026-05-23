---
name: dom-first-debugging
description: Use when investigating any layout, visual, or "this looks different from that" issue in the renderer. The first action is reading the rendered DOM or computed styles — not reasoning about CSS. Reasoning only after the truth is on the table. Triggers on "panel doesn't fill", "X looks different from Y", "spacing is wrong", "border-radius missing", "wrong width", "rendered position is off".
---

# DOM-First Debugging

When the user reports a visual or layout problem, **the rendered DOM is the truth.** Read it before reasoning about CSS. Inspecting computed styles takes 30 seconds and tells you what's actually happening; reasoning about flex chains and scope hashes can burn an hour and still miss it.

## The rule

**On any layout / visual / "looks different" report, the first tool call is a DOM read or computed-style read.** Not a `grep` of CSS files. Not a code-only analysis of flex rules. Not "I bet it's a min-height: 0 thing." Read the truth first, reason after.

## Why this exists (read this case study)

In v0.190.0 the user reported "right panels are 320px wide and don't fill height." I spent a non-trivial chunk of session reasoning about flex / min-height / box-sizing, iterating on EntityPanel CSS and wrapper rules through multiple commits. Eventually the user opened DevTools, found `width: 320px; max-height: calc(100vh - 64px);` on the panel, and asked me where it came from. One grep later: `.entity-panel` was already a class in `shared.css:1253` (BaseSubPanel modal chrome). My new component's root class collided. **Visible in 30 seconds of DOM inspection. Took an hour of CSS reasoning to even reach that hypothesis.**

The anti-pattern: "I bet it's a flex thing" → start editing flex rules → no progress → "maybe min-height" → edit → no progress → "maybe box-sizing" → edit → user reads the DOM and finds the answer. This skill exists so I read the DOM first instead.

## Triggers (when this skill activates)

- "Panel doesn't fill width / height"
- "X looks different from Y" (especially "X uses our common component")
- "Border-radius is missing" / "corners aren't rounded"
- "Wrong width" / "wrong height" / "fixed size" / "won't resize"
- "Spacing is wrong" / "padding is off" / "elements overlap"
- "Layout broke after [refactor / class rename / migration]"
- Anything where the user describes a visible UI symptom and you don't yet have an inspector reading

## What to do

### Step 1 — read the DOM and computed styles BEFORE forming a hypothesis

The project's dev MCP is the fastest path. **In this order:**

```
mcp__slaktforskning-dev__ui_query_styles { selector: '.side-panel' }
  // returns computed styles + bounding rect + scroll metrics in <1 KB
  // covers 95% of layout-debug needs (overflow, height, flex, position, ...)

mcp__slaktforskning-dev__ui_screenshot { selector: '.side-panel', padding: 8 }
  // crops the PNG to just that element — visual + dimensional truth, no bloat

mcp__slaktforskning-dev__ui_get_dom { selector: '.side-panel' }
  // outerHTML of one element — when you need to read the rendered structure
  // (NOT the no-arg form: that dumps the full document, often 12+ MB)
```

If you find yourself wanting `getComputedStyle` on a single element, reach for `ui_query_styles` — that *is* the tool. Don't reach for `chrome-devtools` MCPs; Tauri uses the system WebView, not Chromium with CDP — `chrome-devtools list_pages` will show only `about:blank`.

The user will often paste DOM dumps directly — read them carefully. Note: classes, computed dimensions, data-v hashes, inline styles. Anything surprising is a clue.

### Step 2 — only then, reason about CSS

Once the DOM is on the table, find what's setting the surprising values:

- `grep -RIn '\.<class-name>\b' src/renderer/styles/ src/renderer/components/ src/renderer/views/` for every unexpected class.
- For inline styles, find the `:style="..."` binding in the template.
- For computed values that don't match any source rule, suspect class collision (per `.claude/rules/renderer.md` "Class-name collision check").

### Step 3 — make ONE change, re-read the DOM, confirm

Don't iterate by eye. After every CSS change, re-read computed styles to confirm the change took effect AND that no other property regressed.

## Anti-patterns this skill rejects

- **"I bet it's [flex / min-height / box-sizing] — let me try editing."** Try means iterate-blind. Read the DOM first.
- **Running `vitest` to verify a layout fix.** Component tests don't compute layout; they only verify the rendered tree. Layout verification needs computed styles from the running app.
- **Multiple speculative edits in a row without re-inspecting.** Each edit either fixed it or didn't; if you don't read the DOM between, you're guessing.
- **Reasoning about Vue scoped CSS specificity without looking at the actual `data-v-*` attributes on the element.** Open the DOM and look — guessing about which hash applied where is a trap.
- **Trusting "tests pass" as evidence the layout works.** It isn't. Layout = computed styles. Tests = structural assertions. Different proof obligations.

## When the rule does NOT apply

- **Pure logic bugs / data flow / IPC / API errors** — those are debugged by reading state, not DOM. Use `superpowers:systematic-debugging` instead.
- **Tests that fail** — read the test output, not the DOM.
- **Build errors** — read the compiler output.

This skill is for visual / layout / "rendered thing looks wrong" reports specifically.

## Verification

The next layout / visual bug in this repo: the first tool call after the user's report should be a DOM read or computed-style read. If a session transcript shows me reasoning about CSS before reading the DOM, the skill didn't fire — re-read this file and tighten the trigger.
