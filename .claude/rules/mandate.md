# Agent Mandate

Loads always. Declares what the agent owns, proposes-then-executes, escalates, or genuinely defers to the human. Companion to `docs/INTENT.md` (product) and `docs/WORKFLOW.md` (process). Resolves "should I do this or ask?" friction across the lifecycle.

The mandate is asymmetric on purpose: **mechanical hygiene is the agent's. Strategic novelty is the human's.** When in doubt, choose the tier that does the work — over-asking has been the dominant failure mode.

---

## Tier 1 — Own outright (just do it, report in commit)

The agent decides and executes without asking. Reports the work in the commit message and any close-out evidence.

- **Lifecycle hygiene** — close-out checklist execution (CLAUDE.md "Finishing a plan"), archival, version bumps, CHANGELOG entries, `docs/PLAN.md` ↔ `docs/plans/` consistency, archive PLAN.md appends.
- **Plan-format enforcement** — every new plan opens with User goal + Scope + Verification per `.claude/rules/plans.md`. The agent rejects its own plan and rewrites if drift.
- **Stale-anything sweep** — plans whose tasks are all `[x]` (auto-archive), memories that turn out wrong (auto-update), `// TODO`s past a known reopen trigger (auto-resolve or flag).
- **Drift detection** — `package.json` version ↔ CHANGELOG, archived plan ↔ archive PLAN.md, INTENT.md ↔ active plans, skill/doc references ↔ shipped code. Surfaces in commit message; fixes where mechanical.
- **Plan format vs INTENT** — if a plan's User goal is at-odds with `docs/INTENT.md`, the agent refuses to write the plan. Surfaces the conflict reasoning back to the user.
- **Worktree management** — spinning up worktrees for plan-driven work, dispatching subagents, running tests, committing, pushing PR. No "should I?" — the plan is the authorization.
- **Test + build verification** — running `npm test`, `npm run build`, `npm run test:e2e[:full]` before any close-out claim of done. Output captured in commit message.
- **UI verification via dev MCP** — taking screenshots, driving the running app, reproducing reports, capturing evidence. The agent has dev-MCP UI tools; using them is not optional escalation, it's standard practice.
- **Dependency triage** — dependabot PRs against the documented baselines. Auto-merge after CI if patch/minor and the changelog is uncontroversial; surface major bumps for the user.
- **Memory hygiene** — promote project-shape memories to CLAUDE.md or `.claude/rules/`; demote user-shape rules out of CLAUDE.md to memory; delete superseded entries. Per CLAUDE.md "Project conventions live in the workspace."
- **Skill / rule edits when they fired wrong** — if a rule didn't catch a violation it should have, edit the rule, commit alongside the fix that closes the violation.
- **Idea triage** — given a UX report / GitHub issue / user request, evaluate against INTENT.md and produce a triage outcome (ship in batch / write design spec / kill with reasoned reply). The agent does not need permission to *triage*; only to *execute the resulting plan* if it's plan-shaped.

## Tier 2 — Propose, then execute unless told no

The agent surfaces the call with its reasoning, then proceeds within the next response unless the user objects. Time-boxed: a Tier 2 proposal lingers no longer than the next interaction.

- **Killing ideas as at-odds with INTENT** — agent writes the "closed without plan — at-odds with INTENT.md §X" reply and reasoning, executes the close, surfaces to user. User can override.
- **Archiving stale plans** — found by drift sweep. Agent archives + writes archive entry + bumps version. Surfaces in commit. User can reopen if archival was wrong.
- **Workflow rule changes** — when a retro identifies a rule that didn't fire when it should have. Agent proposes the rule edit, commits it. User can revert.
- **Deferring beta feedback that's wording-only and contested** — if a report is purely wording and the agent's UX evaluation says no, agent writes a polite "closed — see INTENT" reply and surfaces.
- **Opening / closing GitHub issues** — labelling, deduping, stale-closing per the `oss-triage` / `oss-stale` skills. Agent executes; user can override individual decisions.
- **Releasing a patch / minor version** — agent runs the release flow when a plan archives. Major versions are Tier 3.
- **Plan rewriting** — if a plan as-written opens with mechanism or scopes implicitly, the agent rewrites with User-goal-first framing, commits, surfaces the diff. User can revert if the rewrite missed intent.
- **Adding a missing test for a closed report** — e.g. Report 106's "events.update with relationship_id" coverage gap. Agent writes the test, commits, surfaces.

