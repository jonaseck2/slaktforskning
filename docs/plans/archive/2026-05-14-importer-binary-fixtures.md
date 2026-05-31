# Native binary importer fixtures — close the e2e gaps

> Acts on the `// Deferred coverage` block in `tests/e2e/imports.spec.ts` (the e2e-expansion plan). Authors tiny native binary fixtures for each importer that currently has GEDCOM-export coverage but no native-decoding coverage. Converts the deferral comment into active tests.

## User goal

When a regression lands in an importer's native binary decoding step (Holger `.zip` extraction + media remap, RootsMagic `.rmtree` SQLite read, Gramps `.gramps` XML parse, Gramps `.gpkg` unpack, Genney native binary path — see sibling plan), **a test fails before the user reports broken import**.

Today the `imports` e2e project covers each tool's GEDCOM-export *logic* — that catches regressions in the GEDCOM parser path through each dialect, which is where most regressions actually land. But it doesn't catch regressions in the *format-decoder* layer that runs only when the user picks a native binary file in the import dialog. That layer has historically broken silently (Tauri-port async/ESM sweeps, Holger media-path-remap, etc.) and was caught by the user importing real files.

The framework's job is to catch importer regressions before the user. Native-binary decoders are part of "importer." This plan closes the gap.

## Scope

One tiny native binary fixture per importer + format, registered in `tests/e2e/imports.spec.ts`. Six formats:

| Format | Importer | Today's status | Fixture needed |
|---|---|---|---|
| Holger `.zip` (with `media/` subfolder) | `import.holgerRun` | covered via bare `.ged` only — the `.zip` extract + media path remap branch is uncovered | a 3-person Holger export with at least one media file |
| RootsMagic `.rmtree` | `import.rootsmagicRun` | covered via GEDCOM-dialect export only | a 3-person RootsMagic database file |
| Gramps `.gramps` (XML, gzipped) | `import.grampsRun` | covered via GEDCOM-dialect export only | a 3-person Gramps XML export |
| Gramps `.gpkg` (XML + media, zipped) | `import.grampsRun` | not covered | a 3-person Gramps package with media |
| Family Tree Maker `.ftm` | (no importer yet) | not in scope (no importer to test) | n/a |
| Genney `.gcc` / `.backup` | `import.genneyRun` | covered in sibling plan `2026-05-14-genney-tauri-wiring.md` | covered by that plan |

**Default scope: all formats with an existing importer.** Family Tree Maker is excluded because we don't ship an FTM importer. Genney is excluded from this plan because its wiring is the blocker, and its fixture lands with the wiring plan. So the practical scope is **4 fixtures**: Holger `.zip+media`, RootsMagic `.rmtree`, Gramps `.gramps`, Gramps `.gpkg`.

### Scope deviations

- **No new importer code.** This plan adds fixtures + activates test cases only. If a fixture surfaces a real regression in an importer (e.g. Gramps `.gpkg` extraction is broken for the first time we test it), open a separate small-fix PR. The plan's verification (5) includes "if a deliberate-break in any importer's native decoder produces a red test, we shipped."
- **Native binary fixtures are committed as binary files.** They're tiny (< 100 KB each) and stable inputs to the test suite. Re-author from scratch is non-trivial (requires each tool installed); committing them ensures the test is repeatable for every contributor. Tracked in `.gitattributes` as `binary` (no diff).
- **Authoring requires running the source apps.** Some are Windows-only paid software (RootsMagic, Holger). If the implementer doesn't have access, mark the fixture's task as `Deferred: contributor with <app> access` in the plan body before that task and skip the spec activation for that format. The deferral is OK *in this plan's execution* — the un-defer trigger (a contributor adds the file) stays clear in `imports.spec.ts`. **Do NOT fake a fixture by, e.g., zipping a `.ged` and calling it a `.rmtree`** — the test would pass via the importer's GEDCOM-fallback path and not actually exercise the native decoder. A defer-with-trigger is more honest than a fake-passing test.

