/**
 * Deterministic ordering of a person's relations for the Person panel
 * "Relationer" section and the corresponding section in person reports.
 *
 * **User goal:** open the same person twice and see the same Relationer
 * list in the same order, both times. The order matches how a genealogist
 * mentally lists a life: parents first (bio → adoptive → foster), partners
 * chronologically, children grouped under the partner who produced them,
 * everyone else last. No more random / insertion-order surprises.
 *
 * **The order:**
 *   1. Parents — biological father, biological mother, adoptive father,
 *      adoptive mother, foster father, foster mother. Single row each (or
 *      absent — empty buckets are omitted).
 *   2. Partners — chronological by partnership `start_date` (earliest first).
 *      Partners without a start date sort to the bottom of the partner block,
 *      ordered by `id` among themselves.
 *   3. Children — grouped under the partner who produced them. For each
 *      partner row from (2), inline-render the children whose other-parent
 *      is that partner, sorted by birth date oldest-first. Children without
 *      birth date sort below dated siblings, by `id`. Children whose other
 *      parent is `null`/absent render under a generic "Other or unknown
 *      parent" bucket as the last partner-like entry (never under the
 *      misleading label "Fader okänd").
 *   4. Other relations — family-flavoured (godparent / fadder) first, then
 *      social/non-kin (group memberships, custom subtypes), each sub-bucket
 *      alphabetized by relation-type label using `Intl.Collator(locale)`
 *      so Swedish letters (å, ä, ö) collate correctly.
 *
 * This function is **pure**: no DB access, no `t()` / i18n, no globals.
 * The caller pre-loads everything the sort needs (other person's
 * `display_name` and `birth_date`, partnership `start_date`) and the
 * caller passes the user's UI locale so the sub-sort uses the right
 * collator. Same input → same output.
 */

export type RelationDirection = 'incoming' | 'outgoing';

/**
 * One relationship row pre-joined with the other person's display info
 * and any auxiliary fields the sort needs.
 *
 * `direction` tells the sort which side of a `parent_child` relationship
 * the focal person is on:
 *   - `incoming`: the focal person is the *child* (other person is the parent).
 *   - `outgoing`: the focal person is the *parent* (other person is the child).
 *
 * For symmetric relations (`couple`, `sibling`) `direction` is meaningless
 * and may be set to either value — the sort doesn't read it for those.
 */
export interface RelationRow {
  id: string;
  type: string;          // 'parent_child' | 'couple' | 'sibling' | 'godparent' | 'other' | …
  subtype: string | null; // for parent_child: 'biological' | 'adopted' | 'foster' | 'step' | 'unknown'
  person1_id: string | null;
  person2_id: string | null;
  direction: RelationDirection;
  other: {
    id: string | null;
    display_name: string;
    /** Other person's `sex`. Used only to choose father/mother label downstream — never read by the sort itself. */
    sex: 'M' | 'F' | 'U' | null;
    /** Other person's birth event `date_value` (ISO or partial). `null` when unknown. */
    birth_date: string | null;
  };
  /**
   * For `couple`-type rows, the partnership start date — typically the
   * marriage event's `date_value`. `null` when no start date is known.
   * Ignored for non-couple rows.
   */
  start_date: string | null;
  /**
   * For an outgoing `parent_child` row (focal is the parent, other is the
   * child), this is the OTHER parent's person id — the partner who
   * produced this child with the focal person. `null` when no other parent
   * is recorded in the database. Ignored for non-child rows.
   *
   * Required for child grouping under partners. The caller resolves it by
   * looking up each child's incoming parent_child relations and picking
   * the parent that isn't the focal person.
   */
  other_parent_id: string | null;
}

export type RelationsSortGroup =
  /** A single parent row. `subtype` + `direction` carry enough info for the renderer to pick the i18n label. */
  | { kind: 'parent'; subtype: ParentSubtype; sex: 'M' | 'F' | 'U' | null; row: RelationRow }
  /** A partner row with the children produced with that partner inlined under it. */
  | { kind: 'partner'; row: RelationRow; children: RelationRow[] }
  /** Children whose other parent is null/absent — bucketed under "Other or unknown parent". */
  | { kind: 'children-no-partner'; children: RelationRow[] }
  /** Anything else (godparent, group membership, custom subtype) — flat row. */
  | { kind: 'other'; row: RelationRow };

