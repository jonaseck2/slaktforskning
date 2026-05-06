# Design spec: Undo / redo across the app

**Date:** 2026-05-06
**Status:** Design — needs ambition decision before implementation
**Source:** Beta tester report 81 (v0.215.2)

## User goal

The genealogist wants to be able to **undo a recent change** when they realize they've just done something wrong — and then optionally **redo** if they undid too far. The mental model is Word's Cmd+Z / Cmd+Shift+Z (multi-step) or at minimum a one-step undo.

The user themselves frames this as "the best of two worlds": Word's stack-based multi-step undo with reversible redo, plus tooltip text on the undo/redo buttons describing *what specifically* will be undone (e.g. "Undo: change person's sex").

The goal is calm recovery from mistakes, not a full transaction log. They flag that this is a substantial undertaking and ask us to bound the ambition before committing.

## Investigation: what already exists

This codebase already has an undo system. Per `.claude/rules/api.md` and the api/ surface:

- `src/api/undo.ts` — undo manager.
- `src/api/undo_wrappers.ts` — per-mutation wrappers (`createPersonUndo`, `deletePersonUndo`, `updatePersonUndo`, `createPersonWithEventUndo`, `addEventParticipantUndo`, …).
- `App.vue` already wires `undo:performed` and `undo:changed` IPC events; the Edit menu in `src/main/index.ts` (line 102+) has `Undo` (Cmd+Z) and `Redo` (Cmd+Shift+Z) entries firing `undo:undo` / `undo:redo` IPC calls.

So **the foundation exists**. What the user is asking for, mapped to the existing architecture:

1. A **visible affordance** in the renderer (not just a menu shortcut) — buttons in the toolbar / topbar.
2. **Tooltips on those buttons** that name the specific action that will be undone — the `label` field already exists on each `UndoEntry` (e.g. `'undo.deletePerson'`, `'undo.createPersonWithEvent'`), so this is mostly i18n + wiring.
3. **Confirm coverage**: every user-visible mutation has an undo wrapper. Audit which mutations don't go through `undo_wrappers.ts` today.

This makes the implementation much smaller than the user's framing suggests.

## The ambition decision

The user proposed three levels in their report. Mapped to the existing architecture:

### Level 1 — surface what already exists (small)

- Add visible Undo / Redo buttons to the topbar.
- Tooltips show the localized version of the next undo/redo entry's label (read from the existing manager's stack-top).
- Buttons disabled when the corresponding stack is empty.
- One i18n key per undo-label slug (`undo.createPerson` → "Skapa person" / "Create person").

**Effort:** ~1–2 days. Touches App.vue / topbar, an icon set, and i18n.

### Level 2 — verify coverage + add wrappers where missing (medium)

After surfacing Level 1, audit every IPC mutation channel and confirm there's an undo wrapper for it. Likely some mutations (settings changes, gazetteer config, link-rules edits) don't go through the wrapper — decide per-channel:

- **Worth undoing:** add the wrapper.
- **Out of scope** (e.g. database switch, UI preference): document and skip.

**Effort:** ~2–4 days. Touches every api/ function that mutates and isn't already wrapped.

### Level 3 — full audit log replayability (large, deferred)

The user's framing as "in the best of all worlds" — an event-sourced log that can replay the entire database from scratch. **Don't do this.** It's overkill for a single-user genealogy desktop app, and the existing undo manager is enough for the stated user goal.

The audit-log adjacency is the design spec for [`registration-history-design`](archive/2026-05-06-registration-history-design.md) — that's where Level 3 would naturally live, as a future plan if multi-user collaboration ever ships.

## Recommendation

**Ship Level 1 now.** The foundation already exists; the gap is just visibility + tooltip text. After it ships, run Level 2 as a follow-up if the user finds gaps in coverage.

Defer Level 3 indefinitely.

## Open questions for the user

- **Where does the toolbar live?** The current topbar (App.vue) has appearance / TTS / database controls. Adding two more icons is fine, but they should be placed logically — probably to the left of the appearance panel.

- **Keyboard shortcut conflicts?** `Cmd+Z` already wired via the Edit menu; nothing more needed for keyboard. The visible buttons are for discoverability.

- **Tooltip text shape:** `"Ångra: Skapa person"` vs `"Ångra"` (with the action only on hover delay) vs an inline label `"Ångra senaste ändringen"`? Default: `"Ångra: <localized action>"` — matches Gimp's Edit menu pattern that the user cited.

- **What happens after `App.vue` reload (window switch)?** The undo manager's stack lives in the worker thread (per the worker-thread architecture). Stack survives across renderer reloads. Confirm during impl.

- **What does Cancel-in-modal do to the undo stack?** Cancel doesn't write — nothing in the stack. Already correct; just confirm.

## Failure modes / RCA reference

- **Don't reinvent the manager:** the foundation exists. The plan ships visibility, not a new manager. Resist scope creep.
- **Tooltip empty when stack is empty:** the button must be visibly disabled (greyed out) AND its tooltip should explain why (`"Inget att ångra"` / `"Nothing to undo"`).
- **Per-window stack confusion:** if multi-window is active (Cmd+N opens a new window), is the undo stack shared or per-window? Confirm during impl. Probably shared (the worker holds the DB state). Document either way.
- **Undo of a sex-change after the [`sex-change-guard-design`](2026-05-06-sex-change-guard-design.md) plan ships:** undoing a confirmed gender_transition event must un-make the event and re-flip the sex flag. Already correct if the wrapper is `createPersonWithEventUndo`-shaped; verify when both plans are landing close together.
- **MCP-sourced mutations:** when an agent runs an MCP tool, does that go through the undo wrapper? Per the existing architecture, both UI and MCP paths call the same api/ functions; if the MCP path uses `createPerson` directly while the UI path uses `createPersonUndo`, the agent's writes are silently un-undoable. Worth auditing as part of Level 2.

## Sequence

1. User picks Level 1 vs Level 1+2 vs other ambition.
2. Implementation plan ships as `2026-05-06-undo-redo.md` covering the chosen scope.
3. Tooltip i18n keys land first (they're a one-liner per existing undo label), then the toolbar buttons + wiring.
