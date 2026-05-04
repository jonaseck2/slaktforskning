# Implementation: Foster terminology — labels and display strings

**Date:** 2026-05-04
**Design spec:** [2026-05-04-foster-terminology-design.md](2026-05-04-foster-terminology-design.md)
**Branch strategy:** small fix on `main` (single commit OR a short worktree if scope expands)

## User goal

Every label that names a foster relationship in the app reads as natural Swedish (or English) — never the bare word "Foster" (which means *fetus*) and never the side-by-side "Förälder Foster" / "Barn Foster" two-badge pattern that no Swede would say or write. Same fix applies preventively to adoptive and step relations, which suffer the identical composition bug.

## Scope

Every place where a parent-child relationship's type + subtype is rendered to the user. Identified surfaces:

- `src/renderer/components/RelationshipsList.vue:20-21` — renders `typeLabel` and `subtypeLabel` as two adjacent `<span class="type-badge">`s. **Source of the "Förälder Foster" bug.**
- `src/renderer/components/PersonRelationshipsSection.vue:60-65, 109-129` — composes `typeLabel` and `subtypeLabel`, feeds RelationshipsList.
- `src/renderer/components/RelationshipsTable.vue:55-65` — alternate composer feeding the same list.
- `src/renderer/components/modals/PersonModal.vue:78, 109` — child/parent subtype `<select>` shows `parentChildSubtypes.foster: 'Foster'` as a standalone option (Bengt's R53 — should read "Fosterbarn" / "Fosterförälder" depending on direction).
- `src/renderer/components/modals/RelationshipModal.vue:40` — same dropdown pattern.
- `src/renderer/i18n/sv.ts:500-506` — `parentChildSubtypes` keys.
- `src/renderer/i18n/en.ts:500-506` — same.

Plus the chart legend / hover tooltip strings introduced by [Plan 1 Fix 5](2026-05-04-hourglass-chart-polish-design.md) — wire the same role-key lookup; don't compose.

### Scope deviations

- **GEDCOM tag values** (`PEDI FOSTER`, etc.) stay as-is — they're spec-mandated, not user-visible.
- **Database `relationship_subtype` enum values** (`'foster'`, `'adopted'`, `'step'`, `'biological'`, `'unknown'`) stay as-is — they're identifiers, not display strings. `PARENT_CHILD_SUBTYPE_VALUES` in `src/renderer/constants/eventTypes.ts` is unchanged.
- **`foster_placement` event type** ("Fosterhemsplacering" in sv.ts:430) is already correct — leave it.
- **`coupleSubtypes`** (sv.ts:491-499) are out of scope; no analogous bug.

## Design summary

Replace the type-badge + subtype-badge pair with **a single role label** computed from `(type, direction, subtype)`. The role label uses a dedicated i18n key per role, so the renderer never composes substrings.

New i18n keys (under a new `relationshipRoles` namespace, both sv.ts and en.ts):

| Key | sv | en |
|---|---|---|
| `relationshipRoles.parent_biological` | Förälder | Parent |
| `relationshipRoles.parent_adopted` | Adoptivförälder | Adoptive parent |
| `relationshipRoles.parent_foster` | Fosterförälder | Foster parent |
| `relationshipRoles.parent_step` | Styvförälder | Step-parent |
| `relationshipRoles.parent_unknown` | Förälder (okänd typ) | Parent (unknown type) |
| `relationshipRoles.child_biological` | Barn | Child |
| `relationshipRoles.child_adopted` | Adoptivbarn | Adopted child |
| `relationshipRoles.child_foster` | Fosterbarn | Foster child |
| `relationshipRoles.child_step` | Styvbarn | Stepchild |
| `relationshipRoles.child_unknown` | Barn (okänd typ) | Child (unknown type) |

**Biological renders bare** — "Biologisk barn" is grammatically wrong (would need to be "Biologiskt barn", neuter). User decision: drop the prefix for the default biological case. The keys above already encode that — `parent_biological: 'Förälder'` / `child_biological: 'Barn'` — no adjective.

**`parent_child` direction convention** (user-confirmed): `person1_id` is always the parent; `person2_id` is always the child. The relation reads in that direction. So:
- `PersonModal.vue:78` (add-child mode) renders child-direction labels.
- `PersonModal.vue:109` (add-parent mode) renders parent-direction labels.
- `RelationshipModal.vue:40` describes the parent's role toward the child → parent-direction labels.
- `PersonRelationshipsSection.vue:111` already inverts correctly (`r.person1_id === personId ? 'child' : 'parent'`) — preserve that logic; just route the result through `relationshipRoles.<direction>_<subtype>` instead of two badges.

**i18n source**: implementation choice between accepting a `t` function or using `useI18n()` inside the helper — either is fine as long as no string is composed at the call site.

Helper: `getParentChildRoleLabel(direction: 'parent' | 'child', subtype: string | null): string` in a new `src/renderer/utils/relationshipLabels.ts`. Falls back to `relationshipRoles.<direction>_unknown` when subtype is null/unknown.

`PersonRelationshipsSection` and `RelationshipsTable` call `getParentChildRoleLabel` instead of separately resolving `typeLabel` + `subtypeLabel` for `parent_child` rows. They keep the existing path for `couple` rows (separate concern).

`RelationshipsList` accepts a single `roleLabel` field per row — drops the dual-badge pattern. Deletes the `<span v-if="row.subtypeLabel">` line. Couple rows still pass `roleLabel = typeLabel` (no role-coalescing for couples in this plan).

For the **dropdown options** in PersonModal / RelationshipModal: each `<option>` renders the role label appropriate to its direction (parent picker → "Fosterförälder"; child picker → "Fosterbarn"). The `parentChildSubtypes.*` keys may stay (used by other consumers we'll grep) but the dropdowns switch to `relationshipRoles.<direction>_<subtype>`.

## Tasks

- [x] **Audit consumers of `parentChildSubtypes.*`.** Grep `t('parentChildSubtypes.` and `$t('parentChildSubtypes.` across `src/`. Confirm the five sites listed in Scope are exhaustive. Add anything missing. _(Audit confirmed exactly the 5 sites in Scope: `RelationshipsTable.vue:57`, `PersonRelationshipsSection.vue:63`, `RelationshipModal.vue:40`, `PersonModal.vue:78`, `PersonModal.vue:109`. Nothing missed.)_
- [x] **Add `relationshipRoles` namespace** to `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts` with the 10 keys above. Place after `parentChildSubtypes` for proximity.
- [x] **Create `src/renderer/utils/relationshipLabels.ts`** exporting `getParentChildRoleLabel(t, direction, subtype)`. The composable accepts a `t` function (so the util stays stateless and testable). Or use `useI18n()` inside if the util is only ever called from setup() — confirm during impl which fits cleaner. _(Picked the `t`-function-arg form; pure, stateless, callable from any setup())._
- [x] **Update `PersonRelationshipsSection.vue`** so the `typeLabel`/`subtypeLabel` for `parent_child` rows collapses into one `roleLabel` field. Couple rows keep current dual-badge shape. Delete-confirmation message at line 169-179 also reads from `roleLabel` (the parens `(${subtypeLabel})` block goes away for parent_child rows). _(Couple rows now compose `"Par (Gift)"` at the callsite and pass that as `roleLabel` — the dual-badge shape collapses to a single string row, matching the simpler `RelationshipsList` interface. Information preserved via parenthetical, no Swedish-grammar bug for couples since "Gift" is a noun.)_
- [x] **Update `RelationshipsTable.vue`** with the same change (parent_child → single `roleLabel`, couple unchanged). _(Same parenthetical pattern for couples; per-person `roleLabel` chips in `roleLabel1`/`roleLabel2` now use the direction-aware role helper for parent_child too.)_
- [x] **Update `RelationshipsList.vue`** — drop the second `<span v-if="row.subtypeLabel">`. The row props become `roleLabel: string` (replacing `typeLabel` + optional `subtypeLabel`). Update the consumer interfaces in both calling components.
- [x] **Update `PersonModal.vue:78` (child subtype dropdown)** to render `relationshipRoles.child_<subtype>` per option. _(Both subtype `<select>` blocks at L78 and L109 share the same `parentChildSubtypeOptionLabel(st)` helper, which derives direction from `addRelatedTo.mode` — `father`/`mother` → parent direction, `child`/`son`/`daughter` → child direction.)_
- [x] **Update `PersonModal.vue:109` (parent subtype dropdown)** to render `relationshipRoles.parent_<subtype>` per option. _(Same helper covers both — see note above.)_
- [x] **Update `RelationshipModal.vue:40`** — direction depends on context (parent_child relationship has a person1 = parent, person2 = child — confirm the form's convention). Render the appropriate role label per option. _(Confirmed person1 = parent. Dropdown describes person1's role → parent-direction labels.)_
- [x] **Sweep test (assertion):** add a unit test that fails if any template in `src/renderer/components/` still references `parentChildSubtypes.` directly (indicating a missed site). Use a glob + regex over the file contents. The test enforces the structural-fix discipline going forward.
- [x] **Component tests:** update any existing test that asserts the old badge pair. Add a test for `RelationshipsList` rendering a foster `parent_child` row → asserts a single `<span>` with text "Fosterförälder", no dual badges. _(No pre-existing tests asserted the old badge pair. New tests added: `RelationshipsList.test.ts` (4 cases) and `relationshipLabels.test.ts` (13 parametrized cases incl. fallback paths).)_
- [ ] **Manual smoke check** against a running app: open PersonPanel for a person who has a foster parent and a foster child. Read each row label aloud — both must be natural Swedish. Repeat for adoptive and step relations. _(Cannot run Electron from subagent context — dispatcher must perform Verification steps 1–5 in the running app before merge.)_
- [x] **Bump `package.json` patch** + add `- fix: foster/adoptive/step relationships render natural Swedish labels (Fosterförälder, not Förälder + Foster)` to CHANGELOG `## Unreleased`. _(0.210.12 → 0.210.13; CHANGELOG `## Unreleased` line added.)_

## Verification (user-observable)

1. Open PersonPanel for a person with a foster parent + foster child. Both rows render a single label: "Fosterförälder", "Fosterbarn". No second badge. No bare "Foster".
2. Open the same panel with an adoptive parent + adopted child. Labels read "Adoptivförälder", "Adoptivbarn". (Confirms the preventive sweep caught the same bug for adoptive.)
3. Open PersonModal in add-child mode. The subtype dropdown options read: Barn / Adoptivbarn / Fosterbarn / Styvbarn / Barn (okänd typ). Biological renders bare "Barn" — no "Biologiskt" prefix.
4. Open PersonModal in add-parent mode. Subtype options read: Förälder / Adoptivförälder / Fosterförälder / Styvförälder / Förälder (okänd typ).
5. Switch the app to English. Same surfaces read: "Foster parent" / "Foster child" / "Adoptive parent" / "Adopted child" / "Step-parent" / "Stepchild".
6. The structural-fix sweep test passes: no template in `src/renderer/components/` references `parentChildSubtypes.` directly. Old keys may remain in `i18n/*.ts` (other consumers may exist), but renderer surfaces all go through `relationshipRoles.*`.

## Failure modes / RCA reference

- **Translation patch only.** Renaming `parentChildSubtypes.foster: 'Foster'` to `parentChildSubtypes.foster: 'Fosterbarn'` "fixes" the dropdown but breaks the relations panel (which would render "Förälder" + "Fosterbarn" — worse). The fix has to be structural; the design plan calls this out and the impl plan enforces it via the sweep test.
- **Dropdown direction inversion.** Parent direction subtype must use `parent_<subtype>`, child direction must use `child_<subtype>`. If they're swapped, "Add foster child" shows "Fosterförälder" in the dropdown — silent confusion. Verification step 3 + 4 catches this.
- **Couple rows accidentally collapsed.** Couple rows are out of scope for role-coalescing. The change to `RelationshipsList` must not collapse the couple type+subtype path. Test both row kinds.

## Self-review checklist

- [x] Every grep hit for `parentChildSubtypes.` in `src/renderer/components/` either updated or explicitly justified with a code comment. _(All 5 sites updated; no remaining renderer hits — enforced by `parentChildSubtypes-sweep.test.ts`.)_
- [x] No template composes `${typeLabel} ${subtypeLabel}` or two adjacent badges with type + subtype for parent_child rows. _(RelationshipsList no longer renders `<span v-if="row.subtypeLabel">`; the field itself is gone from `RelationshipListRow`.)_
- [x] sv.ts and en.ts both updated with all 10 new keys.
- [x] CHANGELOG entry written user-first (one sentence, ≤100 chars). _("fix: foster/adoptive/step relationships render natural Swedish labels (Fosterförälder, not Förälder + Foster)" — within the 100-char ceiling.)_
- [ ] Manual smoke check actually performed in a running app. _(Pending — dispatcher to run Verification §1–5 in Electron.)_
