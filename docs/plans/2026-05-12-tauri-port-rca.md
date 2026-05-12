# Tauri port — RCA + lessons learned

> Not an implementation plan. A retrospective. Captured 2026-05-12 against the Tauri full-port close-out (merge commit `e721b588`, archive commit `dc920a1d`) before context compaction loses granular detail. Output: a classified inventory of what slipped, a root-cause analysis that maps every surfaced gap to one of four underlying causes, and a list of structural mitigations — some already in flight, the rest queued — that close each cause class rather than each symptom.

## Why this exists

The Tauri full-port plan archived at version `0.252.0` on 2026-05-11 with every verification gate it named met (3925 tests passing, lint clean, Holger reference GEDCOM round-tripped via the running Tauri build, Windows smoked). Within the same session, the user surfaced gap after gap that should have been part of "done":

- `npm start` ran `electron-forge start` (broken — Electron deps removed; renderer pulled `node:fs`).
- `npm run make` / `npm run package` / `npm run publish` were also broken in the same way.
- The Cargo crate was still named `tauri-spike`; the inner Mach-O binary inherited that name.
- The Tauri bundle identifier was `com.slaktforskning.tauri-spike`; user data lived under that path.
- A 30 MB inlined gazetteer chunk OOM'd `npm run build` on the default Node heap.
- Once built, the bundle pinned WebKit at 100% CPU / ~4 GB RSS at boot, parsing 70 MB of inlined gazetteer JSON in one microtask burst.
- macOS Launch Services cached a stale Electron build's path as the canonical `Släktforskning` app; double-clicking "Släktforskning" from Spotlight launched a months-old `.app` from a deleted worktree.
- `src-tauri/examples/walfix.rs` duplicated `scripts/walfix.mjs` (both did the same WAL→DELETE recovery).
- `vite.renderer.config.ts` (Electron) and `vite.tauri-renderer.config.ts` (Tauri) coexisted; the Tauri one was the only build-relevant config but the file naming hid that.
- The CI workflow `ci.yml` had triggered on a deleted branch (`tauri-full-port`), had stale `tauri-spike` cache paths, an empty `- run: ` step from a bad sed during the Electron-retire cleanup, and didn't run `npm test` or `npm run lint` at all — only `npm run build`.
- 75 commits sat unpushed to `origin/main` at archive time; CI had run zero verification against the merged state.
- E2E tests (Playwright) fail when actually run today — `[smoke]` and `[duplicates]` projects both throw renderer-script timeouts.
- E2E projects are named `smoke`, the same word the user has flagged as an antipattern (the `[smoke]` project's existence was missed; if it had been run as part of close-out it would have caught at least the boot regression).

Every one of these was surfaced by the user, not by me, in succession. The pattern itself — *I marked the plan done; the user found broken thing after broken thing* — is the RCA's real subject. The individual breakage are symptoms; the failure to surface them in advance is the disease.

## Failure inventory, classified

Each gap maps to exactly one root-cause class (RC1–RC4 below). Multiple gaps per class is the norm — a single root cause produces many surface failures.

| # | Surface gap | Root cause |
|---|---|---|
| 1 | `npm start` runs `electron-forge start` after Electron retired | RC1 |
| 2 | `npm run make` / `package` / `publish` likewise | RC1 |
| 3 | Cargo crate name `tauri-spike` | RC2 |
| 4 | Tauri identifier `com.slaktforskning.tauri-spike` | RC2 |
| 5 | Renderer OOM in `npm run build` (default Node heap) | RC1 + RC3 |
| 6 | Renderer at 100% CPU / 4 GB RSS at boot (inlined gazetteers) | RC3 |
| 7 | Launch Services cached stale Electron `.app` from deleted worktree | RC1 |
| 8 | Duplicate `walfix.rs` + `walfix.mjs` | RC2 |
| 9 | `vite.renderer.config.ts` (Electron) coexisting with `vite.tauri-renderer.config.ts` (Tauri) | RC2 |
| 10 | `ci.yml` triggered on deleted branch, stale paths, empty `- run: `, didn't run `npm test`/`npm run lint` | RC1 + RC4 |
| 11 | 75 commits unpushed → zero CI validation of the merged state | RC4 |
| 12 | Playwright `[smoke]` + `[duplicates]` tests fail when actually run | RC4 |
| 13 | Playwright projects named `smoke` (antipattern naming + symptom of not being run) | RC4 |

Other latent gaps from the audit that surfaced *during* this RCA's drafting (i.e. things still not surfaced by the user yet, but visible to anyone who looks):

| # | Latent gap | Root cause |
|---|---|---|
| 14 | `package.json` `version` is `0.253.1` but `src-tauri/Cargo.toml` is `0.1.0` and `tauri.conf.json` is `0.1.0` | RC2 |
| 15 | `THIRD_PARTY_LICENSES.txt` claims Electron deps in the historical CHANGELOG entry — no Tauri Rust crate licenses are surfaced anywhere | RC1 |
| 16 | `release.yml` (post-rename of `release-tauri.yml`) hasn't been audited for the same kind of stale references `ci.yml` had | RC4 |

## Root-cause analysis

Four root causes. Each is named, then mapped to the gaps it produced.

### RC1 — The close-out skipped "remove the safety net" as if it were post-launch follow-up

**Statement.** The completion-plan explicitly carved out *"Cluster legacy delete (§4) is out of scope — sequenced as post-launch follow-up because nothing can be deleted until the gap-closing work has zero references to it."* I followed that as written. But the plan's *user goal* — *"I install one Slaktforskning binary, get the Tauri app, and nothing about my workflow changes"* — could not be true while `npm start` ran a deleted binary. The plan's verification gates were satisfied; the plan's user goal was not.

**Why this escaped:** the `.claude/rules/plans.md` rule says *Verification by user-observable outcome* and lists *Hygiene-as-verification* as an explicit anti-pattern. The Tauri close-out used the hygiene gates (tests + lint + Holger import via MCP) and treated those as verification of the user goal. The user-observable outcome (`npm start` works, `npm run build` works, the bundled `.app` boots without thrashing) was never tested.

**Why I followed the plan's bad carve-out:** the plan said it explicitly. I treated the plan as the contract, not the user goal. This is exactly what `.claude/rules/plans.md` Rule 1 (user-goal-first) is written against.

**Gaps it produced:** 1, 2, 5 (partly), 7, 10 (partly), 15.

### RC2 — Renames + deletes were scoped as "internal cosmetics", missing that they were load-bearing

**Statement.** `tauri-spike` is in the bundle identifier (the user-data path), the inner Mach-O name, the Cargo `[lib]` symbol called from `main.rs`, the Tauri product-name path, every `Info.plist` field, the `ps aux` output, and the Spotlight identity. None of these are "cosmetic." Same for `vite.renderer.config.ts` (Electron) vs `vite.tauri-renderer.config.ts` (Tauri) coexisting — *both files* compiled to plausible-looking configs and only one was load-bearing; the other was dead but indistinguishable from its replacement by filename.

**Why this escaped:** I parsed "spike" as a developer-mental-model label and didn't recognize that it was also the data-folder name a user would type into Finder. I parsed `vite.tauri-renderer.config.ts` as "the Tauri variant" and didn't recognize that having two renderer configs meant the codebase had two answers to "where does the renderer build live" — a contradiction the next-best-Vite-config-file-finder hits at random.

**Why I followed it:** I treated renames as a Round 7 polish task. The user surfaced them as Round 1 issues that should have been gates.

**Gaps it produced:** 3, 4, 8, 9, 14.

### RC3 — A spike-era performance shortcut shipped to production as the default

**Statement.** `src/renderer/empty-gazetteers.ts` uses `import.meta.glob('../api/place-gazetteers/data/*.json', { eager: true, import: 'default' })`. In dev mode (Vite dev server), the eager-glob is paginated over many HTTP fetches and the event loop runs between each. In production (rolled-up bundle), the same eager-glob inlines all 72 JSON files (~70 MB raw) into one chunk that parses in a single microtask burst at module init. The dev experience hid the production problem.

**Why this escaped:** the dev experience and the prod experience diverge structurally, and we tested in dev. The completion-audit named the gazetteer bundling but assumed the dev-vs-prod divergence didn't matter at that surface. The Tauri full-port plan's verification §1 step 4 ("Cross-platform smoke ... 10 highest-traffic flows pass on macOS + Windows + Linux") *should* have caught this — but the "smoke" framing meant nobody ran the prod build to its working state.

**Gaps it produced:** 5 (partly), 6.

### RC4 — The verification infrastructure was decorative, not load-bearing

**Statement.** CI existed (`tauri-ci.yml`, renamed to `ci.yml` during cleanup). Playwright existed. Both were unrun:

- The renamed `ci.yml` had an empty `- run: ` line from a bad sed in the Electron-retire cleanup, didn't run `npm test` or `npm run lint`, triggered on a deleted branch, and had stale paths in its cache key + artifact name. It was a workflow that wouldn't have caught anything even if it had run.
- 75 commits sat on local `main` without being pushed. Zero CI runs validated the merged state. The workflow's failure modes (above) wouldn't have triggered against `origin/main` because nothing arrived there.
- Playwright tests exist (`tests/e2e/*.spec.ts`, `app.test.ts`, `crud-roundtrip.test.ts`, `duplicates.spec.ts`, `website-export.test.ts`) and the Playwright `[smoke]` project covers boot + Vue mount. The `[smoke]` project is *exactly* the automated equivalent of the manual smoke I kept proposing. Running it as part of close-out would have caught the boot regression. Nobody ran it.
- The Playwright projects are *named* `smoke` — the same word the user has flagged as antipattern. The name itself, by encoding the user-rejected concept, signaled "this is manual / aspirational" to whoever last touched the file; calling them what they are (`boot`, `crud`, etc.) would have changed how they're treated.

**Why this escaped:** I treated "tests are green" as evidence the test suite was real. Whether the test suite actually exercised the *new* runtime end-to-end was never asked. The Playwright suite is the answer to "would a manual smoke have caught this?" — and I never ran it as part of close-out.

**Gaps it produced:** 10 (mostly), 11, 12, 13, 16.

## What's already in flight (partial; this RCA halts mid-stream)

Stopped mid-Round-1 to write this. Pre-RCA in-flight work:

- `.claude/rules/plans.md` — "Manual smoke as a process fix" added to the anti-patterns list. "Verification discipline at close-out" section added: evidence (test counts, exit codes, run outputs) is required before archive, not assertion. **Committed at `287fa1a6`.**
- `.github/workflows/ci.yml` — rewritten from the broken state. Now: triggers on push to `main` + PRs into `main`, splits into a `unit` job (lint + vitest on Linux) and a cross-OS `build` job. **Not yet committed.**
- `tests/unit/scripts.npmScripts.test.ts` — new file. Asserts every script in `package.json` is either explicitly exercised here (`lint`, `build:static`, `build:third-party-licenses`, `build:mcp-sidecar`) or in a `SKIPPED_WITH_REASON` map with a one-line reason. Each exercised script is subprocess-run via `npm run --silent <name>` and expected to exit 0. **Not yet committed.**
- `CLAUDE.md` "Finishing a plan" checklist — new step 0 prepended: produce evidence the Verification §1 criteria are met; the executor invokes `superpowers:verification-before-completion` explicitly. **Not yet committed.**
- `feedback_rules_belong_in_workspace.md` — new memory entry. Project-wide rules live in `.claude/rules/`; memory is for user-specific context only. **Saved + indexed.**

## What's not fixed yet (queued by class)

### Class RC1 (close-out skipped legacy delete)

- The 75 unpushed commits. Push these once the in-flight work above is committed; CI runs against the merged state. Required to close RC4 too.
- `THIRD_PARTY_LICENSES.txt` enumerates only npm production deps; Rust crate licenses (rusqlite, tauri, tauri-plugin-*) are emitted by `cargo about` or equivalent at build time and not currently surfaced in the bundle. Plan: add a Rust-side license enumerator step in the build pipeline + bundle both `LICENSES_NPM.txt` + `LICENSES_CARGO.txt` (or merge into the existing file). **Needs a follow-up plan.**

### Class RC2 (renames missed as load-bearing)

- `tauri-spike` → `slaktforskning` rename. Plan exists: [`docs/plans/2026-05-12-rename-tauri-spike.md`](2026-05-12-rename-tauri-spike.md). Scope is comprehensive (Cargo, Tauri identifier, e2e fixture, CI cache keys, MCP-tauri script, skill docs). Decision pending: identifier rename (no migration since no public users).
- Version drift: `package.json` `0.253.1`, `Cargo.toml` `0.1.0`, `tauri.conf.json` `0.1.0`. The rename plan should also synchronize versions (or carve out a tiny follow-up plan).

### Class RC3 (eager gazetteer bundling)

- Plan exists: [`docs/plans/2026-05-12-gazetteer-lazy-chunks.md`](2026-05-12-gazetteer-lazy-chunks.md). Switch `import.meta.glob({ eager: true })` → lazy chunks. Removes the `NODE_OPTIONS=--max-old-space-size=8192` workaround. Closes the 100% CPU / 4 GB RSS at-boot symptom.

### Class RC4 (verification infrastructure was decorative)

- Run `npx playwright test` once the in-flight unit-test commit lands. **The current run fails** — `[smoke]` and `[duplicates]` projects throw `executeJs: renderer script timed out`. These need diagnosis (likely Tauri-binary-path issues in the fixture after the renames already in `e2e/fixture.ts`, or a `dist-tauri/` vs `dist-static/` confusion).
- Rename the Playwright `[smoke]` project. Candidate: `[boot]` (what it actually tests). Touches `playwright.config.ts` + the project's tag string in tests that select on project name. Done as part of the e2e fix above.
- Audit `release.yml` for the same class of stale references `ci.yml` had. Currently triggered only on tags; safer than `ci.yml` was but not verified.
- Add `tests/e2e/` to the close-out evidence requirement in `CLAUDE.md`. Currently the checklist says "produce evidence" but doesn't name e2e specifically — and the e2e suite is the closest thing to a real boot-and-walk-the-app check.

## Lessons that change the standing rules

Three rule-level changes; one skill-level change; one CLAUDE.md change. All of these are general (apply to every future plan close-out), not specific to the Tauri port.

### L1 — A plan whose verification gates can pass while the user goal fails is a broken plan

The Tauri full-port plan's User goal said *"nothing about my workflow changes"*. Its verification §1 said tests + lint + Holger import via MCP + cross-platform smoke. The user goal could be false while every verification item was true (and was: `npm start` was broken while every verification item passed).

The rule: **a plan's verification section is wrong if it doesn't include a check that, if failed, would make the user goal false.** Reading a plan's preamble, the executor asks: "if these verification items all pass, can the user goal still be unmet?" If yes, the verification section has holes; surface them and fix the plan before starting work.

This rule lands in `.claude/rules/plans.md` as a new section (companion to the existing "Verification" required-section description).

### L2 — Carve-outs of cleanup work are scope errors disguised as scope decisions

The completion-plan said *"Cluster legacy delete is out of scope — post-launch follow-up because nothing can be deleted until the gap-closing work has zero references to it."* That's a true statement about *ordering* (you can't delete what's still referenced) but it was misread as a statement about *necessity* (it's optional / can wait). The result: the Electron `npm start` script was treated as benign leftover instead of broken user-facing surface.