/** Parent subtypes the sort recognises. Anything outside this list is treated as `unknown`. */
export type ParentSubtype = 'biological' | 'adopted' | 'foster' | 'step' | 'unknown';

const PARENT_BUCKET_ORDER: ParentSubtype[] = ['biological', 'adopted', 'foster', 'step', 'unknown'];

/**
 * Relation types treated as "family-flavoured" — they sit at the top of the
 * "Other relations" sub-bucket (after parents/partners/children).
 * Everything else (group memberships, custom subtypes, `'other'`) sorts
 * after, in the social/non-kin sub-bucket.
 */
const FAMILY_FLAVOURED_OTHER_TYPES = new Set<string>(['godparent', 'godchild', 'sibling', 'fadder']);

export interface SortPersonRelationsInput {
  focalPersonId: string;
  rows: RelationRow[];
  /**
   * BCP-47 locale tag (e.g. `'sv'`, `'en'`). Used to construct an
   * `Intl.Collator(locale)` for the alphabetical sub-sort within
   * "Other relations". Passing `undefined` falls back to the host's
   * default collation.
   */
  locale?: string;
}

/**
 * Sort a person's relations into deterministic groups for display.
 *
 * @returns an ordered array of groups; the renderer walks them in order.
 *          Empty buckets are omitted (no "Adoptive father: none" placeholder).
 */