## Verification (user-observable)

The plan is done when **all four** are true:

1. For each fixture authored, `npx playwright test --project=imports --grep <format>` runs the case as a real test (not a TODO or skipped). The expected person count matches the fixture. Spot-check name matches.
2. **Deliberate-red per fixture:** for at least one of the authored fixtures, inject a `throw new Error('e2e-canary')` at the top of the importer's native-decoder entry point (e.g. `holger_extract_ged` in Rust, or `grampsImport` at the unpack step). The corresponding e2e test goes red with the canary message. Revert.
3. The `// Deferred coverage` comment block in `tests/e2e/imports.spec.ts` is updated: each newly-active format is removed from the deferred list, and any format that's still deferred (because the implementer didn't have source-app access) is named with its specific trigger ("Contributor with RootsMagic 10+ Windows install, see `2026-05-14-importer-binary-fixtures.md` Task 2").
4. `--project=imports` total passing count increases by 1 per activated fixture. `--project=panels` and `--project=reactivity` unchanged (sanity).

Per `.claude/rules/plans.md` user-goal-falsifiability: if all four hold, can a native binary importer break silently? No — each fixture exercises the decoder; the deliberate-red proves the assertion is load-bearing.

## Failure modes / RCA reference

- **"Looks-like" fixtures that pass via a fallback path.** Most importers fall back to GEDCOM if they detect the binary format is bad or encrypted. A naive fixture (e.g. a `.zip` containing only a `.ged`) would import "fine" but never exercise the native-decoder branch. Mitigation: the fixture must include the format-specific content (Holger `.zip` must have a `media/` subdirectory; Gramps `.gpkg` must include both the XML and binary media). The test asserts on something only the native path produces (e.g. an imported media row, a specific birth-date format only the RM SQLite path knows).
- **Encrypted source files.** Genney `.backup` files can be password-encrypted; the importer falls back to a GEDCOM export inside the zip. Don't author an encrypted fixture for the e2e test — use an unencrypted one that exercises the Derby-extract path. (Encrypted-fallback shape can be tested separately with a synthetic zip.)
- **Source app version drift.** A fixture authored in RootsMagic 9 may not be parseable by an importer that was tuned for RootsMagic 10. Name the fixture with the source-app version (e.g. `rootsmagic-9-small.rmtree`). If the importer narrows its supported range later, the test will fail loudly with a "version unsupported" error, which is the correct signal.
- **Out-of-band binary updates.** Committing binary files means git diffs don't show their content. Mitigation: every fixture has a sibling `.fixture-summary.md` plain-text file documenting (a) the source-app version that produced it, (b) the schema/content (e.g. "3 persons: Anna, Bo, Cecilia; one event each; one media linked to Anna"), (c) the expected import outcome (counts, spot-check names). Reviewers verify the fixture matches the summary.

## Tasks

Each format gets its own task. Tasks are independent; if one is deferred (no source-app access), the others still ship.

### Task 1 — Holger `.zip` + media fixture

**Files:**
- Create: `tests/e2e/fixtures/imports/holger-small.zip` (binary; 3 persons + 1 media)
- Create: `tests/e2e/fixtures/imports/holger-small.fixture-summary.md`
- Modify: `tests/e2e/imports.spec.ts` (un-TODO the holger-zip case in `CASES`; add an assertion on the imported media)

#### Steps

