# Design — `tauri-window-api.ts` per-domain split (contingency)

**Roadmap reference:** [2026-05-14-audit-followup-roadmap.md](2026-05-14-audit-followup-roadmap.md) §3.6.

**Status: superseded by [plan 1.3 (Specta migration)](2026-05-14-specta-migration-design.md).** This design exists as a fallback only. If 1.3 lands, this plan is **not needed** — Specta replaces `tauri-window-api.ts` via codegen. Delete this design after 1.3 ships.

## User goal (fallback)

If plan 1.3 is descoped or blocked, the 1,302-LOC [`tauri-window-api.ts`](../../src/renderer/tauri-window-api.ts) still benefits from a mechanical per-domain split. Each `api.persons.*`, `api.places.*`, `api.events.*` (and 13 other domains) namespace gets its own file — even without typesafe codegen.

## Trigger

This plan executes only if **both** conditions hold:
1. Plan 1.3 (Specta migration) is descoped, blocked, or rejected for the foreseeable future.
2. `tauri-window-api.ts` remains the source of truth for renderer↔Rust IPC wiring.

## Scope (if triggered)

Decompose [`tauri-window-api.ts`](../../src/renderer/tauri-window-api.ts) into per-domain modules:

```
src/renderer/api/
  ├── index.ts          # mountWindowApi() entry; assembles api.* namespaces
  ├── persons.ts
  ├── places.ts
  ├── events.ts
  ├── sources.ts
  ├── citations.ts
  ├── media.ts
  ├── groups.ts
  ├── research-tasks.ts
  ├── relationships.ts
  ├── checks.ts
  ├── duplicates.ts
  ├── db.ts             # database-level: open, switch, stats
  ├── undo.ts
  ├── reports.ts
  ├── settings.ts
  ├── import-export.ts
  ├── app.ts            # updater, third-party-licenses, etc.
  ├── onboarding.ts
  └── shared.ts         # invoke helpers, error mapping, common scaffolding
```

[`tauri-window-api.ts`](../../src/renderer/tauri-window-api.ts) becomes a thin re-export: `import { mountWindowApi } from './api'; export { mountWindowApi };`. Or deleted entirely once call sites import from `./api`.

### Scope deviations

- **Non-IPC polyfills** (auto-update warn-swallow, third-party-licenses fallback, onboarding LocalStorage) move into their respective domain files (e.g., `app.ts` gets the updater polyfill).
- **No type-safety improvement.** This is *purely* a file split. Renaming a Rust command still produces a runtime crash, not a TypeScript error — that's what 1.3 was for. The user goal here is reduced when 1.3 is unavailable.

## Verification

Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md):

1. **`tauri-window-api.ts` does not exist** as a 1,302-LOC file. Either deleted or shrunk to a thin re-export ≤ 50 LOC.
2. **`src/renderer/api/` contains 19+ files** corresponding to the existing `api.*` namespaces.
3. **Per-file LOC under 400.** No file in `src/renderer/api/` exceeds 400 LOC.
4. **All renderer call sites unchanged.** `tsc --noEmit` passes; `npm test` exits 0; `npx playwright test` 4 projects pass.

### Dependencies

This plan is the *negation* of 1.3 landing. If 1.3 ships, this plan is deleted.

## Failure modes / RCA reference

The risk of executing this plan is **doing redundant work** when 1.3 should have been the answer. Before executing 3.6, re-evaluate whether 1.3's blocker is genuinely structural or just a sequencing issue. If 1.3 can land in 2–3 months, wait for it rather than doing 3.6.

## Effort (if triggered)

1.5 days. Mechanical file moves + import-path updates + verification.

## Tasks (if triggered)

- [ ] Re-confirm 1.3 (Specta migration) is genuinely blocked, not just deferred.
- [ ] Create `src/renderer/api/` directory.
- [ ] Move each `api.<domain>` block from `tauri-window-api.ts` → per-domain file.
- [ ] Move non-IPC polyfills to their domain files.
- [ ] Write `src/renderer/api/index.ts` `mountWindowApi()` that assembles `window.api.*`.
- [ ] Shrink or delete `tauri-window-api.ts`.
- [ ] Run `tsc --noEmit`, `npm test`, `npx playwright test`.
- [ ] Self-review checklist.
