# Implementer Subagent Prompt Template (project-local)

Forks the upstream `superpowers:subagent-driven-development/implementer-prompt.md` minimally. Use this template instead of the upstream one for any implementer dispatch in this repo.

The upstream template body is preserved. Add the two project-local sections below: **User goal** at the top (before "Task Description") and **Three required answers** at the bottom (replaces the upstream "Report Format" section).

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  prompt: |
    You are implementing Task N: [task name]

    ## User goal (read this first)

    [VERBATIM from the plan's "User goal" section — see .claude/rules/plans.md.
    Copy without rewording. The user-observable outcome the plan exists to
    deliver, in plain language.]

    Before you do anything else: re-read the User goal above and the Task
    Description below. If the task description as specified DOESN'T serve
    the user goal — or if you'd need to do less than what the goal implies
    in this task — STOP and report back with status `NEEDS_CONTEXT` or
    `BLOCKED`, naming the gap. Don't implement around it.

    ## Task Description

    [FULL TEXT of task from plan — paste it here, don't make subagent read file]

    ## Context

    [Scene-setting: where this fits, dependencies, architectural context.

    **When this dispatch follows previous waves on the same plan:** name the
    main-branch SHA, not "in main." Write:

      "Main is at commit `<sha>`; rebase your worktree onto it. The previous
      commits on main provide [list of files / behaviors]."

    NOT "Tasks 1-N done in main" — that phrasing has caused subagents to
    interpret "in main" as "you work directly on main" and push commits to
    the wrong branch. See `subagent-handoff` rules B5/B6.]

    ## Worktree discipline (project-local — read before any git operation)

    1. **Rebase first.** Before touching any file, run:
       `git -C <worktree-path> fetch && git -C <worktree-path> rebase main`
       so your base matches current `main`. Otherwise commits from earlier
       waves may not be visible in your worktree, and you may redo work.
       If the rebase has conflicts, STOP and report `BLOCKED` — don't
       force-resolve.

    2. **Verify branch before EVERY commit.** Run:
       `git -C <worktree-path> rev-parse --abbrev-ref HEAD`
       and confirm it reports `worktree-agent-*`, NOT `main`. If it reports
       `main`, you've drifted out of the worktree (most commonly from a
       `cd` inside a Bash tool call). Stop, abort the commit, fix your CWD.

    3. **Use `git -C <worktree-path>` for every git command**, OR
       always pass absolute paths and verify cwd before each command. Never
       `cd /path/to/.worktrees/... && git ...` — that masks drift.

    ## Before You Begin

    [...upstream content unchanged...]

    ## Your Job

    [...upstream content unchanged...]

    ## Code Organization

    [...upstream content unchanged...]

    ## When You're in Over Your Head

    [...upstream content unchanged...]

    ## Before Reporting Back: Self-Review

    [...upstream content unchanged, but ADD this final check:]

    **User-goal check (mandatory).** Re-read the "User goal" at the top of
    this prompt. Did the work you just did move the user closer to that
    goal? Tests passing and lint clean don't answer this question — the
    user goal is user-observable. If you couldn't verify against the user
    goal in this environment, say so explicitly in the report (don't fake
    a green check).

    ## Report Format (project-local — answers three required questions)

    Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT

    Then answer all three of these explicitly. Reports missing any answer
    will be re-dispatched.

    1. **What I implemented / verified.**
       What code I wrote or modified, what tests pass, what files changed
       (paths + line counts). The structural what.

    2. **How I verified the user goal.**
       The user-observable check I actually performed. Examples:
       - "Mounted Component X in test, asserted DOM root has class Y."
       - "Ran the dev server and confirmed via DOM inspect that <selector>
         has computed width Wpx and height Hpx as expected."
       - "Called MCP tool foo with input X; got output Y matching spec."
       Lint, type-check, and unit tests that don't render or invoke the
       feature DO NOT count here. If the environment didn't let me verify
       (e.g. no GUI in dev container), say so explicitly: "Could not
       run the live check; user must verify <specific check> before merge."

    3. **What I assumed / where I deviated** from the spec or user goal.
       Anything not literal in the plan: assumptions, scope decisions,
       deviations. Especially flag: anything I left "out of scope" — name
       the items and the reason. Default assumption: full pattern coverage
       per .claude/rules/plans.md Rule A2.

    Use DONE_WITH_CONCERNS if you completed the work but doubt either
    correctness or user-goal alignment. Use BLOCKED if you can't complete.
    Use NEEDS_CONTEXT if information is missing.
```
