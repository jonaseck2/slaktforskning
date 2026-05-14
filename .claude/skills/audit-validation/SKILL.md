---
name: audit-validation
description: When an audit, third-party finding, AI-generated codebase claim, or any "X is wrong / Y is missing / Z is 1000 LOC" statement is the input to a plan, validate the claim by grepping the actual code BEFORE writing the plan. Triggers on phrases like "the audit says", "the analysis found", "X is N LOC", "Y doesn't exist yet", "Z is duplicated across", or any claim about file/symbol existence, file size, or pattern presence that would change the shape of the plan.
---

# Audit Validation — Grep Before Plan

Audits drift. Third-party findings drift. Any LLM-generated codebase analysis drifts. **Before you write a plan against a claim about the code, verify the claim against the code itself.**

## Why this exists

The 2026-05-14 audit-followup batch produced 11 plans. **Three of them had factually wrong premises** that grep would have caught in under 5 minutes:

| Plan | Audit claimed | Reality (verified during execution) |
|---|---|---|
| 3.2 chart-layout | "1,663 LOC of golden snapshots; replace with property assertions" | Zero `toMatchSnapshot` calls. The file was already property-style with 165 `toBeCloseTo` / `toBeLessThan` etc. The plan still shipped a useful property-assertion library, but the framing was wrong. |
| 3.5 modal extraction | "EventModal: 1,052 LOC of template branching; extract event-type field components" | 105 LOC `<template>` + 721 LOC `<script setup>`. Bottleneck was composition logic, not template branching. Plan pivoted mid-design to composable extraction. |
| 3.7 panel danger-zone | "Extract `usePanelSections` composable — 4,936 LOC of section-management boilerplate across 10 panels" | `usePanelSections` already existed and was used by 8 of 10 panels. The "4,936 LOC" was the panels themselves (domain markup), not reducible to a section composable. Plan re-investigated, found the real duplication: `panel-danger-zone` blocks in 6 panels (~50 LOC × 6). |

The shared failure mode: each plan was authored from the audit summary without first opening the named file. Each plan would have been authored differently if the audit's claim had been spot-checked at intake.

## The rule

Before brainstorming or writing a plan that names a specific file, LOC count, or pattern claim, **verify each claim independently** with grep / wc / read. Don't trust the source — even a self-authored audit drifts between when it's written and when its plan executes.

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
5. If a verification reveals the audit's premise is wrong: **don't paper over it**. Either reframe the plan around the actual code state, or close the plan as "audit premise didn't hold" with a one-paragraph note for the historical record.

## Verification (per `.claude/rules/plans.md` Rule A3)

If the next plan in this repo opens its Scope section with **measured numbers paired against any audit claims** (not just paraphrased audit claims), the skill works. If a future plan ships with an unverified audit claim that turns out wrong on execution, this skill failed and needs strengthening.

## What this skill does NOT cover

- Writing plans (use `superpowers:writing-plans`).
- Brainstorming intent (use `superpowers:brainstorming`).
- This skill is a one-step intake check, not a brainstorming framework. After validation, normal plan workflows apply.
