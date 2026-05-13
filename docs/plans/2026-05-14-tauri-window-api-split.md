# `tauri-window-api.ts` Per-Domain Split — Contingency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Status:** **Contingency — executes only if plan 1.3 (Specta migration) is descoped.** Otherwise delete this plan after 1.3 ships.

**Goal:** Decompose `src/renderer/tauri-window-api.ts` (1,302 LOC) into per-domain files under `src/renderer/api/`. Mechanical split; no type-safety improvement (that's 1.3's job).

**Architecture:** One file per `api.<domain>` namespace. `index.ts` re-mounts `window.api.*` for the renderer. Non-IPC polyfills (auto-update warn-swallow, third-party-licenses, onboarding LocalStorage) move into their respective domain files.

**Tech Stack:** TypeScript.

**Design doc:** [2026-05-14-tauri-window-api-split-design.md](2026-05-14-tauri-window-api-split-design.md)

---

## Trigger gate

- [ ] **Re-confirm plan 1.3 is genuinely blocked**, not just deferred. If 1.3 can land in 2–3 months, wait for it instead. If 1.3 is rejected for the foreseeable future, proceed.

---

## File Structure

| Path | Purpose |
|------|---------|
| `src/renderer/api/index.ts` | **New.** `mountWindowApi()` assembles `window.api.*`. |
| `src/renderer/api/shared.ts` | **New.** `invoke()` wrapper, error mapping. |
| `src/renderer/api/{persons,places,events,sources,citations,media,groups,research-tasks,relationships,checks,duplicates,db,undo,reports,settings,import-export,app,onboarding}.ts` | **New.** One file per `api.*` namespace. ~18 files. |
| `src/renderer/tauri-window-api.ts` | **Thin re-export OR deleted.** |
| `CHANGELOG.md` | Unreleased entry. |

---

## Tasks

### Task 1: Inventory the current namespaces

- [ ] `grep -nE "api\.\w+\s*=" src/renderer/tauri-window-api.ts | awk -F'.' '{print $2}' | awk '{print $1}' | sort -u` — produces the per-domain list.
- [ ] Compare to the File Structure list above; adjust if domains differ.

### Task 2: Create directory + shared helpers

- [ ] `mkdir -p src/renderer/api`
- [ ] Extract the `invoke()` wrapper and any error-mapping helpers from current `tauri-window-api.ts` to `src/renderer/api/shared.ts`.
- [ ] Commit.

### Tasks 3–N: One task per domain

For each domain (persons, places, events, …), in order of size (small first):
- [ ] Cut the `api.<domain>.*` block from `tauri-window-api.ts` to `src/renderer/api/<domain>.ts`.
- [ ] Export a function `mountFooApi(api: WindowApi)` from the new file that wires its namespace.
- [ ] Add to `src/renderer/api/index.ts`:
  ```typescript
  import { mountPersonsApi } from './persons';
  // ...
  export function mountWindowApi(api: WindowApi) {
    mountPersonsApi(api);
    // ...
  }
  ```
- [ ] Update the renderer's `tauri-window-api.ts` to delegate to `mountWindowApi`.
- [ ] `tsc --noEmit` passes.
- [ ] Commit per domain.

### Task X: Move non-IPC polyfills

- [ ] Auto-update warn-swallow (current `tauri-window-api.ts:1125`) → `src/renderer/api/app.ts`.
- [ ] Third-party-licenses fallback → `src/renderer/api/app.ts`.
- [ ] Onboarding LocalStorage shim → `src/renderer/api/onboarding.ts`.
- [ ] Commit.

### Task Y: Delete or shrink `tauri-window-api.ts`

- [ ] If only `import { mountWindowApi } from './api'; mountWindowApi(window.api);` remains: delete the file. Update any importers to call `mountWindowApi` directly.
- [ ] Otherwise: shrink to ≤ 50 LOC.
- [ ] Commit.

### Task Z: Verification

- [ ] `wc -l src/renderer/api/*.ts` — every file ≤ 400 LOC.
- [ ] `tauri-window-api.ts` is ≤ 50 LOC or absent.
- [ ] `tsc --noEmit` + `npm test` + `npx playwright test` all green.
- [ ] CHANGELOG Unreleased entry.

```bash
git add CHANGELOG.md
git commit -m "chore: changelog for tauri-window-api per-domain split (contingency)"
```

---

## Self-review checklist

- [ ] `tauri-window-api.ts` ≤ 50 LOC (or absent).
- [ ] `src/renderer/api/` has ~19 files.
- [ ] Per-file LOC ≤ 400.
- [ ] All four Playwright projects pass.
- [ ] CHANGELOG entry.

## Failure modes / RCA reference

- **Doing redundant work.** If 1.3 (Specta) becomes viable mid-execution, stop this plan and pivot. Specta replaces this entire effort.
- **Half-migration.** Same all-or-nothing rule: all domains move in one PR.