- [ ] **1.1 — Author the source data in Holger.** Install Holger (Mac/Win), open a fresh database, add 3 persons (Anna Andersson, Bo Bengtsson, Cecilia Andersson) with one birth event each, attach a tiny `pixel.png` (1×1 px) to Anna. Save.
- [ ] **1.2 — Export as Holger archive.** Holger's native export should produce a `.zip` containing the `.ged` + a `media/` subfolder with the image. Confirm by unzipping locally: should see both.
- [ ] **1.3 — Trim if needed.** If the archive is > 100 KB, remove non-essential metadata; the goal is "smallest file that exercises the native decoder path."
- [ ] **1.4 — Author the fixture summary.** Write `holger-small.fixture-summary.md` documenting Holger version, expected counts, and the media-linked-to-Anna assertion.
- [ ] **1.5 — Commit the binary + summary** with `.gitattributes` marking `.zip` as binary if not already.
- [ ] **1.6 — Update `imports.spec.ts`.** Find the `holger` case; change `fixture` to `tests/e2e/fixtures/imports/holger-small.zip`; add `assertMediaCount: 1` to the case shape if not present. The case helper asserts persons.list().length AND media.list().length match the fixture-summary's claims.
- [ ] **1.7 — Run.** `npx playwright test --project=imports --grep holger` — should pass.
- [ ] **1.8 — Deliberate-red.** Inject `throw new Error('e2e-canary')` at the top of `holger_extract_ged` in `src-tauri/src/lib.rs` (or wherever the extract command lives). Rebuild. Test goes red with the canary in the failure message. Revert.
- [ ] **1.9 — Commit.** `test(e2e): activate Holger .zip+media imports case (was TODO)`

#### Verification (Task 1)

`--grep holger` runs and asserts ≥3 persons + 1 media. The deliberate-red produced a red test with the canary text. The `// Deferred:` block in `imports.spec.ts` is updated.

#### Deferral fallback

If no Holger install is available, mark this task as `Deferred: contributor with Holger 8+ install needed` in the plan body and skip — the rest of the plan continues with the formats that ARE available.

---

### Task 2 — RootsMagic `.rmtree` fixture

**Files:**
- Create: `tests/e2e/fixtures/imports/rootsmagic-small.rmtree` (binary; 3 persons)
- Create: `tests/e2e/fixtures/imports/rootsmagic-small.fixture-summary.md`
- Modify: `tests/e2e/imports.spec.ts` (un-TODO the rootsmagic case)

#### Steps

- [ ] **2.1 — Author in RootsMagic.** Install RootsMagic (paid, Windows-only or Mac via Wine; v10 is current), build a 3-person family, save.
- [ ] **2.2 — Locate the `.rmtree` (or `.rmgc`) file.** Verify it's the right format the importer expects by reading `src/import/rootsmagic/`.
- [ ] **2.3 — Copy to `tests/e2e/fixtures/imports/rootsmagic-small.rmtree`** and trim if > 100 KB.
- [ ] **2.4 — Write the fixture summary.** Document RM version, expected person count, spot-check names.
- [ ] **2.5 — Update `imports.spec.ts`** to point at the fixture.
- [ ] **2.6 — Run and verify.**
- [ ] **2.7 — Deliberate-red** on RootsMagic's native decoder (likely a SQLite read in the importer). Revert.
- [ ] **2.8 — Commit.** `test(e2e): activate RootsMagic .rmtree imports case`

#### Verification (Task 2)

Same shape as Task 1: real test, deliberate-red proves the assertion, deferred-comment block updated.

#### Deferral fallback

If no RootsMagic install is available, `Deferred: contributor with RootsMagic 10+ install needed`.

---

### Task 3 — Gramps `.gramps` fixture (XML, gzipped)

**Files:**
- Create: `tests/e2e/fixtures/imports/gramps-small.gramps` (binary; 3 persons)
- Create: `tests/e2e/fixtures/imports/gramps-small.fixture-summary.md`
- Modify: `tests/e2e/imports.spec.ts`

#### Steps

- [ ] **3.1 — Author in Gramps.** Gramps is free (open-source, cross-platform). Install, build a 3-person family, export as `.gramps` (XML, possibly gzipped).
- [ ] **3.2 — Copy as `gramps-small.gramps`.**
- [ ] **3.3 — Fixture summary.**
- [ ] **3.4 — Update spec, run, verify, deliberate-red, revert.**
- [ ] **3.5 — Commit.** `test(e2e): activate Gramps .gramps imports case`

