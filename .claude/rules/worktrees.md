# Worktree Command Rules

Loads when the controller is operating against a worktree under `.worktrees/<feature>/` — the canonical and only worktree location in this repo. These rules exist because the user has called repeated permission-prompt loops and silent test-corruption "workflow blockers." The patterns below are non-negotiable; deviations require the user's explicit OK in the moment.

## 1. Directory flags are mandatory; `cd <path> && <tool>` is FORBIDDEN

When the controller's cwd is the main repo root but the work is in a worktree, use the tool's **own directory flag** for every command. The `cd /path && <tool> ...` compound pattern is **forbidden** — the user has explicitly called it out as a workflow blocker ("CWD leak hack").

**Why:** the user's permission allowlist covers single-command invocations of each tool (`Bash(git:*)`, `Bash(npm:*)`, etc.). Compound `cd ... && <tool> ...` commands require a separate compound allowlist pattern that's fragile and triggers permission prompts on every variation (different flags, different subcommands). The user has flagged this as a workflow blocker after repeated approval prompts interrupted concentration.

**How to apply:**

- **git** → `git -C /abs/path <cmd>`
- **npm in a worktree** → `npm <script> --prefix /abs/path` (works for `install`, `test`, `run lint`, `run build`, etc.)
- **cargo** → `cargo --manifest-path /abs/path/Cargo.toml <cmd>`
- **pytest** → `pytest --rootdir /abs/path` (or `-c /abs/path/pyproject.toml`)
- **python** → `python -m … --chdir /abs/path` where supported
- **No directory flag available?** Real gap — fall back to a single command via a one-shot subshell only if absolutely necessary, and ask the user to whitelist the specific compound. Do not silently `cd`.
- **Multi-step sequences** — run each as a separate prefixed call. Never chain with `&&`. Any `cd`-compound targeting a worktree is forbidden.
- **Subagents dispatched into a worktree** are already cwd-correct (the agent runner sets cwd). They use normal `git add / npm test` without prefix flags. **This rule applies only to the controller.**

**Examples:**

```bash
# REQUIRED — controller-side, worktree at /Users/.../.worktrees/feature-x
git -C /Users/.../.worktrees/feature-x log --oneline -5
git -C /Users/.../.worktrees/feature-x add -A
git -C /Users/.../.worktrees/feature-x commit -m "..."
npm install --prefix /Users/.../.worktrees/feature-x
npm test --prefix /Users/.../.worktrees/feature-x
npm run lint --prefix /Users/.../.worktrees/feature-x

# FORBIDDEN — every one of these triggers a permission prompt
cd /Users/.../.worktrees/feature-x && git log --oneline -5
cd /Users/.../.worktrees/feature-x && npm install
cd /Users/.../.worktrees/feature-x && npm install && npm test
```

Cross-referenced in `.claude/skills/commit/SKILL.md` (Working in a worktree — STRICT) and `.claude/napkin.md` (Shell & Command Reliability).

## 2. Vitest in a worktree needs explicit `--root`

`npm --prefix <wt> exec -- vitest run …` runs vitest with the **controller's** CWD, not the worktree's. `npm --prefix` only changes npm's package context — vitest itself inherits the controller process's CWD. With CWD = the main repo, vitest reads `vitest.config.mts` from main and **resolves test files from main**, silently ignoring the worktree's edits.

The result: the test runner reports "all green" against the *old* test file. New tests added in the worktree are invisible. Spec reviewers see false-positive coverage.

**The fix:** always pass `--root <abs-worktree-path>` to vitest:

```bash
npm --prefix /path/to/.worktrees/feat-x exec -- vitest run --root /path/to/.worktrees/feat-x tests/unit/foo.test.ts
```

**Why this is a rule:** caught when a Swedish-exonyms `describe` block silently failed to register — turned out vitest was running main's outdated copy of the file the whole time. Without `--root`, every "tests pass" report from a worktree is suspect.

**How to apply:** in every implementer / reviewer / verification subagent prompt that runs vitest in a worktree, prescribe `--root <worktree-abs-path>`. Treat any vitest invocation in a worktree without `--root` as a bug. Same shape applies to other test runners that resolve files relative to CWD (jest with default rootDir, mocha, etc.).

## 3. Verify pwd + branch after every subagent that did git work

Dispatched subagents that run many Bash commands can cwd-drift back to the main working tree during long sessions. File edits via `Edit`/`Write` use absolute paths and are fine; **`git mv`, `git add`, `git commit` run in whichever directory the shell happens to be in.** Past incident: wall-chart-rollup Task 14's subagent ended in the main tree and made two commits on `main` (skill doc updates + a version-bump release commit) that should have been on the feature branch.

**How to apply:**

1. In every implementer prompt, put `Work from: <absolute worktree path>` at the very top, and reiterate "Do NOT cd elsewhere." Include `git -C <worktree>` usage examples for any git work.
2. **After every subagent finishes**, before moving to the next task, the controller verifies:
   ```
   git -C <worktree> rev-parse --abbrev-ref HEAD   # → expected feature branch, NOT main
   git -C <worktree> log --oneline -1              # → last commit makes sense for this task
   git -C <main>    log --oneline -3               # → no stray commits landed on main
   ```
   If anything is off, stop and resync before dispatching the next subagent.
3. Prefer `Edit` / `Write` with absolute paths over Bash shell redirects for file operations — they bypass the cwd issue entirely.
4. For git history operations (add / commit / mv) inside a subagent, consider instructing the subagent to **output the list of commands** for the controller to run itself, rather than running them from the subagent shell.

The `subagent-handoff` skill (B5 / B6) encodes the prompt-side enforcement — "rebase + branch verification before EVERY commit" — which is the proactive half of this rule. The controller-side verification above is the catch.
