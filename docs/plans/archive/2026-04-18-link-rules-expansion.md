# Link Rules Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add link rule sets for German, Danish, and Norwegian genealogy platforms, expand existing Swedish and English rule sets, fix LinkedText to respect db config, and add locale toggles for the new locales.

**Architecture:** Each locale gets its own rule file in `src/api/link-rules/` exporting a `LinkRule[]` array (same pattern as `sv.ts` and `en.ts`). The `LinkRulesView` imports all rule sets and adds locale toggle checkboxes. `LinkedText` is fixed to load and apply `link_rules_config` from db settings instead of hardcoding all rules as enabled.

**Tech Stack:** TypeScript, Vue 3, Vitest

---

## Task 1: German rule set (`src/api/link-rules/de.ts`)

- [x] Create `src/api/link-rules/de.ts` with the following rules:

---

## Task 2: Danish rule set (`src/api/link-rules/da.ts`)

- [x] Create `src/api/link-rules/da.ts` with the following rules:

---

## Task 3: Norwegian rule set (`src/api/link-rules/no.ts`)

- [x] Create `src/api/link-rules/no.ts` with the following rules:

---

## Task 4: Swedish rule additions (`src/api/link-rules/sv.ts`)

- [x] Add two rules (SVAR, DDB) to the existing `svRules` array in `src/api/link-rules/sv.ts`

---

## Task 5: English/international rule additions (`src/api/link-rules/en.ts`)

- [x] Add four rules (MyHeritage, Geni, WikiTree, BillionGraves) to the existing `enRules` array in `src/api/link-rules/en.ts`

---

## Task 6: Update imports in consuming files

- [x] Update `src/renderer/views/LinkRulesView.vue` — import new rule sets and add to `allDefaults`
- [x] Add locale toggle checkboxes in the template (de, da, no after the English toggle)

---

## Task 7: Unit tests for all new rules (`tests/unit/source-linker.test.ts`)

- [x] Add test blocks for each new rule set (6 describe blocks, 15 new tests, total 35 tests in file)

---

## Task 8: Fix LinkedText to use db config

- [x] Rewrite `src/renderer/components/LinkedText.vue` `<script setup>` to load and apply `link_rules_config` from db settings

---

## Task 9: i18n keys

- [x] Add `german`, `danish`, `norwegian` locale labels to `src/renderer/i18n/en.ts`
- [x] Add `german`, `danish`, `norwegian` locale labels to `src/renderer/i18n/sv.ts`

---

## Task 10: Lint and full test suite

- [x] Run `npm run lint` — 0 errors
- [x] Run `npm test -- --run` — 1409/1412 pass (3 pre-existing circleLayout failures unrelated to this work)
- [x] Verify source-linker test file: 35 tests pass

---

## Files Changed

| File | Action |
|------|--------|
| `src/api/link-rules/de.ts` | Created (3 rules: Archion, Matricula, Ancestry.de) |
| `src/api/link-rules/da.ts` | Created (2 rules: Arkivalieronline, KIP) |
| `src/api/link-rules/no.ts` | Created (2 rules: Digitalarkivet, Arkivverket) |
| `src/api/link-rules/sv.ts` | Edited (added SVAR, DDB) |
| `src/api/link-rules/en.ts` | Edited (added MyHeritage, Geni, WikiTree, BillionGraves) |
| `src/renderer/views/LinkRulesView.vue` | Edited (imports + allDefaults + de/da/no toggles) |
| `src/renderer/components/LinkedText.vue` | Edited (loads link_rules_config from db, uses resolveRules) |
| `src/renderer/i18n/en.ts` | Edited (german, danish, norwegian keys) |
| `src/renderer/i18n/sv.ts` | Edited (german, danish, norwegian keys) |
| `tests/unit/source-linker.test.ts` | Edited (6 new describe blocks, 15 new tests) |
| `docs/PLAN.md` | Updated (v0.107.0 row, removed roadmap entry) |
| `docs/plans/archive/2026-04-18-link-rules-expansion.md` | Created (this file) |
| `package.json` | Version bumped 0.106.0 → 0.107.0 |

## Post-implementation

- [x] Update `CLAUDE.md` — add `de.ts`, `da.ts`, `no.ts` to the File Map under `link-rules/`
- [x] Update `docs/PLAN.md` — mark link rules expansion milestone as done
- [x] Bump minor version in `package.json` (0.106.0 → 0.107.0)
