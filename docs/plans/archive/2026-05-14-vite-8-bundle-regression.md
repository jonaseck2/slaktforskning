# Vite 8 Bundle Regression Investigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a measured diff (pre-Vite-8 v0.257.3 vs current `main`) + named root cause for any bundle-size regression, with the decision to fix-in-plan / accept-as-structural / escalate documented in `docs/plans/2026-05-14-vite-8-bundle-regression-rca.md`.

**Architecture:** Investigation-style plan. Tasks are measure → diff → tune → write-up, not TDD. A side worktree is used to checkout `v0.257.3` cleanly without disturbing `main`. Tunings are tried in increasing-cost order; first one that produces parity wins.

**Tech Stack:** Vite 8.0.12 / Rolldown / Oxc, `du`, `git worktree`, esbuild bundle analyzer (optional for chunk inspection).

**Design doc:** [2026-05-14-vite-8-bundle-regression-design.md](2026-05-14-vite-8-bundle-regression-design.md)

---

## File Structure

| Path | Purpose |
|------|---------|
| `docs/plans/2026-05-14-vite-8-bundle-regression-rca.md` | The RCA artifact: measurements, diff table, named root cause, tunings tried, decision. Mandatory output. |
| `vite.renderer.config.ts` | Edit only if a tuning is shipped (Tasks 5–7). |
| `src/renderer/empty-gazetteers.ts` | Edit only if Tuning C (`import.meta.glob` reshape) is shipped. |
| `CHANGELOG.md` | `## Unreleased` entry if decision is `accepted-as-structural` or `fixed-in-plan`. |
| `docs/plans/2026-05-14-gazetteer-bundle-architecture-design.md` | Skeleton (User goal + Scope only) if decision is `escalated-to-followup`. |

---

## Task 1: Create the measurement worktree

**Files:**
- (No file edits — worktree creation only.)

- [ ] **Step 1: Create a worktree at the v0.257.3 tag**

```bash
git fetch --tags
git worktree add ../slaktforskning-v0.257.3 v0.257.3
```

Expected: `Preparing worktree (detached HEAD ...)\nHEAD is now at <sha>`.

- [ ] **Step 2: Install dependencies in the worktree**

```bash
cd ../slaktforskning-v0.257.3 && npm install
```

Expected: clean install matching the v0.257.3 lockfile. If `npm install` warns about peer deps, capture the warning text — it's relevant context for the RCA.

- [ ] **Step 3: Commit the worktree creation to a notes file (optional)**

No commit needed for worktree creation itself. Proceed to Task 2.

---

## Task 2: Capture pre-Vite-8 baseline

**Files:**
- Create: `/tmp/vite7-baseline.txt` (transient measurement output — will be copied into the RCA).

- [ ] **Step 1: Build in the worktree**

```bash
cd ../slaktforskning-v0.257.3 && npm run build 2>&1 | tee /tmp/vite7-build.log
```

Expected: build exits 0. Save the tail of the log for the RCA. Note any warnings about chunk sizes.

- [ ] **Step 2: Capture renderer bundle metrics**

```bash
cd ../slaktforskning-v0.257.3 && {
  echo "=== dist-tauri total ==="
  du -sh dist-tauri
  echo
  echo "=== top 10 chunks by size ==="
  du -h dist-tauri/assets/* | sort -h | tail -10
  echo
  echo "=== chunk counts ==="
  echo "js: $(ls dist-tauri/assets/*.js 2>/dev/null | wc -l)"
  echo "json: $(ls dist-tauri/assets/*.json 2>/dev/null | wc -l)"
  echo "css: $(ls dist-tauri/assets/*.css 2>/dev/null | wc -l)"
  echo
  echo "=== gzip-equivalent size of largest chunks ==="
  for f in $(du -h dist-tauri/assets/* | sort -h | tail -5 | awk '{print $2}'); do
    gz=$(gzip -c "$f" | wc -c)
    echo "$(basename $f): raw=$(du -h $f | cut -f1), gzip=$gz bytes"
  done
} > /tmp/vite7-baseline.txt 2>&1
cat /tmp/vite7-baseline.txt
```

