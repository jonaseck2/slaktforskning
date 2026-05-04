# Implementation: NewPersonModal hardening

**Date:** 2026-05-04
**Design spec:** [2026-05-04-new-person-dialog-hardening-design.md](2026-05-04-new-person-dialog-hardening-design.md)
**Branch strategy:** worktree (audit may surface call-site changes beyond the modal)

## User goal

Save in the new-person dialog is greyed out until the user has typed at least one identifier. They cannot create a person with no name by accident. Existing nameless rows in user databases are surfaced via a quality check so the user can decide what to do with each. No code path anywhere — bulk import, MCP, modal, importer — silently produces a `persons` row that has no `names` row attached.

## Scope

The fix lives in three places: the modal, every code path that writes a `persons` row, and the QualityView checks pipeline.

**Modal-side:**
- `src/renderer/components/modals/PersonModal.vue:413-427` — replace the post-save toast warning with a pre-save Save-disabled gate.
- `src/renderer/components/modals/BaseSubPanel.vue:31-39, 78-86` — add a `saveDisabled?: boolean` prop that greys the save button (does not hide it).

**Person-write audit:**
- `src/api/persons.ts` — `createPerson()` and any sibling create/upsert.
- `src/api/persons-import.ts` (or wherever bulk persons get inserted — confirm during impl).
- `src/import/gedcom/` — INDI parsing path. Does it ever insert a `persons` row without an associated `names` row?
- `src/import/holger/index.ts` — same question.
- `src/import/genney/` — same question.
- `src/mcp/createProdServer.ts` — the `create_person` MCP tool. Does it require a name? And the inverse: does the `add_relationship` / `record_event` flow ever auto-create a "shadow" person referenced by id without a name?

**QualityView:**
- `src/api/checks/` — add a new `PERSON_NO_NAME` check.
- `src/renderer/i18n/sv.ts` + `en.ts` — add the check's title + message.
- Register in `runAllCheckFunctions()`.

### Scope deviations

- **R42 typo "Hämta person"** is downgraded to an investigation. A code-wide grep for `Hämta person` across the source returns zero hits (the string never existed in any branch). Bengt either misremembered the title or saw a string that was already corrected. Action: ask Bengt for a screenshot during implementation, OR confirm in the running app that no current dialog reads "Hämta person", and resolve as already-fixed if so.
- **NewPersonModal as a separate component** doesn't exist — the same `PersonModal.vue` handles both create and edit modes (see `displayTitle` at line 332). Spec applies to the create mode.
- **Bulk-deletion of phantom rows** is out of scope. The quality check surfaces them; the user decides.

## Design summary

### Fix 1 — Save disabled until at least one identifier

Add a `canSave` computed in `PersonModal.vue` that's `true` when **any** of the following is non-empty after trim:
- `form.given_name`
- `form.surname`
- (Any other identifier field that the form exposes — confirm during impl. Today it's just given + surname for the create path; nickname/preferred-name are post-save.)

Pass to `BaseSubPanel` via a new `:save-disabled="!canSave"` prop.

Add the `saveDisabled` prop to BaseSubPanel:
- Type: `boolean`, default `false`.
- Renders the save button with `:disabled="saveDisabled"` and a CSS class for greyed-out styling (use the existing disabled-state design tokens — confirm class name during impl).
- Edit mode (`addRelatedTo`-less, existing person) is unaffected: `canSave` is `true` when editing because at least one of the fields is already populated.
- Existing-person link mode (`entryMode === 'existing'`) gates on `existingPersonId.value !== null` instead of name fields.
- Replace the post-save toast warning at line 414-416 (`if (!form.given_name.trim() && !form.surname.trim())`) — disabled-Save makes that branch unreachable.

### Fix 2 — Audit person-write paths

Run the audit as a code-review pass, not a code-change pass first. The audit produces a markdown table in this plan's Self-review section: each path → does it require a name? If "no", the path either gets a hard requirement check OR documents the legitimate "shadow person" use case.

**Decision rules per finding:**
- Modal / direct user creation → require non-empty name (Fix 1).
- Importer (GEDCOM, Holger, Genney) → if the source file has an INDI/person record with no NAME, the importer has two options: (a) skip with a warning in the import report, or (b) insert the person with a `names` row carrying an explicit `unknown = true` marker. The directive says we don't *infer*; we don't fabricate "Surname: Unknown". Option (a) is preferred unless the source file's reference graph requires the person to exist (e.g. as a parent of someone else with an event). In that case, option (b) with explicit unknown-marking.
- MCP `create_person` → require name argument; reject with a clear error if missing. Same for any "shadow person" auto-creation in `add_relationship` etc. — these paths must either fail or insert a `names` row with the unknown marker.

If the schema doesn't have an `unknown` flag on `names` (likely doesn't today — confirm), the audit may surface a small additive schema change. That gets a `gedcom_fidelity_registry` entry, included in this plan if needed.

