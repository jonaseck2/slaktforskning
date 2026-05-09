# Bundle / memory reduction — measurements

Working notes recorded as the plan executes. Compared at Task 14.

## Baseline (commit 096e6fd9, 2026-05-09)

The baseline numbers come from the parent `main` branch as of commit 096e6fd9
(the plan-only commit, no code changes yet). Captured in three categories:

### Installer / packaged size
- macOS .zip (`out/make/zip/darwin/.../*.zip`): _user-pending — capture before reviewing PR_
- Windows .exe: _user-pending_
- Linux .deb: _user-pending_

The plan's automated subagents do not run `npm run make` themselves to avoid
spending 5+ minutes on each pass; the intent is for Task 14 to compare the
final HEAD against `main` once via a single make-and-diff. See Task 14.

### Idle RAM (sum of all Slaktforskning processes' Real Memory)
- _user-pending — requires GUI launch on macOS / Windows / Linux desktop_

### Cold start (median of 3, `[startup]` log)
- _user-pending — requires GUI launch_

Subagent-recorded code metrics (size of binary vs JSON, etc.) are appended in
the relevant Task sections below as we go.

---

## After Task 5 (binary codec round-trip)

(populated by the Task 5 subagent — totals from running the codec across all
34 bundled gazetteers)

---

## After Task 7 (binary loader)

(populated by Task 7 subagent — packaged `.vite/build/gazetteers/` total bytes)

---

## After Task 13 (WASM heap smoke)

(populated by Task 13 subagent — pre/post import heap deltas)

---

## Final (Task 14)

(populated by Task 14 — full before/after comparison + decision on follow-up)
