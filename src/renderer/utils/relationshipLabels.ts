/**
 * Relationship role label helper.
 *
 * For parent_child relationships, the user-visible label is a single role token
 * — "Fosterförälder", "Adoptivbarn", etc. — never a composition of two badges
 * (type + subtype). Composition produced "Förälder Foster" / "Barn Foster",
 * which is wrong Swedish and reads as "fetus" rather than "foster child".
 *
 * Direction convention (matches the DB):
 *   person1_id is always the parent
 *   person2_id is always the child
 *
 * Subtype values come from PARENT_CHILD_SUBTYPE_VALUES:
 *   'biological' | 'adopted' | 'foster' | 'step' | 'unknown'
 *
 * Falls back to `<direction>_unknown` for null / unrecognised subtypes so the
 * UI never shows a bare key.
 */

type TFunction = (key: string, ...args: unknown[]) => string;

export type ParentChildDirection = 'parent' | 'child';

const KNOWN_SUBTYPES = new Set(['biological', 'adopted', 'foster', 'step', 'unknown']);

export function getParentChildRoleLabel(
  t: TFunction,
  direction: ParentChildDirection,
  subtype: string | null | undefined,
): string {
  const sub = subtype && KNOWN_SUBTYPES.has(subtype) ? subtype : 'unknown';
  return t(`relationshipRoles.${direction}_${sub}`);
}

/**
 * Minimal shape of a `gender_transition` event consumed by the resolver —
 * just the ISO date string. Anything else (`date_type`, `date_original`,
 * `place_id`, `notes`) is irrelevant to the asOf comparison and is left to
 * the calling layer to fetch / format if needed.
 */
export type GenderTransitionEvent = {
  event_type: 'gender_transition';
  /**
   * The ISO date the transition is recorded as taking effect. Compared
   * lexicographically against `asOfIso`, which works for both `YYYY` and
   * `YYYY-MM-DD` shapes as long as both strings use the same format.
   * Events without a `date_value` are treated as if they happened at the
   * start of the chain (sort to the front) — see `resolveParentSexAt`.
   */
  date_value: string | null;
};

type Sex = 'M' | 'F' | 'U';

function flipBinarySex(s: Sex): Sex {
  if (s === 'M') return 'F';
  if (s === 'F') return 'M';
  return 'U';
}

/**
 * Compute a parent's sex at a given point in time, given their current
 * stored sex and an optional list of `gender_transition` life events.
 *
 * **Why this exists:** `persons.sex` is always the parent's *current*
 * identity (Prime Directive: the DB stores what the user authored, never
 * inferred state). Charts, role labels, and reports that need to display
 * the parent's role *at the child's birth* must derive that role from the
 * authored events — not from the static `sex` column. A father who
 * transitions to female in 2020 stays the *biological father* of children
 * born before 2020 and the *biological mother* of children born after.
 *
 * **Algorithm:** walk transitions in chronological order. Each transition
 * flips between M and F (binary flip; U is preserved as-is — gender_transition
 * does not move someone *into* unknown). If `asOfIso` is null/undefined or
 * predates every transition, the result is the sex *before* the earliest
 * transition (i.e. the opposite of `parentCurrentSex` when there are
 * transitions, or `parentCurrentSex` when there are none).
 *
 * Pure function — no DB access, no `window.api`. The caller is responsible
 * for fetching `gender_transition` events (e.g. via `getEventsForPerson`)
 * and passing them in.
 *
 * @param parentEvents  All life events for the parent, or any superset that
 *                      includes their `gender_transition` events. Other event
 *                      types are filtered out internally.
 * @param parentCurrentSex  The value of `persons.sex` (post-most-recent-
 *                          transition).
 * @param asOfIso  ISO date (`YYYY` or `YYYY-MM-DD`) at which we want the
 *                 sex. `null` / `undefined` → `parentCurrentSex` (current
 *                 identity is the live default).
 */
export function resolveParentSexAt(
  parentEvents: ReadonlyArray<{ event_type: string; date_value: string | null }>,
  parentCurrentSex: Sex,
  asOfIso: string | null | undefined,
): Sex {
  // No asOf anchor → default to the live identity.
  if (asOfIso === null || asOfIso === undefined) return parentCurrentSex;

  // Filter to gender_transition events and sort chronologically.
  // Events without a date_value sort to the front (treated as "earliest").
  const transitions = parentEvents
    .filter((e): e is GenderTransitionEvent => e.event_type === 'gender_transition')
    .slice()
    .sort((a, b) => {
      const ad = a.date_value ?? '';
      const bd = b.date_value ?? '';
      if (ad === bd) return 0;
      return ad < bd ? -1 : 1;
    });

  if (transitions.length === 0) return parentCurrentSex;

  // Count how many transitions are AT or BEFORE asOfIso. Each flips the sex.
  // The current sex is the result *after* every transition. To get the sex
  // at asOfIso, count transitions strictly *after* asOfIso — that's how many
  // flips we need to undo.
  let flipsAfter = 0;
  for (const t of transitions) {
    const td = t.date_value ?? '';
    if (td > asOfIso) flipsAfter++;
  }

  // U is preserved across "flips" — the resolver never invents M/F from U.
  if (parentCurrentSex === 'U') return 'U';

  // Even number of flips after asOf → sex at asOf is the same as current.
  // Odd number → flipped once.
  return flipsAfter % 2 === 0 ? parentCurrentSex : flipBinarySex(parentCurrentSex);
}