## Tier 3 — Escalate (always ask, even if the answer is obvious)

- **Destructive ops** — `git reset --hard`, `git push --force` to any shared branch, `git branch -D` of branches with unmerged commits, schema migrations that drop data without a path back.
- **Public releases of new major versions** — anything 1.0+, anything tagged as "stable" externally, anything that triggers an outbound communication.
- **Touching org / legal scope** — license file changes, CONTRIBUTING.md, CODE_OF_CONDUCT.md, GitHub repo settings, anything trademark-shaped.
- **Communication outbound to humans other than the user** — replying to a GitHub issue with a substantive technical claim, emailing a beta tester, posting to a public channel. The `oss-welcome` skill greeting flow is the exception (templated, low-stakes).
- **Strategic priority calls between well-formed alternatives** — "should we do OSS launch next or finish Ben polish first?" when both are defensible. User picks.
- **Any change to `docs/INTENT.md`** — even agent-proposed wording tweaks. INTENT changes are sovereign.

## Tier 4 — Genuinely human (wait for input)

The agent never originates these; the agent's job is to be ready when the input arrives.

- **Original product intent.** What the app is for, who it serves, what it rejects. Codified in INTENT.md; changes to it are sovereign.
- **Strategic priority between well-formed alternatives.** See Tier 3, this is the input shape.
- **Beta-tester relationships.** Until Ben (or any tester) files directly into a tracker the agent watches, their input arrives via the user.
- **Final go/no-go on irreversible** — public releases, paid-provider switches, breaking schema changes, deleting historical archives.
- **Hardware-bound work** — anything requiring a paid Windows install, a physical device, a real OS the agent doesn't have. Today: Holger / RootsMagic fixture authoring, OS-specific bundle verification.

---

## Resolving "is this Tier 1 or Tier 2?"

A check fires Tier 2 (propose) instead of Tier 1 (own) when **any of:**

- The mechanical fix is wrong if the agent's interpretation of intent is wrong (e.g. archiving a plan whose user goal might not actually be met yet).
- The output is user-facing communication (replies, issue comments, commit messages aimed at outside readers).
- The change touches an artifact owned by another role (CLAUDE.md, INTENT.md, `.claude/rules/*` written by the user — only edit if a retro proposed it).

Default to Tier 1 when:

- The action is reversible by a single commit revert.
- The reasoning is mechanical (greppable check, filesystem state, test exit code).
- The alternative is "leave it stale and ask next session," which has been the dominant failure mode.

---

## Failure modes this mandate is designed to eliminate

- **"Should I spin up the worktree?"** — Tier 1 says no, just do it.
- **"Want me to archive these stale plans?"** — Tier 2: surface the list of stales found by the sweep, archive in the same response.
- **"If 102 §5 reproduces…"** — Tier 1: reproduce now via dev MCP. The agent has the tools.
- **"I'll leave the stash for you to clean up"** — Tier 1: clean it up, surface what was cleaned in the commit.
- **"This memory might be stale, you can audit later"** — Tier 1: audit now.
- **"Want me to write the test that would have caught this?"** — Tier 2: write it, commit it, surface the diff.

Every "want me to" in agent output is a candidate for promotion to Tier 1 or Tier 2. Audit the agent's own messages each retro for the question form.

---

## Failure modes this mandate does NOT eliminate

- **Bad triage decisions** — the agent might mis-evaluate a UX report against INTENT. The fix is the retro, not a stricter mandate.
- **Misreading INTENT** — if INTENT.md is ambiguous, the agent guesses. The fix is sharpening INTENT, not narrowing the mandate.
- **Out-of-system input** — Ben emailing the user. No mandate change makes that automatic.

When the mandate produces a bad call, the retro identifies whether to (a) sharpen the mandate, (b) sharpen INTENT, or (c) accept the trade-off because the alternative is worse (more friction, more drift).
