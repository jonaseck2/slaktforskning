# Implementation: PersonPanel Relationer ordering

**Date:** 2026-05-04
**Design spec:** [2026-05-04-person-relations-ordering-design.md](2026-05-04-person-relations-ordering-design.md)
**Branch strategy:** worktree

## User goal

Open the same person twice and see the same Relationer list in the same order, both times. The order matches how a genealogist mentally lists a life: parents first (bio → adoptive → foster), partners chronologically, children grouped under the partner who produced them, everyone else last. No more random / insertion-order surprises.

## Scope

Two surfaces share the relations rendering today; both must use the canonical sort:

- `src/renderer/components/PersonRelationshipsSection.vue` — primary surface (PersonPanel hosts it via `:person-id`).
- `src/renderer/components/reports/{ALifeReport,AMarriageReport,LifeOnOnePageReport,PhotoAlbumReport}.vue` — every report that renders a person's relations. Audit during impl: confirm which of these render relations and which already iterate them in some other order.

Sort logic lives in `src/api/`:
- New file: `src/api/sortPersonRelations.ts` — pure function, no DB calls, takes already-loaded relations + partnerships + children, returns the ordered list.
- Both surfaces import it. No per-render DB calls for sort decisions.

### Scope deviations

- **MCP tool output**: `mcp__slaktforskning__get_person_summary` returns relations in some order today (likely insertion). Calling agents may rely on that order. Confirm during impl whether this MCP tool already aggregates relations into a structured shape; if so, extend it to use `sortPersonRelations`. If not, leave MCP alone for this plan and revisit if agent UX needs deterministic order.
- **Drag-to-reorder**: explicitly out. The order is computed; not user-overridable per person.
- **Couple subtype rendering** is not changed by this plan (separate concern; see [foster-terminology plan](2026-05-04-foster-terminology.md) for parent_child role labels).

## Design summary

### The order (from design spec)

1. Biological father → bio mother → adoptive father → adoptive mother → foster father → foster mother. Each row is single (or absent — empty buckets are omitted).
2. Partners, chronological by partnership start date (earliest first). Partners without a start date sort to the bottom of the partner block, by `id`.
3. **Children grouped under their other parent.** For each partner row from (2), inline-render the children whose other parent is that partner, sorted by birth date oldest-first. Children without birth date sort to the right (or visually below) of dated siblings, by `id`. Children whose other parent is null/absent render under a generic group header `"Annan/okänd förälder"` (NEVER "Fader okänd").
4. Other relations: family-flavoured (godparents, faddrar) first, then social/non-kin (group memberships, custom subtypes), each sub-bucket alphabetized by relation-type label using `Intl.Collator(currentLocale)`.

Empty buckets (no foster parents, no godparents) are omitted entirely.

### The sort function

```typescript
// src/api/sortPersonRelations.ts
export type RelationsSortInput = {
  focalPersonId: string;
  // The person's relationships, raw from `relationships` table joined with the other person's metadata.
  relations: Array<{
    id: string;
    type: string;          // 'parent_child' | 'couple' | 'godparent' | ...
    subtype: string | null;
    person1_id: string;
    person2_id: string;
    other: {
      id: string;
      birth_date: string | null;  // ISO or partial; `null` when unknown
      display_name: string;
    };
    start_date: string | null;    // for couple-type partnerships
  }>;
};

export type RelationsSortGroup =
  | { kind: 'parent';   row: RelationRow }
  | { kind: 'partner';  row: RelationRow; children: RelationRow[] }
  | { kind: 'children-no-partner'; children: RelationRow[] }  // bucketed under 'Annan/okänd förälder'
  | { kind: 'other';    row: RelationRow };

export function sortPersonRelations(input: RelationsSortInput): RelationsSortGroup[];
```

Returns a flat group list ready for the renderer to walk. Each group carries enough info for the renderer to choose the appropriate i18n header (e.g. for `parent`, the renderer reads `subtype` and `direction` and uses the `relationshipRoles` namespace introduced by the foster-terminology plan).

### i18n keys needed

In `personDetail` or `relationships` namespace, both `sv.ts` and `en.ts`:
- `unknownOrOtherParent`: `"Annan/okänd förälder"` / `"Other or unknown parent"`

(The role-label keys for parents/children are introduced by the foster-terminology plan — this plan depends on those keys existing. Sequence the worktrees accordingly: foster-terminology lands first, this plan rebases on top.)

### Locale-aware sub-sort

Family-flavoured vs social-flavoured "other relations" sub-bucket: hardcoded list of family-flavoured relation types (`godparent`, `fadder` if separate, plus the custom-subtype affordance — confirm during impl). Within each sub-bucket, `Intl.Collator(currentLocale)` for alphabetical compare so Swedish letters å, ä, ö order correctly. Locale is read from the i18n composable.

## Tasks

