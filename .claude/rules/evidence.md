# Evidence Discipline

Loads always. Governs how the agent states claims about code, repos and data. Companion to the **Prime Directive (cont.)** in `CLAUDE.md` (which enforces the same discipline on the importer) and to the prose register in user memory ("evidence over assertion").

**The rule is one sentence: a claim about a population needs a denominator.**

---

## The rule

Any statement of the form *"X is the convention"*, *"that's the pattern here"*, *"this is how the repo does it"*, *"X already works"*, *"nothing else does Y"* cites a **ratio**, not an example.

- ✅ "85 of 2871 commits carry `Signed-off-by` — 3 %, mostly dependabot."
- ❌ "Sign-off is already the convention in this repo."

If the denominator is expensive to get, say so and weaken the claim to what the evidence supports: *"at least three commits carry it; I have not checked prevalence."* That sentence is cheap, honest and unfalsifiable-by-accident.

## The anti-pattern that produces the error

**A query that cannot return zero cannot support a claim about the whole.**

```bash
git log --all | grep-for-X | head -3      # returns 3 rows
```

This filters to items that *have* X, then shows the first few. It proves **existence**. It says nothing about **prevalence**. Read as prevalence, it is always confirmatory — the command is structurally incapable of disagreeing.

Before writing the claim, ask: *could this command have returned nothing?* If not, it is not evidence for the sentence being written.

Same shape, different clothes:

| Query | Returns | Tempting conclusion | Reality |
|---|---|---|---|
| `ctx.skippedTags` | a non-empty list | "the importer discloses drops" | 143 disclosed of 40 436 |
| accounting gate over 20 fixtures | all green | "coverage is complete" | 0 fixtures reached `normalize.ts` |
| `git log \| grep signoff \| head -3` | 3 rows | "sign-off is the convention" | 85 of 2871 |

All three happened in this project on 2026-08-23. The first is the bug the tag-accounting plan exists to fix. The third is the agent reproducing that bug, in prose, while writing about the first.

## Census, not report

Prefer the **census** (enumerate everything, then classify) over the **report** (read what a mechanism chose to tell you). A report reflects its author's coverage decisions; a census reflects the data. When they disagree, the census is right — that is the entire lesson of the importer work.

`grep -c` over the whole set beats `grep | head`. `sort | uniq -c` beats a sample. A count of both arms beats a count of one.

## Scrutinise your own claims at least as hard as other people's

The 2026-08-23 sequence: the agent probed a suspected hole rather than asserting it, caught its own 55 315 double-count, and verified a fold count it had guessed at — then asserted, unchecked, the one claim that justified reversing its own decision. Outward scrutiny was high, inward scrutiny was absent.

A claim is **load-bearing** when it justifies a decision, a reversal, or a refusal. Load-bearing claims get the denominator, always. The feeling of "I just ran a command, so I have evidence" is exactly when to check *what the command was evidence of*.

## Why this is a rule and not a habit

Being careful is what already failed. The principle was in context the whole time and did not fire, for the same reason clause 1 of the Prime Directive did not fire: **a rule with no mechanical trigger is optional at the moment it matters.**

The trigger here is lexical, and therefore greppable in the agent's own drafts:

> `already` · `the convention` · `the pattern here` · `how this repo does it` · `everything` · `nothing` · `always` · `never` · `all of them` · `none of them`

Any of those words in a sentence about code or data is a prompt to produce the ratio or weaken the sentence. Two words, one number — cheaper than the correction that follows otherwise.