The rule: **if removing code is required for the user goal to be reachable, that removal is in-scope.** Carve-outs of cleanup are legitimate only when the carved-out work is truly orthogonal to the user goal. The test: read the user goal aloud, then ask "is the carved-out work load-bearing for any verb in this sentence?" If yes, it's in scope.

### L3 — "Smoke" is an antipattern as a noun, a verb, and a project name

The user has stated this directive multiple times. Manual smoke as a process step is a wish that someone will be diligent — tests run on every push are mechanical. Manual smoke as a name for an automated boot check (`Playwright [smoke]` project) signals "this is aspirational" to whoever next touches the file and de-prioritizes running it. Both are antipattern.

The rule: **the word "smoke" doesn't appear in the project's process documentation or in code identifiers.** Tests are tests. Boot checks are boot checks. If a check is automated, name it after what it checks (`boot`, `crud`, `bundle`, …). If a check is manual, *that's the problem to fix*, not the name to keep.

This rule lands in `.claude/rules/plans.md` (already partially, as the "Manual smoke as a process fix" anti-pattern entry) and in a separate audit of every `smoke` identifier in the codebase. The Playwright rename is the first instance.

### L4 — `superpowers:verification-before-completion` is mandatory at archive time, not optional

I had the skill. I didn't invoke it. The skill exists exactly for this case: "evidence before assertions, always". The fact that I didn't invoke it for the Tauri close-out means either the trigger wasn't loud enough or I rationalized that "the plan's gates passed = no need to verify".