- [x] **Confirm relations data shape.** Read `src/api/relationships.ts` `getForPerson` to see the exact return shape; confirm what's joined (other person's name? birth date? partnership start_date?). Adjust `RelationsSortInput` to match, OR extend `getForPerson` to include the join columns the sort needs (one trip to the DB, not N+1 from the sort).
- [x] **Write `sortPersonRelations.ts`** in `src/api/`. Pure function, no Database param, takes already-loaded data, returns groups. Document the order rules at the top.
- [x] **Unit test the sort** with fixtures covering: bio + adoptive parents present; foster parent absent (empty bucket omitted); partners with mixed start_date / no start_date; children grouped under multiple partners; child with `other_parent_id = null`; godparent + group membership rendered in the correct sub-bucket; locale collation (Swedish å/ä/ö).
- [x] **Refactor `PersonRelationshipsSection.vue`** to call `sortPersonRelations` and walk the returned groups. The render template reads each group's `kind` and renders the appropriate header + rows. Remove any inline sort logic.
- [x] **Audit + refactor reports** (`ALifeReport`, `AMarriageReport`, `LifeOnOnePageReport`, `PhotoAlbumReport`). Each that renders relations imports `sortPersonRelations` and uses the same group walk. If a report renders only a subset (e.g. only partners), the sort can still produce groups; the report filters to the kinds it cares about.
- [x] **i18n keys**: add `unknownOrOtherParent` to both locales.
- [x] **Component test** for PersonRelationshipsSection: mount with a fixture person (bio parents, two partners with shared children, godparent), assert rendered DOM order matches the spec.
- [ ] **Manual smoke check**: open Bengt's test DB or seed equivalent. Walk the order in the running app. Verify same person, same order on reload.
- [x] **Bump `package.json` minor** + CHANGELOG: `- feat: relations on a person panel render in a deterministic, genealogist-friendly order`.

## Verification (user-observable)

1. Open a person with bio parents + adoptive parents + 2 partners (each with shared children) + 1 godparent. Read the order top-to-bottom. Matches the spec.
2. Reload the page. Order is identical.
3. Open the same person in a report (e.g. ALifeReport). Order matches the panel.
4. Switch UI to English. Sub-sort within "other relations" is alphabetical in English collation.
5. Switch to Swedish. Sub-sort within "other relations" is alphabetical in Swedish collation (å/ä/ö placed correctly after z, not after a).

## Failure modes / RCA reference

- **Sort applied at render time only**: drift between panel and report. Hence the `src/api/` location and the shared call site.
- **"Fader okänd" trap**: that label has a specific genealogical meaning (a baptism record where the father is recorded as unknown). Using it for the bucket of children whose other parent isn't in the database conflates two different concepts. Bucket label MUST be `"Annan/okänd förälder"`.
- **Locale collation skipped**: raw string compare ranks å after z incorrectly for Swedish (å sorts after z in Swedish, but raw UTF-8 ranks it elsewhere). `Intl.Collator(locale)` is mandatory for the alphabetical sub-sort.
- **N+1 query trap**: if `getForPerson` doesn't return the other person's birth_date and partnership start_date, the sort function will need them — passing the focalPersonId and re-querying inside the sort would be N+1. Extend `getForPerson` to include the join, or load aggregate data in one call upstream.
- **Coupling to foster-terminology plan**: parent role labels come from `relationshipRoles.<direction>_<subtype>` introduced by foster-terminology. Sequence: land foster-terminology first; this plan rebases on top.

## Self-review checklist

- [x] `sortPersonRelations` is pure (no DB, no `t()`, no globals).
- [x] Both PersonRelationshipsSection AND every report-side relations renderer use the same function. (ALifeReport's parents/spouses/children walk the sort. LifeOnOnePageReport's marriages list also walks the sort to render partners chronologically — matches the panel's order. AMarriageReport consumes `getFamilyUnit` directly — not a relations-list shape; PhotoAlbumReport uses a single subject-couple — neither renders a relations list of the focal person.)
- [x] No `"Fader okänd"` string anywhere in renderer or i18n for the unknown-other-parent bucket.
- [x] Swedish/English collation tested explicitly with å/ä/ö fixtures.
- [x] CHANGELOG entry user-first (one sentence, ≤100 chars).
- [ ] Sequenced after foster-terminology (rebase). — foster-terminology has not yet landed; this plan introduces only `relationships.unknownOrOtherParent` and `relationships.otherRelations`. Parent role labels reuse the existing `reports.relations.{father,mother,parent}` + `parentChildSubtypes.*` keys until foster-terminology lands and rebases on top.

## Open questions for the implementation step

- **MCP `get_person_summary`**: does it return relations in a documented order? If yes, extend it to use `sortPersonRelations` (consistency win for agents). If the field is undocumented, leave it alone for this plan.
- **Custom relation subtypes**: do any "other relations" outside (godparent + group membership) exist in the schema today? If the registry has a fixed enum, the family-flavoured vs social-flavoured split is a hardcoded list; if it's open-ended, the split needs a per-subtype tag.
