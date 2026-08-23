# Plan Authoring Rules

Loads when reading or writing files in `docs/plans/`. Project-local override; complements upstream `superpowers:writing-plans` rather than replacing it.

## Required sections, in order

Every plan in `docs/plans/` must open with these sections, in this exact order, before any "Tasks" or implementation detail.

### 1. User goal

The user-observable outcome the plan delivers. **Not** the mechanism. Written in plain language without naming a function, file, or composable.

- ✅ "Every right-side panel updates instantly when data changes, looks identical, and behaves identically across all paneled views."
- ❌ "Eliminate ~600 lines of duplicated panel code by extracting three composables and a shared shell."

If the user goal can't be stated without naming an internal artifact, go back to the user.

### 2. Scope (with deviations explicit at the top)

Every plan that introduces a reusable pattern (shell component, composable, helper, abstraction) must enumerate **every instance of that pattern in the codebase as a migration target**. Default assumption: all of them.

- Required: bullet list of every same-shaped component, file, or call site.
- Fewer than all? Add a **"Scope deviations"** subsection listing each non-target with a specific reason (not "out of scope" — name *why*).
- Flag any reusable shell that won't be applied everywhere — anti-consistency must be visible before execution starts.

### 3. Verification

Every plan ends its preamble (or precedes each task's checkboxes) with a "Verification" section naming:
1. The user-observable outcome (matches §1).
2. The check that proves it. Tests count only if they observe user goal, not structure. Lint, type-check, and "function exists" assertions are hygiene, not verification.

If the only verification is "vitest passes" for a feature whose user goal is user-observable (UI, MCP tool output, file output, gazetteer resolution), the plan is unverified. Add a test that exercises the user-observable behavior end-to-end.

**User-goal-falsifiability test.** Read the verification items aloud; ask: *"if every one of these passes, can the user goal still be unmet?"* If yes, the verification has holes. Surface them before starting; don't ship under hygiene-only gates.

### 4. Failure modes / RCA reference (when applicable)

If the plan follows a failed prior attempt — or addresses a class of bug seen before — include a "Failure modes / RCA reference" footer at the end of the preamble (before Tasks). Cite specific commits or prior plans.

### 5. Cleanup is in-scope when load-bearing

Carving "legacy delete" or "remove the safety net" out of a plan as *post-launch follow-up* is a legitimate ordering statement (you can't delete what's still referenced) but not a statement about necessity. Read the user goal aloud; ask: *"is the carved-out cleanup load-bearing for any verb in this sentence?"* If yes, it's in scope.

**Cleanup that lives between the user and the user goal is in-scope.** Cleanup that's truly orthogonal (dead folder, no surface depends on it) is the legitimate carve-out shape.

## Anti-patterns rejected

- **Mechanism-first goal.** "Add `useFooBar` composable" instead of "every list refreshes after a save."
- **Implicit scope.** "These six panels" without enumerating the other four and explaining why excluded.
- **Hygiene-as-verification.** Marking a UI feature done because vitest is green and lint is clean.
- **Out-of-band scope creep.** Discovering during execution that "actually we should also do X" — the plan's scope was wrong from the start. Pause, edit the plan, get a nod.
- **Productive-feeling drift.** Writing detailed task lists before the user goal is in writing.
- **Manual smoke as a process fix.** "We should smoke X before archive" is never the right answer. The fix is either (a) a test that exercises X (subprocess-run an npm script and assert exit 0; mount the surface and assert behavior), or (b) the executor runs the command themselves before claiming done, with the exit code + tail of output reported.

## "Smoke" is an antipattern as noun, verb, and identifier

The word "smoke" does not appear in process documentation or in code identifiers.

- **As a noun ("the smoke test"):** if it's automated, it's a test — call it after what it tests (`boot`, `crud`, `bundle`). If it's manual, the problem is that it's manual.
- **As a verb ("smoke-check before archive"):** never the right answer. Either a test exercises the broken path, or the executor runs the command themselves with evidence.
- **As a project / fixture / job name:** the word signals "aspirational / informal" and de-prioritizes actually running it. Rename to what the thing actually tests.

Audit: every existing `smoke` identifier in the repo (`tests/`, `playwright.config.ts`, comments) gets either renamed or removed.

## Verification discipline at close-out

Before any plan is archived (per close-out checklist in `CLAUDE.md`), the executor produces **evidence** — not assertion — that Verification §1 criteria are met. Evidence is:

- **Test output:** "3996 tests passed in 41 s; the new `<name>.test.ts` covers the surface." Paste the relevant `npm test` summary line.
- **Run output:** "`npm run build` exited 0 in 2 min 17 s." Paste the tail.
- **MCP / UI call result:** "`ui_aria_audit()` returned N findings, including the three the plan's user goal names." Paste the JSON or snippet.

NOT evidence:

- "Tests should pass after this change."
- "The build should work — only docs changed."
- "I'd like to smoke this before archive."
- "If anything is broken, the user will tell us."

The executor invokes `superpowers:verification-before-completion` explicitly when this discipline matters.

## CI catches PRs, the executor catches direct-to-main pushes

- **For PRs:** CI is the contract between author and reviewer. Push, watch CI, iterate. Evidence-before-push isn't required; CI runs *because of* the push.
- **For direct pushes to `origin/main`:** CI runs *after* the broken commit is already in the protected branch. The executor has run every check CI will run, with exit codes and test counts captured.

> **Direct commits to `origin/main` (not via PR) require local-green before push.** PR-based work is exempt; CI is the appropriate check there.

Both PR and direct-to-`main` are legitimate paths. Pick the path; honour the verification.

## e2e is load-bearing verification; required at every close-out

`npx playwright test` is part of the evidence at every plan close-out, paired with `npm test` and `npm run build`. Same enforcement shape as direct-to-main:

- **For PRs:** CI runs the e2e suite as part of the build job's downstream.
- **For direct pushes to `main`:** executor runs `npx playwright test` locally before push, captures exit code + per-project pass counts in the close-out commit.

**A broken e2e suite blocks archive.** If `[boot]`, `[crud]`, `[duplicates]`, or `[website-export]` is failing, the plan trying to archive either fixes it or files a separate plan that explicitly covers fixing it before close-out. "Already broken before my work" is not a pass.

Close-out commit message evidence template:
- `npm test` → `N passed (Xs)` (summary line).
- `npm run build` → `built in Xs` (tail + exit code).
- `npx playwright test` → `4 passed (Xs)` across `[boot]`, `[crud]`, `[website-export]`, `[duplicates]`.

## Worked example

> **User goal:** Every right-side panel in the app — Person, Place, Source, Relationship, Group, Research Task, Media, Report, Website, Export Options — looks identical, behaves identically, and updates instantly when data changes anywhere in the app.
>
> **Scope:** Every `*Panel.vue` in `src/renderer/components/`. Full list (10): PersonPanel, PlacePanel, SourcePanel, RelationshipPanel, GroupPanel, ResearchTaskPanel, MediaPanel, ReportPanel, WebsitePanel, ExportOptionsPanel.
>
> **Scope deviations:** none. If any panel is structurally incompatible with the new shell, document why with a code comment AND propose an extension rather than excluding.
>
> **Verification:**
> 1. Open every paneled route in the running app. Visually confirm identical width/height/border-radius/shadow.
> 2. A `panel-layout-consistency` test in `tests/components/` mounts each panel and asserts root class membership matches a reference panel.
> 3. After editing a name in any panel, the corresponding entity in the list / chart / map updates without view-switch.

Tasks come after.

## Commit plans and specs immediately

When you finish writing any file under `docs/plans/` (implementation plan or `-design.md` spec), commit it **in the same step** as writing it — before doing anything else.

```
git add docs/plans/<file>.md && git commit -m "docs(plan): …"   # or docs(spec):
```

**Why this is a rule:** a plan written on `main` while a worktree is then created from `main` is orphaned on `main` as an untracked file — the worktree branches from `main`'s HEAD, which doesn't include the uncommitted plan. The `superpowers:brainstorming` skill commits specs; `superpowers:writing-plans` has been patched; the habit must hold.

**How to apply:**
- After every `docs/plans/YYYY-MM-DD-*.md` write → `git add` + `git commit -m "docs(plan): …"` before any other tool call.
- Before creating a worktree, check `git status` on the source branch — anything doc-related must be committed first.

## Task completability — every task tagged with its tier

Every task in a plan's `## Tasks` section is tagged with the mandate tier that owns it, per `.claude/rules/mandate.md`. The tag answers "who executes this task?" upfront, so an autonomous executor doesn't silently skip Tier 4 work or fumble a Tier 3 escalation.

```markdown
- [ ] **T05 (Tier 1)** — Run `npm test` and capture the summary line.
- [ ] **T07 (Tier 4)** — Author face-tag regions via UI drag. *(Human-required: coord drift on MCP-driven coords. Fallback: skip the group portrait from the demo, accept the degraded screenshot.)*
- [ ] **T11 (Tier 3)** — Push to `origin/main`. *(Escalate before pushing if any other plan landed since the worktree was created.)*
```

Convention:
- **(Tier 1)** — Agent owns; just executes.
- **(Tier 2)** — Agent surfaces with reasoning before executing.
- **(Tier 3)** — Agent escalates; waits for explicit user go-ahead.
- **(Tier 4)** — Human-required (genuine, not punt). The task body MUST declare the alternative path or the degraded outcome.

Missing tags is a plan-format violation. Tier 4 tasks without an alternative-or-degraded-outcome clause are a plan-format violation — see §"Tier 4 tasks must carve their fallback".

## Tier 4 tasks must carve their fallback

A task tagged **(Tier 4)** is genuinely human-required: external GUI, paid-license software, hardware-bound work, first-time-user perspective, irreversible communication. Such tasks block the plan unless the human executes them. The plan acknowledges this by stating ONE of:

- **Alternative agent-completable path** — "T07 alternative: synthesize face-tag regions via image-tagger coords + visual diff against natural-resolution screenshot. Less robust than human drag but verifiable."
- **Degraded user-observable outcome** — "T14 fallback: skip the timed walkthrough; replace Verification §1's '< 10 min' assertion with 'README quickstart steps complete' (mechanical). The shipped README loses the timing claim."
- **Escalation gate** — "T07 requires user to drag the regions in a single session. Plan halts on this task; agent invokes /inventory + surfaces to user when reached."

A Tier 4 task without one of these three clauses is incompletable AND under-specified. The plan as a whole is `Blocked` (per `docs/PLAN.md`) until the Tier 4 task is rewritten.

## No self-referential tasks

A plan in `docs/plans/` exists because it was written. The act of writing + committing is its existence, not a task within it. Tasks like:

- ❌ "T01 — Write this plan, commit it"
- ❌ "T00 — Create the plan file"
- ❌ "T-final — Mark every task complete"

… are noise. They produce false `[ ]` checkboxes that confuse the lifecycle check, and they describe the meta-state of the plan rather than the work the plan delivers.

The first real task is the first task that produces a file change OR a verifiable observation. Setup (worktree creation, gitignore updates) can be a task if it touches files; commit-this-plan is not a task.

## Atomic task discipline

Each task in `## Tasks` must satisfy:

1. **Single user-observable verb** — "Author the .gramps fixture", "Write the citation-modal label tests", "Run the e2e suite and capture output." Tasks that bundle 5+ files or 19+ sections fail this and must be decomposed.
2. **Verifiable mid-flight** — the task either commits something (`git commit`) or produces a verifiable file/output that the next task references. A task with no output (e.g. "T12: write the MANUAL.md") is undecidable.
3. **Bounded effort** — rough ceiling: ~2 hours of focused work, or one logical commit. Larger work decomposes into multiple tasks. The Self-review checklist explicitly checks this.

Tasks that violate this are flagged by the `retro` skill when it re-reads the plan post-archive.

## Close-out tasks reference the /close-out skill

The final task of every plan is **not** a re-statement of the CLAUDE.md "Finishing a plan" 6 steps. It is a single line:

```markdown
- [ ] **T-final (Tier 1)** — Invoke `/close-out` skill. The skill walks the 6+1 steps, refuses partial, captures evidence.
```

Inlining the 6 steps in every plan is duplication; the `/close-out` skill is the canonical implementation, and the executor invokes it once tests pass.

## Lifecycle hygiene

A file in `docs/plans/` is in one of three states.

- **Design spec:** no checkboxes at all. Describes intent; delivers nothing on its own.
  Lives in `docs/plans/` until **every** part of it has shipped, then archives alongside
  the last implementation plan that delivered a part of it. A spec whose Parts 1-3 shipped
  and whose Parts 4-5 have not is **not** ready to archive — archiving it makes "archived"
  read as "finished", which is the exact misreading the archive entry has to spend a
  paragraph undoing.
- **Active plan:** at least one `[ ]` checkbox exists. In flight.
- **Done plan:** every checkbox is `[x]`. MUST be in `docs/plans/archive/`, not `docs/plans/`.

If the last `[ ]` flips to `[x]` and the file still lives in `docs/plans/`, that is a **lifecycle violation**. The fix is not a TODO, not a comment, not "we'll archive it next time" — the fix is to invoke the `close-out` skill, which walks CLAUDE.md "Finishing a plan" in order and refuses partial work.

**Mechanical check** (run before any commit that touches a plan file, and inside the `inventory` skill):

```bash
for f in docs/plans/*.md; do
  [ -f "$f" ] || continue
  # A file with no checkboxes at all is a design spec, not a finished plan.
  grep -q '^- \[' "$f" || continue
  grep -q '\[ \]' "$f" || echo "DRIFT: $f has no [ ] but is not archived"
done
```

Any output is a drift violation.

**Why the `grep -q '^- \['` guard exists.** Without it the check flags every design spec,
because a spec has no `[ ]` and therefore "has no unchecked boxes". On 2026-08-23 it
reported 6 of 6 files in `docs/plans/` as drift, every one a false positive. A check that
fires on everything is a check nobody reads — and it hid the one real finding underneath,
that two of those specs were half-delivered with no plan filed for the remaining parts.

**A design spec needs its own tracking, because the mechanical check cannot help.** When
an implementation plan archives and its spec has parts left, the close-out records which
parts remain and which plan owns them — in the archive entry and, if no plan owns them
yet, by filing one. The `close-out` skill is the canonical fix; manually moving the file without walking the 6 steps is also a violation (skips version bump, CHANGELOG, PLAN.md sync, archive PLAN.md append, and Step 7 post-close hygiene).

**Why this is a rule, not a guideline:** through 2026-04 and -05 the project accumulated four checked-but-unarchived plans from 2026-05-14. The drift was structural: no rule said "this state is illegal," and no skill enforced the close-out as a single command. This rule + the `close-out` skill close the loop.

**Authority:** archiving a done plan is `.claude/rules/mandate.md` Tier 1 (own outright). The agent does not ask "should I archive this?"; it invokes `close-out` and reports in the commit.

## Plan ↔ product-principles alignment

Before writing any plan, the agent verifies the proposed user goal is defensible against the product principles in `CLAUDE.md` (the scope gate + explicit rejections). If the plan's user goal is at-odds with them:

- The agent does NOT write the plan.
- The agent writes a reasoned reply: "Closed without plan — at-odds with the product principles: <reason>."
- If the user disagrees, the discussion is about the product principles, not about the plan. Either the principles change (rare, Tier 3 escalation) or the proposed plan stays closed.

This rule is the upstream gate that keeps `docs/plans/` from accumulating mechanism-shaped or value-misaligned ideas. The downstream gate (lifecycle hygiene above) keeps `docs/plans/` clean *given* that what's in there is legitimate.

## Meta verification

The verification of these rules is the next plan written. If the next plan opens with mechanism instead of user goal, or scopes implicitly, or verifies via lint+vitest only, the rule didn't fire — iterate the rule.

Every two weeks: re-read the most recent three plans against this file AND against the product principles in `CLAUDE.md`. If any drifted, rewrite or strengthen — the `retro` skill is the canonical implementation. The retro covers both plan-format drift (this file) and product-intent drift (the principles), since both can produce bad plans.