The rule: **every plan close-out commit explicitly invokes `superpowers:verification-before-completion`.** Not as a procedural step; as a required gate. The close-out commit message names the evidence: `npm test → 3996 passed`, `npm run build → exit 0 in 2:17`, `npx playwright test → exit 0`, `ui_aria_audit() → N findings of the kinds the plan named`.

This rule lands in `CLAUDE.md`'s "Finishing a plan" section (already started in the in-flight commit; will land + push).

### L5 — Project rules go in workspace, never in user memory

Already captured in [feedback_rules_belong_in_workspace.md](../../memory/feedback_rules_belong_in_workspace.md). Symptom in this incident: I wrote `feedback_no_smoke_checks.md` to memory before the user pointed out it belongs in `.claude/rules/`. Even one round of "save to memory → user-corrects → move to workspace" is waste; the right default is workspace from the first save.

## Mitigation map: every gap class → the structural fix that closes it

| Root cause | Structural fix | State |
|---|---|---|
| RC1 (close-out skipped legacy delete) | L1 + L2 in `.claude/rules/plans.md`; CLAUDE.md checklist step 0 (evidence) + step 7 (push) | In flight |
| RC2 (renames missed as load-bearing) | The rename plan (`2026-05-12-rename-tauri-spike.md`); a "renames are part of the plan, never post-archive" addition to plans.md | Plan written, rule TBD |
| RC3 (eager gazetteer bundling) | Lazy-chunks plan (`2026-05-12-gazetteer-lazy-chunks.md`); remove the heap-bump workaround in the same commit | Plan written |
| RC4 (verification infrastructure decorative) | New `ci.yml` runs lint + tests + cross-OS build; new `scripts.npmScripts.test.ts`; L4 mandating `superpowers:verification-before-completion`; e2e suite repaired + `[smoke]` renamed | Partial; in flight |