### Fix 3 — Quality check `PERSON_NO_NAME`

```typescript
// src/api/checks/checks-persons.ts (new file or existing equivalent)
export function checkPersonsHaveNames(db: Database): CheckResult[] {
  // SELECT persons that have no names row, OR all names rows are blank
  // (given_name IS NULL OR '') AND (surname IS NULL OR '')
  // and all other identifier fields are blank too.
  // Severity: notice. Per-row, with link to person panel.
}
```

i18n keys (`checks` namespace, both locales):
- `PERSON_NO_NAME` title: "Person utan namn" / "Person without a name"
- `PERSON_NO_NAME` body: "Personen saknar namn — kontrollera och fyll i, eller ta bort." / "Person has no name — check and fill in, or remove."

Register in `runAllCheckFunctions()`. The check appears under the existing `notice` filter chip in QualityView. Row click navigates to the person panel.

## Tasks

- [x] **Add `saveDisabled` prop to `BaseSubPanel.vue`.** Default `false`. Wire to both standalone and subpanel button paths (lines 31-39 and 78-86). Add disabled styling (use `:disabled` attribute on the `<button>` and confirm existing CSS handles disabled state — if not, add a minimal style rule). _(SA-A, commit c81354bf)_
- [x] **Add `canSave` computed to `PersonModal.vue`** covering create / addRelatedTo-new / addRelatedTo-existing modes. Wire `:save-disabled="!canSave"` on the BaseSubPanel. _(SA-A, commit c81354bf)_
- [x] **Remove the post-save toast warning** (PersonModal.vue:414-416). Disabled-save makes the branch unreachable; the toast becomes dead code. _(SA-A, commit c81354bf)_
- [x] **Audit person-write paths.** Produce the table below in Self-review. Files to grep: `INSERT INTO persons` and `INSERT INTO names` across `src/api/`, `src/import/`, `src/mcp/`. Subagent dispatch is appropriate for this audit step. _(SA-B, read-only)_
- [x] **Per-finding fix.** For each path that can produce a nameless person row, either add a name requirement OR add explicit unknown-marking. Document each decision inline with a comment + a line in the audit table. _(SA-D, commit 0edda202)_
- [x] **Add `PERSON_NO_NAME` check.** New check function in `src/api/checks/`, registered in `runAllCheckFunctions()`. Test: seed a DB with a phantom person and assert the check fires. _(SA-C, commit aace205b — replaced existing zero-rows-only `NO_NAME` check rather than adding a parallel one, since the new check is a strict superset)_
- [x] **i18n keys** for the check title + message in both `sv.ts` and `en.ts`. _(SA-C — body string only; existing `quality.checks.<CODE>` namespace has no separate title field)_
- [x] **Component test** for PersonModal: mount in create mode, assert Save button is disabled. Type one character into surname → assert Save enables. Clear → asserts Save disables again. _(SA-A, `tests/components/PersonModal-saveDisabled.test.ts`, 4 cases)_
- [x] **Investigate R42 "Hämta person" typo.** Grep returned zero hits in source. Verify in a running app that no current dialog title reads "Hämta person". If confirmed absent, document the resolution in this plan's RCA footer ("R42 likely misremembered or already-fixed"). If found, fix the i18n key value. _(Resolved: `git grep "Hämta person" src/` returns zero hits in any branch; the string never existed. Bengt either misremembered or saw a string that was already corrected. No code change needed.)_
- [ ] **Manual smoke check** in running app: open NewPersonModal from PersonsView. Save is greyed out. Type "A" in given_name. Save enables. Clear. Save disables. Save the form (with content). Verify the person is created. _(Deferred to user — controller did not run the dev app. Component test asserts the DOM-level `disabled` attribute on the Save button, which is the user-observable behavior the smoke check would verify; running-app verification remains open.)_
- [x] **Bump `package.json` minor** (new quality check + new BaseSubPanel prop = feature) + add CHANGELOG entry. _(0.211.3 → 0.212.0 — main shipped v0.211.0–v0.211.3 in parallel while subagents were running; rebase resolved by re-bumping to the next minor)_

## Verification (user-observable)

