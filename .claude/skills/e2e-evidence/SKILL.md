---
name: e2e-evidence
description: Decide which Playwright tier to run, capture the right evidence for plan close-out, and route work into the right project. Use when finishing a plan (gate before archive), when adding an e2e test (which project gets the spec), when CI fails on `[boot]` / `[crud]` / `[panels]` / `[reactivity]` / `[imports]` and you need to know which user-goal it protects, or when the question is "is `npm run test:e2e` enough or do I need `:full`?".
---

# Playwright tiers & close-out evidence

## The two tiers

```bash
npm run test:e2e        # Tier 1 — 4 projects, always required
npm run test:e2e:full   # Tier 2 — 7 projects, required when UI / panels / data-changed fan-out / importers are touched
```

| Tier | Projects | When required as close-out evidence |
|---|---|---|
| **Tier 1** (`test:e2e`) | `boot`, `crud`, `website-export`, `duplicates` | Every plan. These are the core user-observable surfaces — app launches, basic CRUD round-trips, website export produces a valid SPA, duplicate-finding works. Never archive without all four green. |
| **Tier 2** (`test:e2e:full`) | Tier 1 + `panels`, `reactivity`, `imports` | Any plan whose user goal touches a panel, modal, list-view, importer, or `data-changed` consumer. The Tauri full-port close-out failed because nobody ran the suite that observed the boot regression — same shape applies to panel/reactivity/import regressions today. |

Non-UI plans (Rust-side-only changes, schema-only migrations, doc-only) are exempt from Tier 2 and only need Tier 1.

## What each project protects

- **`boot`** — `npm start` doesn't immediately crash; the renderer mounts, the Rust host opens a DB, the first view paints. This is the project that would have caught the Tauri-port `npm start = electron-forge start` regression.
- **`crud`** — minimum-viable round-trip: create-person → edit → delete via the running UI + IPC + rusqlite. Any regression in the api/ layer that breaks normal mutations surfaces here.
- **`website-export`** — `npm run build:static` plus an `archive:export` round-trip produces a valid static SPA. Protects the read-only viewer surface.
- **`duplicates`** — `find_duplicates` from the running app surfaces real matches. Protects the duplicate-detection user goal end-to-end.
- **`panels`** — every right-side panel renders, expand/collapse works, sections honor their CTAs. Protects the panel-composables convergence work (v0.190.x).
- **`reactivity`** — mutations broadcast `data:changed` and downstream views (lists, badges, charts) update without route changes. Protects the `mutating: true` flag and the auto-walk fan-out.
- **`imports`** — Gramps / RootsMagic / Holger / GEDCOM round-trips succeed against fixture files. Protects the importer wiring (file picker → bytes → transform → rusqlite write → `fireDataChanged`).

## Required close-out evidence

The plan close-out commit message (or close-out session note) must contain the actual output, not a claim:

```
npm test          → N passed (Xs)
npm run build     → built in Xs (exit 0)
npm run test:e2e  → 4 passed (Xs) across [boot] [crud] [website-export] [duplicates]
                    — required for every plan
npm run test:e2e:full → 7 passed (Xs) across the 4 above + [panels] [reactivity] [imports]
                    — required when the user goal touches UI / panels / data-changed / importers
```

Paste the tail lines, not summaries. Per `.claude/rules/plans.md` "Verification discipline at close-out": *"Tests should pass after this change"* is not evidence; the tail of `npm test` showing N passed is.

## A broken e2e suite blocks archive

If `[boot]` / `[crud]` / any Tier 1 project is failing or flaky, the plan trying to archive owns either fixing it or filing a separate plan that explicitly covers fixing it before close-out. "The suite was already broken" is not a pass — it adds a layer the next contributor has to peel back.

## Direct-to-main vs PR

Both paths are legitimate. The rule is the verification, not the path.

- **PR.** CI runs Tier 1 + Tier 2 on every push; iterate on red. Evidence-before-push isn't strictly required — CI is the appropriate verification surface.
- **Direct merge to `main`** (the common case for solo plan-driven work here, and for small fixes). The executor runs Tier 1 (and Tier 2 if UI-touching) locally before push and captures the output in the commit message. Direct-to-main without local-green is the failure mode the Tauri-port RCA called out. After merging the worktree branch into `main`, push `main` itself — don't push the feature branch to `origin/main` by mistake.

## When to add a new project vs extend an existing one

Add a new Playwright project only when the user-observable surface it protects is genuinely orthogonal to the seven that exist. The naming rule (per `.claude/rules/plans.md` L3): the project name describes what it protects (`boot`, `crud`, `panels`), never aspirational labels like `smoke` or `nightly`.

Extend an existing project (add a spec under `tests/e2e/<project>/`) when the new scenario is a deeper test of an already-covered user goal.

## Reference

- `playwright.config.ts` — project definitions and per-project filters
- `tests/e2e/` — specs grouped by project name
- `.claude/rules/plans.md` — close-out evidence rules (L1, L6, L7)
- `package.json` — `test:e2e` (Tier 1) and `test:e2e:full` (Tier 2) script definitions
