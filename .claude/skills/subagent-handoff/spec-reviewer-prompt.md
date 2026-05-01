# Spec Reviewer Subagent Prompt Template (project-local)

Forks the upstream `superpowers:subagent-driven-development/spec-reviewer-prompt.md` minimally. The spec-reviewer's job changes: it now answers "does the work satisfy the user goal?" first, "does it match the spec?" second.

```
Task tool (general-purpose):
  description: "Review spec + user-goal compliance for Task N"
  prompt: |
    You are reviewing whether an implementation satisfies BOTH the user
    goal AND the specification, in that order. The user goal takes
    precedence: spec compliance without user-goal alignment = ❌.

    ## User goal (read this first)

    [VERBATIM from the plan's "User goal" section. The user-observable
    outcome the work must move toward.]

    ## What was requested

    [FULL TEXT of task requirements — paste from plan]

    ## What implementer claims they built

    [From implementer's report — including their answers to the three
    required questions: what implemented, how user goal was verified,
    what assumed / deviated.]

    ## CRITICAL: Do not trust the report

    The implementer finished suspiciously quickly. Their report may be
    incomplete, inaccurate, or optimistic. Verify everything independently
    against BOTH the user goal and the spec.

    **DO NOT:**
    - Take their word for what they implemented
    - Accept "all tests pass" as evidence the user goal is met
    - ✅ work that matches spec literally but misses goal

    **DO:**
    - Read the actual code they wrote
    - Open the running app and verify the user goal where it's
      user-observable (UI, MCP tool output, file output, gazetteer
      resolution). If the environment doesn't permit, report this as a
      gap — DO NOT silently skip the check.
    - Compare actual behavior to the user goal LINE BY LINE before
      checking spec compliance.

    ## Your job (in this order)

    ### 1. User goal alignment (precedence)

    Re-read the user goal. Does the work satisfy it?

    - **If YES with evidence:** name the user-observable check you
      performed. Quote computed styles, MCP tool outputs, DOM
      attributes, gazetteer resolutions — whatever proves the goal is
      met.
    - **If NO:** ❌ regardless of spec match. Name the specific aspect
      of the user goal that's not satisfied. Be ruthless here — this is
      the whole reason this section exists.
    - **If you can't verify the user goal in this environment** (no
      GUI, no MCP, etc.): say so explicitly and ❌-pending. Don't
      pretend the spec verification covers the goal.

    ### 2. Spec compliance (after user-goal check)

    Verify by reading code:

    - **Missing requirements:** anything in the spec they skipped?
    - **Extra/unneeded work:** anything they built that's not in the
      spec? (Especially flag anything that violates `.claude/rules/plans.md`
      Rule A2 — silent partial migration.)
    - **Misunderstandings:** spec interpreted differently than intended?

    Verify by reading code, not by trusting the report.

    ### 3. Acceptable scoping check

    The implementer may flag work as "out of scope" in their report. By
    default this is suspicious — `.claude/rules/plans.md` Rule A2 says
    pattern migrations are all-or-nothing. If the implementer scoped
    something out, the plan must have said so explicitly at the top.
    Cross-check.

    ## Report format

    1. **User goal alignment:** ✅ / ❌ / ❌-pending (with the user-observable
       check performed AND its result, OR the reason verification was
       blocked).
    2. **Spec compliance:** ✅ / ❌ (with file:line evidence for any gap).
    3. **Scope deviations the implementer flagged:** legit per the plan,
       or sneaking past Rule A2?
    4. **Recommendation:** approve / re-dispatch / escalate to user.

    Keep it under 400 words. Lead with the user-goal verdict.
```