#### Verification (Task 3)

Same shape.

(Gramps is open-source and free — no `Deferral fallback` needed; if the executor's environment can't install Gramps, this is a hard skip with a clear "Gramps install needed, see https://gramps-project.org/download/" — but install effort is low.)

---

### Task 4 — Gramps `.gpkg` fixture (XML + media, zipped)

**Files:**
- Create: `tests/e2e/fixtures/imports/gramps-small.gpkg`
- Create: `tests/e2e/fixtures/imports/gramps-small-gpkg.fixture-summary.md`
- Modify: `tests/e2e/imports.spec.ts` (add a new case if `.gpkg` doesn't already have one)

#### Steps

- [ ] **4.1 — Author in Gramps.** Same 3-person family + attach a media file to one person + export as Gramps Package (`.gpkg`).
- [ ] **4.2 — Verify the .gpkg unpacks correctly** by manually unzipping it locally: should see `data.gramps` (the XML) and an `images/` subfolder (or similar).
- [ ] **4.3 — Copy as `gramps-small.gpkg`.** Trim if > 100 KB.
- [ ] **4.4 — Fixture summary.**
- [ ] **4.5 — Check `src/import/gramps/` for `.gpkg` handling.** If the importer detects `.gpkg` and unpacks before parsing, good — add the test case. If `.gpkg` isn't handled today, **this becomes a feature plan, not a fixture plan** — defer to a separate plan.
- [ ] **4.6 — Update spec, run, verify, deliberate-red, revert.**
- [ ] **4.7 — Commit.** `test(e2e): activate Gramps .gpkg (zipped) imports case`

#### Verification (Task 4)

`.gpkg` case runs and asserts persons + media. The unpack step is exercised.

#### Deferral fallback

If `src/import/gramps/` doesn't handle `.gpkg` today, mark this task as `Deferred: requires Gramps .gpkg unpack support — separate feature plan` and move on. (Could be combined with Task 3 if `.gramps` covers the XML parser and `.gpkg` is purely an unpack-then-`.gramps` flow.)

---

### Task 5 — Update the deferral block in `imports.spec.ts`

**Files:**
- Modify: `tests/e2e/imports.spec.ts` (rewrite the `// Deferred coverage` block based on which formats activated, which deferred)

#### Steps

- [ ] **5.1 — Read each task above** and note which formats activated. The block currently lists all native binary formats as deferred.
- [ ] **5.2 — Rewrite the block.** Remove activated formats from the deferred list. Keep deferred formats with their specific un-defer trigger (e.g. "Holger: deferred until contributor with Holger 8 install authors a fixture, see plan `2026-05-14-importer-binary-fixtures.md` Task 1"). The native-decoder-only formats stay deferred only if they truly weren't authored in this plan.
- [ ] **5.3 — Commit.** `docs(e2e): refresh native-binary deferral block based on activated fixtures`

#### Verification (Task 5)

The deferral block accurately reflects the current state. Every still-deferred format has a concrete un-defer trigger. No silent "TODO some day" entries.

---

## Self-review checklist

- [ ] User goal is concrete and user-observable.
- [ ] Scope explicitly lists all 4 formats (5 if Genney `.gcc` were in scope; it isn't — paired plan).
- [ ] Each task is independent; deferring one doesn't break others.
- [ ] Deliberate-red per fixture is part of verification.
- [ ] Deferral-fallback shape is documented for source-app-access risk (Holger / RootsMagic).
- [ ] No placeholder text.

## Pairs with

- **`2026-05-14-genney-tauri-wiring.md`** — wires the Genney `notWired` stub + activates `.gcc` and `.backup` fixtures. Different scope (product wiring + JVM + Bun sidecar), so a separate plan. The two plans together close every TODO and `// Deferred:` entry currently in `tests/e2e/imports.spec.ts`.
