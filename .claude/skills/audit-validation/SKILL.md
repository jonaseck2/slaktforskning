---
name: audit-validation
description: When an audit, third-party finding, AI-generated codebase claim, or any "X is wrong / Y is missing / Z is 1000 LOC" statement is the input to a plan, validate the claim by grepping the actual code BEFORE writing the plan. Triggers on phrases like "the audit says", "the analysis found", "X is N LOC", "Y doesn't exist yet", "Z is duplicated across", or any claim about file/symbol existence, file size, or pattern presence that would change the shape of the plan.
---

# Audit Validation — Grep Before Plan

Before writing a plan against a claim about the code, verify the claim against the code itself.

## The rule

Before brainstorming or writing a plan that names a specific file, LOC count, or pattern claim, **verify each claim independently** with grep / wc / read. Audits, third-party findings, and LLM-generated codebase analysis drift between when they're written and when their plan executes.

## What to verify (in order)

For every claim like "File X is N LOC of pattern P":

1. **File existence.** `ls <path>` or `test -f <path> && echo exists`. The file may have been renamed, split, or deleted since the audit.
2. **LOC count.** `wc -l <path>`. The audit's number may be stale (file grew or shrank); the order of magnitude matters more than the exact number.
3. **Pattern presence.** `grep -c '<pattern>' <path>`. The "50+ golden snapshots" claim needs a grep that confirms ≥50 matches, not a paraphrase.
4. **Pattern shape.** Read 10-20 lines around a representative match. The audit's interpretation of the pattern may differ from what's actually there.

For every claim like "Module/composable/component X doesn't exist yet, we should create it":

1. **Search for the name.** `find . -name '<name>*' -o -path '*/<name>/*'`. The thing may already exist under a different path or a slight rename.
2. **Search for the pattern it would provide.** `grep -rln '<canonical-call-site-pattern>' src/`. The functionality may exist without that exact name.

For every claim like "X is duplicated across N files":

1. **Grep for the duplication marker** (a unique string from the claimed-duplicated block). Confirm ≥N matches across the named files.
2. **Read a sample** to confirm the matches are actually duplications, not coincidental.

## When this skill triggers

ANY of these in the input:
- "the audit says", "the audit found", "per the analysis"
- "X is N LOC", "the file is 1000 lines", "this contains M patterns"
- "Y doesn't exist yet", "we need to create Z"
- "this is duplicated across A, B, C"
- "the original premise was wrong" — IF you're writing a *new* claim, validate the *new* one too
- Receiving a plan or design doc from someone else (human or AI) that opens with a measurement claim

## How to apply

1. Read the audit / claim until you can list specific assertions.
2. For each assertion that would change the plan's shape, write a one-line bash verification:
   - `wc -l <file>` for size claims
   - `grep -c '<pattern>' <file-or-dir>` for pattern claims
   - `ls <path>` for existence claims
   - `grep -rln '<symbol>' src/` for symbol-existence claims
3. Run all verifications BEFORE writing the plan.
4. For each verified claim: record the actual measurement next to the audit's claim in the plan's Scope section. Discrepancies get a one-line explanation.
5. If a verification reveals the audit's premise is wrong: **don't paper over it**. Either reframe the plan around the actual code state, or close as "audit premise didn't hold" with a one-paragraph note.

## What this skill does NOT cover

- Writing plans (use `superpowers:writing-plans`).
- Brainstorming intent (use `superpowers:brainstorming`).

This is a one-step intake check, not a brainstorming framework. After validation, normal plan workflows apply.