Expected: a complete measurement output. Verify the numbers look sane (total ~50-80 MB, dozens of chunks).

- [ ] **Step 3: Capture static bundle metrics**

```bash
cd ../slaktforskning-v0.257.3 && npm run build:static 2>&1 | tail -5
du -sh ../slaktforskning-v0.257.3/dist-static >> /tmp/vite7-baseline.txt
gzip -c ../slaktforskning-v0.257.3/dist-static/index.html | wc -c >> /tmp/vite7-baseline.txt
cat /tmp/vite7-baseline.txt
```

Expected: static bundle ~1.4 MB raw / ~400 KB gzipped per close-out plan.

- [ ] **Step 4: Verify the measurement files exist**

```bash
ls -la /tmp/vite7-baseline.txt /tmp/vite7-build.log
```

Expected: both files non-empty. No commit yet — files are transient input for the RCA.

---

## Task 3: Capture current (Vite 8) baseline

**Files:**
- Create: `/tmp/vite8-baseline.txt` (transient).

- [ ] **Step 1: Return to main worktree and clean build outputs**

```bash
cd /Users/jonasahnstedt/git/slaktforskning
rm -rf dist-tauri dist-static
```

Expected: directories removed (or never existed).

- [ ] **Step 2: Build current `main`**

```bash
npm run build 2>&1 | tee /tmp/vite8-build.log
```

Expected: build exits 0. The Vite 8 close-out plan reported "839 ms, 71 JSON chunks + 108 JS chunks, largest chunk 5.7 MB"; verify those numbers reproduce.

- [ ] **Step 3: Capture the same metrics**

```bash
{
  echo "=== dist-tauri total ==="
  du -sh dist-tauri
  echo
  echo "=== top 10 chunks by size ==="
  du -h dist-tauri/assets/* | sort -h | tail -10
  echo
  echo "=== chunk counts ==="
  echo "js: $(ls dist-tauri/assets/*.js 2>/dev/null | wc -l)"
  echo "json: $(ls dist-tauri/assets/*.json 2>/dev/null | wc -l)"
  echo "css: $(ls dist-tauri/assets/*.css 2>/dev/null | wc -l)"
  echo
  echo "=== gzip-equivalent size of largest chunks ==="
  for f in $(du -h dist-tauri/assets/* | sort -h | tail -5 | awk '{print $2}'); do
    gz=$(gzip -c "$f" | wc -c)
    echo "$(basename $f): raw=$(du -h $f | cut -f1), gzip=$gz bytes"
  done
} > /tmp/vite8-baseline.txt 2>&1

npm run build:static 2>&1 | tail -5
du -sh dist-static >> /tmp/vite8-baseline.txt
gzip -c dist-static/index.html | wc -c >> /tmp/vite8-baseline.txt
cat /tmp/vite8-baseline.txt
```

Expected: complete measurement output.

---

## Task 4: Diff the two baselines

**Files:**
- Create: `docs/plans/2026-05-14-vite-8-bundle-regression-rca.md` (start with measurements + diff; tunings appended in later tasks).

- [ ] **Step 1: Open both baseline files side-by-side and identify regressions**

```bash
diff /tmp/vite7-baseline.txt /tmp/vite8-baseline.txt
```

Expected: a diff showing every metric. Note: not every line is a regression — some chunks may shrink, some grow, total may be flat. Look at: total `dist-tauri` size, top-5 chunks (matched by name where possible), chunk counts (more chunks of similar avg size = fragmentation; same count of larger chunks = inflation).

- [ ] **Step 2: Start the RCA file with the measurement section**

Use the Write tool to create `docs/plans/2026-05-14-vite-8-bundle-regression-rca.md` with this skeleton:

