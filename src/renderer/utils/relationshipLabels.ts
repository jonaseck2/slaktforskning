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