## Verification of this RCA

This RCA is "complete" when:

1. Every gap in the inventory above maps to exactly one of the four root-cause classes (every gap accounted for; no orphans).
2. Every root-cause class has a named structural fix; the fix is either landed, in flight, or in a referenced plan.
3. The lessons L1–L5 either land in `.claude/rules/` + `CLAUDE.md` + memory in this session, or have a follow-up commit queued.
4. A re-walk of the close-out (running the new `ci.yml` matrix, the new `scripts.npmScripts.test.ts`, the renamed e2e suite, the rename plan's mechanical check) would have caught every gap in the inventory before archive.

Item 4 is the strongest test. The RCA is complete when I can list each gap and point at the specific automated check that would have failed loud enough to block the archive commit.

## Open questions for the user

Before executing the queued fixes, three decisions need alignment:

1. **L1 + L2 + L3 as new sections in `.claude/rules/plans.md`** — agreed shape, or do you want to push back on framing?
2. **`AGENTS.md` vs `CLAUDE.md`.** You mentioned `AGENTS.md` (the cross-tool conventional name). Currently the project has `CLAUDE.md`. Do you want me to (a) create `AGENTS.md` as the canonical, leave `CLAUDE.md` as an alias / pointer, or (b) keep `CLAUDE.md` canonical and skip `AGENTS.md`? Other tools (Codex, Cursor) increasingly look for `AGENTS.md`; switching is conventional.
3. **Push the 75 commits to `origin/main`.** I have not pushed any of this session's work. The first push will trigger the rewritten `ci.yml` against macOS/Windows/Linux all at once — that's the loudest test the new infrastructure gets. Approve, or hold for one more local pass?

## Tasks discovered during execution

(Empty for now. Used to track gaps surfaced in the act of writing this RCA that don't yet have plan files.)