```markdown
# RCA — Vite 8 bundle regression investigation

**Plan reference:** [2026-05-14-vite-8-bundle-regression.md](2026-05-14-vite-8-bundle-regression.md)
**Status:** in-progress (will be `fixed-in-plan` / `accepted-as-structural` / `escalated-to-followup` at close).

## Measurements

### Pre-Vite-8 (v0.257.3)

\`\`\`
[paste contents of /tmp/vite7-baseline.txt]
\`\`\`

Build log tail:
\`\`\`
[paste last 10 lines of /tmp/vite7-build.log]
\`\`\`

### Post-Vite-8 (current main)

\`\`\`
[paste contents of /tmp/vite8-baseline.txt]
\`\`\`

Build log tail:
\`\`\`
[paste last 10 lines of /tmp/vite8-build.log]
\`\`\`

## Diff

| Metric | Pre-Vite-8 | Post-Vite-8 | Delta | Delta % |
|--------|------------|-------------|-------|---------|
| `du -sh dist-tauri` | TBD | TBD | TBD | TBD |
| JS chunk count | TBD | TBD | TBD | TBD |
| JSON chunk count | TBD | TBD | TBD | TBD |
| Largest chunk (name + size) | TBD | TBD | TBD | TBD |
| `du -sh dist-static` | TBD | TBD | TBD | TBD |
| Static gzip size | TBD | TBD | TBD | TBD |

Largest chunks regressions (matched by name):

| Chunk | Pre size | Post size | Delta |
|-------|----------|-----------|-------|
| (fill in based on diff) | | | |

## Identified root cause

(Filled in after Task 5–7.)

## What was tried

(Filled in after Task 5–7.)

## Decision

(Filled in at close-out — `fixed-in-plan` / `accepted-as-structural` / `escalated-to-followup`.)
```

Fill in the TBDs from `/tmp/vite7-baseline.txt` and `/tmp/vite8-baseline.txt`. Be exact — copy the numbers as measured.

- [ ] **Step 3: Commit the measurement RCA**

```bash
git add docs/plans/2026-05-14-vite-8-bundle-regression-rca.md
git commit -m "docs(rca): vite 8 bundle regression — measurements + diff

Pre-Vite-8 v0.257.3 vs current main, captured via dist-tauri /
dist-static du + chunk counts + top-5 chunk gzip equivalents.
Root cause section filled in by tuning attempts (Tasks 5-7)."
```

- [ ] **Step 4: Gate on whether a regression actually exists**

Look at the diff table. If `du -sh dist-tauri` and `du -sh dist-static` are within ±5% AND no individual chunk grew more than ~20%, **there is no regression** — the user's recollection of v0.256 being "much smaller" may have been about a different metric or a pre-eager-inline state. In that case:
- Skip Tasks 5, 6, 7.
- Jump to Task 8 with decision = `accepted-as-structural` (with a note that the audit measurement gap was the real bug, not the bundle).

If there IS a regression, continue to Task 5.

---

## Task 5: Tuning A — `assetsInlineLimit`

**Files:**
- Modify: `vite.renderer.config.ts` (one-line config change if applied).

- [ ] **Step 1: Inspect `assetsInlineLimit` behavior**

```bash
ls -la dist-tauri/assets/*.json | awk '{print $5"\t"$9}' | sort -n | head -20
```

Expected: smallest JSON assets visible. Note any JSONs under 4096 bytes — these are candidates for being inlined as data URLs. Cross-reference with `/tmp/vite7-baseline.txt`: in Vite 7, were the same files inlined or shipped as separate assets?

- [ ] **Step 2: Check if data-URL inlining differs**

```bash
grep -l 'data:application/json;base64' dist-tauri/assets/*.js | head -3
```

Expected: identifies which JS chunks embed inlined JSONs. Compare to the same grep against `../slaktforskning-v0.257.3/dist-tauri/assets/*.js`. If the *number* of inlined JSONs changed materially, this is the regression.

- [ ] **Step 3: If a mismatch is found, adjust `assetsInlineLimit`**

Edit `vite.renderer.config.ts` — set `build.assetsInlineLimit` to match Vite 7 behavior (e.g., set to `0` to disable inlining, or to a specific byte threshold).

```typescript
// In vite.renderer.config.ts build section:
build: {
  // ... existing options ...
  assetsInlineLimit: 0,  // or the specific value that restores parity
},
```

- [ ] **Step 4: Rebuild and re-measure**

```bash
rm -rf dist-tauri
npm run build 2>&1 | tail -10
du -sh dist-tauri
du -h dist-tauri/assets/* | sort -h | tail -5
```