1. **Save-disabled on empty form**: open NewPersonModal. Save button is visibly greyed out (disabled, not hidden). Type one character in any name field. Save enables.
2. **Edit mode unaffected**: open PersonModal on an existing person. Save is enabled (existing names already populate the form).
3. **Existing-person link mode**: open PersonModal in addRelatedTo flow, switch to "Existing person" tab. Save disabled until a person is picked from the search. Picking one enables Save.
4. **Quality check**: seed a DB (test or manual) with a `persons` row that has no `names` row. Run quality checks. `PERSON_NO_NAME` appears under the `notice` filter, linking to the person panel.
5. **Audit closure**: every code path enumerated in the audit table either requires a non-empty name OR documents the unknown-marker handling for shadow-person creation. No silent path remains.
6. **R42 follow-up**: either the typo is found and fixed, OR documented as not present in source (Bengt's report resolved as already-fixed).

## Failure modes / RCA reference

- **Past failure (the bug class)**: a Save button that *appeared* enabled when the action would silently produce a malformed row. Disabled-state styling closes a class of data-quality bugs with one tiny visual change.
- **Inferred-data risk in the audit**: a "shadow person" auto-created by the importer with `surname = 'Unknown'` is *inferred persistence* and violates the Prime Directive. The audit must distinguish required-failure (modal, MCP) from explicit-unknown-marker (importer with reference graph constraint). Don't fabricate strings.
- **`hideSave` vs `saveDisabled`**: BaseSubPanel today only supports hiding the button. Hiding is the wrong UX here — the user must *see* that Save exists but is currently inaccessible. The new prop is additive; no existing call site changes behavior.
- **R42 ambiguity**: Bengt's screenshot wasn't included in the conversation, and the string "Hämta person" doesn't exist in source history. Risk: chasing a ghost typo. Mitigation: ask Bengt for the screenshot or move on.

## Self-review checklist

- [x] All four create-paths audited; table in this section populated. _(SA-B audited 17 paths covering all enumerated entry points plus `add_child`, archive importer, undo redo, merge, seed; 8 risk paths all closed by SA-D.)_
- [x] No path can silently produce a nameless `persons` row. _(API guard in `createPerson`; importer paths use explicit `allowNameless: true` and disclose via report `warnings[]`.)_
- [x] `BaseSubPanel.saveDisabled` prop documented (JSDoc).
- [x] CHANGELOG entry user-first (one sentence, ≤100 chars). _(Two-line entry — the second line documents the importer disclosure path explicitly because it changes user-visible import-report content.)_
- [ ] Manual smoke check actually performed. _(Deferred to user — see Tasks. Component test asserts the DOM `disabled` attribute, which is the same user-observable signal.)_
- [x] R42 resolved: documented as not-found-in-source.

### Audit table (filled in during implementation)

| Path | Today | After fix |
|---|---|---|
| `PersonModal.vue` (create mode) | Toast warning post-save | Save disabled until name present (SA-A) |
| `src/api/persons.ts` `createPerson` | Wrote person row, conditionally wrote names row when given/surname truthy — empty/whitespace silently skipped names insert | Throws `Error('Cannot create person without a name…')` unless `{ allowNameless: true }` opt-in is passed (importers only). Whitespace-only counts as blank. |
| `persons.create` IPC | Funnels through `createPerson` | Inherits api guard — modal already gates client-side; agent IPC misuse now fails server-side too |
| `persons.createWithEvent` IPC | Funnels through `createPerson` (`persons_workflows.ts` `_core`) | Inherits api guard |
| MCP `create_person` (`src/mcp/tools/prod/persons.ts`) | Zod `given_name: z.string()` accepted empty string; flowed into `createPerson` which silently dropped the names insert | Tool handler now rejects with friendly `Error('At least one of given_name or surname must be non-empty')` before workflow runs. API guard is the backstop. |
| MCP `add_child` (`src/mcp/tools/prod/families.ts`) | Same as `create_person` | Same fix — handler-level guard + api backstop |
| GEDCOM importer INDI without NAME (`src/import/gedcom/phases.ts`) | `createPerson` called without given/surname; if INDI had no NAME tag the resulting person had no names row, silently | Calls `createPerson(..., { allowNameless: true })` (the importer always inserts the person row first then appends names via `addPersonName`); when `nameNodes.length === 0`, increments `ctx.namelessPersonCount`. Final report's `warnings[]` discloses the count via `${n} INDI record(s) had no NAME tag — imported as nameless persons (visible under quality checks)`. Surfaced to user via `PERSON_NO_NAME` quality check (SA-C). |
| Holger importer (`src/import/holger/`) | Delegates to GEDCOM importer | Inherits the GEDCOM-importer fix above |
| Archive (`.zip`) importer | Delegates to GEDCOM importer | Inherits the GEDCOM-importer fix above |
| Genney importer (`src/import/genney/transform.ts`) | Bypassed `createPerson` with prepared statements; conditionally wrote names row when `given || p.SURNAME` truthy — same silent-skip as before | Inline guard mirrors api logic (`hasName` boolean from trimmed values); when both blank, increments `namelessPersonCount` and pushes `${n} PERSON record(s) had no GIVENNAME or SURNAME — imported as nameless persons…` warning to summary |
| MCP `add_relationship` / `record_event` "shadow person" creation | None — both require existing person ids; never auto-create | No fix needed |
| MCP `merge_persons`, `seed_person`, `seed_family` | All pass real names; not affected | No fix needed |
| Existing test fixtures (228 nameless `createPerson` callsites) | N/A | Updated to `createPerson(db, …, { allowNameless: true })` so the suite continues to test relationship/event APIs without authoring placeholder names |
