# Code Quality Reviewer Subagent Prompt Template (project-local)

Forks the upstream `superpowers:subagent-driven-development/code-quality-reviewer-prompt.md` minimally. Adds two project-local checks: class-name collision audit (per `.claude/rules/renderer.md`) and user-goal degradation check.

Only dispatch this reviewer **after** spec compliance review (per upstream skill) AND user-goal alignment review (per `spec-reviewer-prompt.md`) have both passed. If either failed, fix first.

```
Task tool (pr-review-toolkit:code-reviewer or general-purpose):
  description: "Code quality review for Task N"

  WHAT_WAS_IMPLEMENTED: [from implementer's report — including their three
                         required answers: what implemented, how user goal
                         was verified, what assumed/deviated]
  USER_GOAL: [VERBATIM from the plan's "User goal" section]
  PLAN_OR_REQUIREMENTS: Task N from [plan-file]
  BASE_SHA: [commit before task]
  HEAD_SHA: [current commit]
  DESCRIPTION: [task summary]

  Review the diff for standard code-quality concerns AND these project-
  local checks:

  ## Standard concerns (upstream)

  - One responsibility per file with a well-defined interface
  - Decomposition for independent test/reasoning
  - Adheres to plan's file structure
  - File-size growth attributable to this change

  ## Project-local checks (mandatory)

  ### 1. CSS class-name collision audit

  If the diff introduces ANY new CSS class on any element in
  `src/renderer/`, verify the author grepped `shared.css` and existing
  scoped styles for collisions BEFORE choosing the name. Per
  `.claude/rules/renderer.md` "Class-name collision check."

  Check by running:
  `grep -RIn '\\.<new-class-name>\\b' src/renderer/styles/ src/renderer/components/ src/renderer/views/`

  - If any hit returns from `shared.css` and the class isn't a deliberate
    re-use of that pattern → ❌ Critical. The new class silently inherits
    `shared.css` rules (layout, sizing, etc.). This is the v0.190.0
    EntityPanel-vs-BaseSubPanel collision class of bug.
  - If hits are in unrelated scoped components → fine (Vue scoping
    isolates).

  ### 2. User-goal degradation check

  Re-read the USER_GOAL above. Does this diff move toward the goal, or
  does it add code that's structurally clean but doesn't help the user?
  - "Refactored for clarity" with no user-observable benefit → flag as
    Important. Spending review/maintenance budget on changes invisible
    to the user is anti-consistency.
  - "Added abstraction A for future use" with no current consumer →
    flag as Important. YAGNI.

  ### 3. Pattern-migration completeness (if applicable)

  If this task is part of a refactor that establishes a reusable pattern,
  audit per `.claude/rules/renderer.md` "Pattern migrations are
  all-or-nothing": is every same-shaped instance covered, or is partial
  scope explicit at the top of the plan?

  ## Report format

  Strengths / Issues (Critical/Important/Minor) / Assessment.

  - **Critical** = ship-blockers (collision, user-goal regression, data
    loss).
  - **Important** = should-fix-now (YAGNI, partial pattern coverage,
    missing test for stated user goal).
  - **Minor** = noted for the next round.

  Confidence threshold: only report issues where confidence ≥ 80. Lower-
  confidence observations are kept brief in a separate section so the
  implementer can dismiss them quickly.
```