Compare against `/tmp/vite8-baseline.txt`. Did the regression close?

- [ ] **Step 5: Decide and document**

- **If parity restored:** Tuning A worked. Append to RCA "What was tried" section with the config change shown. Skip Tasks 6 and 7. Jump to Task 8 with decision = `fixed-in-plan`.
- **If no change or made worse:** Revert the config change (`git checkout vite.renderer.config.ts`). Append result to RCA. Continue to Task 6.

```bash
# Append to RCA before continuing
cat >> docs/plans/2026-05-14-vite-8-bundle-regression-rca.md <<'EOF'

### Tuning A: assetsInlineLimit

Tried: `assetsInlineLimit: 0` (or value attempted).
Result: <restored parity | no change | made worse — fill in specifics>.
EOF
git add docs/plans/2026-05-14-vite-8-bundle-regression-rca.md
git commit -m "docs(rca): tuning A — assetsInlineLimit result"
```

---

## Task 6: Tuning B — `rolldownOptions.output.manualChunks`

**Files:**
- Modify: `vite.renderer.config.ts` (manualChunks block if applied).

- [ ] **Step 1: Identify the regressed chunk(s) to target**

From the diff table in the RCA, pick the largest regression. For each regressed chunk, look at its content if not obvious from the name: `head -c 500 dist-tauri/assets/<chunk-name>.js`. Goal: figure out what's bundled into it that wasn't bundled together under Vite 7.

- [ ] **Step 2: Try manualChunks directive**

If the regression is a fat chunk that bundles things Vite 7 split apart, add an explicit `manualChunks` directive:

```typescript
// In vite.renderer.config.ts build section:
build: {
  // ... existing options ...
  rolldownOptions: {
    output: {
      manualChunks: {
        // Example: force gazetteer rules into their own chunk
        'gazetteer-rules': ['./src/gazetteer-build/normalize-rules'],
      },
    },
  },
},
```

Adjust the chunk names and source globs based on what the diff shows.

- [ ] **Step 3: Rebuild and re-measure**

```bash
rm -rf dist-tauri
npm run build 2>&1 | tail -10
du -sh dist-tauri
```

- [ ] **Step 4: Decide and document**

Same pattern as Tuning A: if parity restored, jump to Task 8 with decision = `fixed-in-plan`. Otherwise revert and continue to Task 7.

```bash
cat >> docs/plans/2026-05-14-vite-8-bundle-regression-rca.md <<'EOF'

### Tuning B: manualChunks

Tried: <describe the manualChunks directive applied>.
Result: <restored parity | no change | made worse — fill in specifics>.
EOF
git add docs/plans/2026-05-14-vite-8-bundle-regression-rca.md
git commit -m "docs(rca): tuning B — manualChunks result"
```

---

## Task 7: Tuning C — `import.meta.glob` reshape

**Files:**
- Modify: `src/renderer/empty-gazetteers.ts` (the glob call).

- [ ] **Step 1: Read Vite Issue #21876 documented workarounds**