export function sortPersonRelations(input: SortPersonRelationsInput): RelationsSortGroup[] {
  const { focalPersonId, rows, locale } = input;
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const groups: RelationsSortGroup[] = [];

  // ── 1. Parents ─────────────────────────────────────────────────────────
  // The focal person is the *child* in any incoming parent_child row.
  // Bucket by subtype, then within each bucket order father → mother.
  const parentRows = rows.filter(r => r.type === 'parent_child' && r.direction === 'incoming');
  const parentsBySubtype = new Map<ParentSubtype, RelationRow[]>();
  for (const r of parentRows) {
    const key = normaliseParentSubtype(r.subtype);
    const list = parentsBySubtype.get(key) ?? [];
    list.push(r);
    parentsBySubtype.set(key, list);
  }
  for (const subtype of PARENT_BUCKET_ORDER) {
    const list = parentsBySubtype.get(subtype);
    if (!list || list.length === 0) continue;
    // Father (M) first, then Mother (F), then Unknown — stable by `id` within
    // each sex slot (multiple bio fathers in the DB → deterministic order).
    list.sort((a, b) => {
      const sa = sexRank(a.other.sex);
      const sb = sexRank(b.other.sex);
      if (sa !== sb) return sa - sb;
      return idCompare(a.id, b.id);
    });
    for (const row of list) {
      groups.push({ kind: 'parent', subtype, sex: row.other.sex, row });
    }
  }

  // ── 2 + 3. Partners (with children inlined under their producing partner) ──
  // Couples whose focal is on either side — there's no direction concept.
  const partnerRows = rows
    .filter(r => r.type === 'couple')
    .slice()
    .sort((a, b) => {
      // Earlier `start_date` first; `null` start dates sink to the bottom of
      // the partner block, deterministically ordered by `id`.
      const sa = a.start_date;
      const sb = b.start_date;
      if (sa && sb) {
        const c = sa.localeCompare(sb);
        if (c !== 0) return c;
        return idCompare(a.id, b.id);
      }
      if (sa && !sb) return -1;
      if (!sa && sb) return 1;
      return idCompare(a.id, b.id);
    });

  // Outgoing parent_child = focal is the parent; the other person is the
  // child. The caller pre-resolves each child's `other_parent_id` (the
  // partner who produced this child with the focal person). We bucket
  // children under the matching partner row; children with no other_parent
  // (null, or pointing to someone not in this person's partner list) fall
  // into the "no-partner" bucket.
  const childRows = rows.filter(r => r.type === 'parent_child' && r.direction === 'outgoing');

  // Build a map of partner-other-id → partner row (to validate which partner
  // a child should attach to).
  const partnerByOtherId = new Map<string, RelationRow>();
  for (const p of partnerRows) {
    if (p.other.id) partnerByOtherId.set(p.other.id, p);
  }

  // Bucket children by their declared other-parent-id. Children whose
  // other-parent-id is null or not among the focal person's partners go
  // into the catch-all bucket ("Other or unknown parent").
  const childrenByPartnerOtherId = new Map<string, RelationRow[]>();
  const orphanChildren: RelationRow[] = [];
  for (const c of childRows) {
    const otherParentId = c.other_parent_id;
    if (otherParentId && partnerByOtherId.has(otherParentId)) {
      const list = childrenByPartnerOtherId.get(otherParentId) ?? [];
      list.push(c);
      childrenByPartnerOtherId.set(otherParentId, list);
    } else {
      orphanChildren.push(c);
    }
  }

  // Children within a partner bucket: oldest-first by birth_date; undated
  // children sort below dated, ordered by `id`.
  for (const list of childrenByPartnerOtherId.values()) {
    list.sort(compareChildren);
  }
  orphanChildren.sort(compareChildren);

  // Emit each partner row + its children inline.
  for (const partner of partnerRows) {
    const partnerOtherId = partner.other.id;
    const children = partnerOtherId
      ? (childrenByPartnerOtherId.get(partnerOtherId) ?? [])
      : [];
    groups.push({ kind: 'partner', row: partner, children });
  }

  // The "no-partner" bucket — last partner-like entry, before "Other".
  if (orphanChildren.length > 0) {
    groups.push({ kind: 'children-no-partner', children: orphanChildren });
  }

  // ── 4. Other relations — family-flavoured first, then social/non-kin ──
  const otherRows = rows.filter(r =>
    r.type !== 'parent_child' && r.type !== 'couple'
  );
  const familyFlavoured = otherRows.filter(r => FAMILY_FLAVOURED_OTHER_TYPES.has(r.type));
  const social = otherRows.filter(r => !FAMILY_FLAVOURED_OTHER_TYPES.has(r.type));

  // Within each sub-bucket: alphabetical by display_name first, then by
  // type (so two godparents named "Anna" + "Bertil" land Anna-first).
  // Locale-aware compare so å/ä/ö order correctly under `'sv'` but the
  // same letters fold into 'a'/'o' under `'en'`.
  const subSort = (a: RelationRow, b: RelationRow): number => {
    const c1 = collator.compare(a.type, b.type);
    if (c1 !== 0) return c1;
    const c2 = collator.compare(a.other.display_name, b.other.display_name);
    if (c2 !== 0) return c2;
    return idCompare(a.id, b.id);
  };
  familyFlavoured.sort(subSort);
  social.sort(subSort);

  for (const row of familyFlavoured) groups.push({ kind: 'other', row });
  for (const row of social) groups.push({ kind: 'other', row });

  // Mark `focalPersonId` as read so callers/eslint can rely on the param.
  // It's part of the public contract for future expansion (e.g. derived
  // direction tagging) even though the current implementation receives
  // direction pre-computed on each row.
  void focalPersonId;

  return groups;
}

// ── helpers ─────────────────────────────────────────────────────────────

function normaliseParentSubtype(subtype: string | null): ParentSubtype {
  if (subtype === 'biological' || subtype === 'adopted' || subtype === 'foster' || subtype === 'step') {
    return subtype;
  }
  return 'unknown';
}

/**
 * Order father (M) → mother (F) → unknown (U/null) within a parent bucket.
 * Symmetric for any sex-typed sort: lower rank wins.
 */
function sexRank(sex: 'M' | 'F' | 'U' | null): number {
  if (sex === 'M') return 0;
  if (sex === 'F') return 1;
  return 2;
}

function compareChildren(a: RelationRow, b: RelationRow): number {
  const da = a.other.birth_date;
  const db = b.other.birth_date;
  if (da && db) {
    const c = da.localeCompare(db);
    if (c !== 0) return c;
    return idCompare(a.id, b.id);
  }
  if (da && !db) return -1;
  if (!da && db) return 1;
  return idCompare(a.id, b.id);
}

function idCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