Open [Vite Issue #21876](https://github.com/vitejs/vite/issues/21876) in a browser (or `gh issue view` if applicable). Confirm what changed in Vite 8 for `import.meta.glob`.

- [ ] **Step 2: Try `as: 'url'` instead of `query: '?url'`**

Edit `src/renderer/empty-gazetteers.ts` line 39:

```typescript
// Before:
const URL_MAP: Record<string, string> = import.meta.glob(
  '../api/place-gazetteers/data/*.json',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

// After:
const URL_MAP: Record<string, string> = import.meta.glob(
  '../api/place-gazetteers/data/*.json',
  { eager: true, as: 'url' },
) as Record<string, string>;
```

- [ ] **Step 3: Rebuild and re-measure**

```bash
rm -rf dist-tauri
npm run build 2>&1 | tail -10
du -sh dist-tauri
```

- [ ] **Step 4: Verify the gazetteer fetch still works**

```bash
npm start &
sleep 10
# Navigate to /places in the running app; verify map pins appear
# (gazetteers loaded → place resolution succeeds)
# Kill the app process.
```

If the app boots and places resolve, the reshape preserved functionality. If gazetteers fail to load (404s in DevTools console), revert the change.

- [ ] **Step 5: Decide and document**

```bash
cat >> docs/plans/2026-05-14-vite-8-bundle-regression-rca.md <<'EOF'

### Tuning C: import.meta.glob reshape

Tried: `query: '?url'` → `as: 'url'` (or other reshape attempted).
Result: <restored parity | no change | made worse — fill in specifics>.
EOF
git add src/renderer/empty-gazetteers.ts docs/plans/2026-05-14-vite-8-bundle-regression-rca.md
git commit -m "docs(rca): tuning C — import.meta.glob reshape result"
```

If parity restored, ship the change. Otherwise, revert: `git revert HEAD --no-edit` (only the empty-gazetteers.ts file; keep the RCA append).

---

## Task 8: Close out — name the root cause, write the decision

**Files:**
- Modify: `docs/plans/2026-05-14-vite-8-bundle-regression-rca.md` (fill in root cause + decision).
- Modify: `CHANGELOG.md` if decision is `fixed-in-plan` or `accepted-as-structural`.
- Create (skeleton only): `docs/plans/2026-05-14-gazetteer-bundle-architecture-design.md` if decision is `escalated-to-followup`.

- [ ] **Step 1: Fill in the "Identified root cause" section of the RCA**

One paragraph. Examples:

- "Rolldown's `manualChunks` heuristic groups gazetteer rule-files into a shared chunk (`shared-XYZ.js`, 12 MB) that Rollup previously split into three smaller chunks. The shared chunk is downloaded eagerly because every gazetteer references it. Per [Vite Issue #22007](https://github.com/vitejs/vite/issues/22007), this is the same +bundle / +chunks shape other projects hit."
- "Vite 8 changed `import.meta.glob`'s `query: '?url'` handling; the data URLs returned now reference per-asset chunks instead of static asset paths, inflating the URL_MAP chunk by 8 MB. Per [Vite Issue #21876](https://github.com/vitejs/vite/issues/21876)."
- "No regression detected — measured bundle is within ±2% of v0.257.3. User's recollection of 'v0.256 was much smaller' likely referenced the pre-eager-inline fix state (commit `<sha>`), not v0.257.3."

If none of the tunings restored parity AND no clear root cause emerged, escalate to follow-up.

- [ ] **Step 2: Write the "Decision" section**

One of three:

**Decision: `fixed-in-plan`** — append:
```markdown
## Decision: fixed-in-plan

Tuning <A|B|C> restored bundle parity. Config change shipped in this plan. Current bundle:
- `du -sh dist-tauri`: <new size> (was <pre-fix>, baseline v0.257.3 <baseline>)
- Within ±5% of baseline.
```

**Decision: `accepted-as-structural`** — append:
```markdown
## Decision: accepted-as-structural

Regression is structural to Rolldown's chunking model. None of Tunings A/B/C restored parity. The +<X>% increase in <dist-tauri | static bundle> is accepted; tradeoff is Rolldown's ~10× faster build time. Upstream issue: <Vite Issue # or "filed as <link>">.

CHANGELOG entry: `## Unreleased\n- known: Vite 8 bundle is ~<X>% larger than v0.257.3; see docs/plans/2026-05-14-vite-8-bundle-regression-rca.md.`
```

**Decision: `escalated-to-followup`** — append:
```markdown
## Decision: escalated-to-followup

Regression exceeds acceptable threshold and structural Rolldown behavior alone doesn't explain it. Bundle architecture rework needed — see `docs/plans/2026-05-14-gazetteer-bundle-architecture-design.md` for follow-up design.
```

Then create the skeleton:

```bash
cat > docs/plans/2026-05-14-gazetteer-bundle-architecture-design.md <<'EOF'
# Design — Gazetteer bundle architecture (follow-up)

**Trigger:** Escalated from [2026-05-14-vite-8-bundle-regression-rca.md](2026-05-14-vite-8-bundle-regression-rca.md).

## User goal

(To be brainstormed: the gazetteer bundling strategy is fundamentally rethought — e.g., on-disk streaming, deflate compression, lazy per-gazetteer fetches against a CDN, etc.)

## Scope

(To be brainstormed.)

## Verification

(To be brainstormed.)
EOF
```

- [ ] **Step 3: Update CHANGELOG.md if shipping a fix or documenting an accepted regression**

```bash
# If fixed-in-plan:
# Edit CHANGELOG.md, add under "## Unreleased":
# - "fix: Vite 8 bundle size regression — adjusted <tuning> to restore parity with v0.257.3"

# If accepted-as-structural:
# Edit CHANGELOG.md, add under "## Unreleased":
# - "known: Vite 8 bundle is ~<X>% larger than v0.257.3; structural to Rolldown chunking. See RCA."
```

- [ ] **Step 4: Final commit**

```bash
git add docs/plans/2026-05-14-vite-8-bundle-regression-rca.md CHANGELOG.md
# also add gazetteer-bundle-architecture-design.md if escalating
git commit -m "docs(rca): vite 8 bundle regression — root cause + decision

Decision: <fixed-in-plan | accepted-as-structural | escalated-to-followup>.
<one-sentence summary>"
```

- [ ] **Step 5: Clean up the measurement worktree**

```bash
git worktree remove ../slaktforskning-v0.257.3
git worktree list
```

Expected: `slaktforskning-v0.257.3` no longer in the list. The transient `/tmp/vite7-baseline.txt` and `/tmp/vite8-baseline.txt` will be auto-cleaned by the system; no action needed.

---

## Task 9: Verification — close the plan

- [ ] **Step 1: Verify the RCA contains all required sections**

```bash
grep -E '^## (Measurements|Diff|Identified root cause|What was tried|Decision)' docs/plans/2026-05-14-vite-8-bundle-regression-rca.md
```

Expected: all 5 headers present.

- [ ] **Step 2: Verify the decision branch is honored**

- If `fixed-in-plan`: `npm run build && du -sh dist-tauri` shows post-fix size within ±5% of v0.257.3 baseline.
- If `accepted-as-structural`: `CHANGELOG.md` has the Unreleased "known:" entry; `grep -c 'known:.*bundle' CHANGELOG.md` ≥ 1.
- If `escalated-to-followup`: `ls docs/plans/2026-05-14-gazetteer-bundle-architecture-design.md` exits 0.

- [ ] **Step 3: Run the full test suite to confirm no regression**

```bash
npm test 2>&1 | tail -5
```

Expected: `Test Files X passed (X); Tests Y passed (Y)`. No new failures.

- [ ] **Step 4: Tick off the plan's verification checklist** (mirror of the design doc's `Verification` section):

- [ ] `docs/plans/2026-05-14-vite-8-bundle-regression-rca.md` exists with all 5 sections.
- [ ] Diff table populated with measured numbers.
- [ ] Root cause named (citing Vite/Rolldown behavior).
- [ ] All three tunings documented (attempted/skipped, with reason).
- [ ] Decision recorded.
- [ ] If `fixed-in-plan`: current `npm run build` produces bundle within ±5% of v0.257.3.
- [ ] If `accepted-as-structural`: CHANGELOG Unreleased entry exists.
- [ ] If `escalated-to-followup`: skeleton design file exists.
- [ ] Worktree cleaned up.

---

## Self-review checklist

- [ ] Plan covers every Scope item from the design doc (capture, diff, 3 tunings, RCA, decision).
- [ ] No placeholders, TBDs, or "implement later" in task steps.
- [ ] Exact commands shown with expected output where deterministic.
- [ ] Decision logic (which path to take based on results) is explicit at Tasks 4 and 5–7.
- [ ] Cleanup task (worktree removal) included.
- [ ] CHANGELOG handling explicit for two of three decision branches.

---

## Failure modes / RCA reference

This plan's existence is itself an RCA for the Vite 8 close-out plan ([archive/2026-05-13-vite-8-upgrade.md](archive/2026-05-13-vite-8-upgrade.md)) — its verification didn't compare against a Vite 7 baseline, so its "matching expectation" claim was unfounded. The discipline applied here: every measurement has a comparable baseline; every claim is evidence, not assertion. Per [`.claude/rules/plans.md`](../../.claude/rules/plans.md) §"Verification discipline at close-out."
