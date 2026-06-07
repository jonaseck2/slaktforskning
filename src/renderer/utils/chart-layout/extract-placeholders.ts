import type { BoxLayout, PlaceholderBox } from './types';
import { PLACEHOLDER_PREFIX } from './hourglass-tree';

const ROLES = ['father', 'mother', 'spouse', 'son', 'daughter'] as const;
type Role = (typeof ROLES)[number];

/**
 * Split placeholder boxes out of a layout's box list. Placeholder boxes carry
 * an id of the form `${PLACEHOLDER_PREFIX}<role>_<childPersonId>`. Real boxes
 * pass through untouched. Iterates back-to-front so the returned `placeholders`
 * order matches the legacy per-chart loops (which spliced from the tail).
 *
 * Pure: does not mutate the input array.
 */
export function extractPlaceholders(
  inputBoxes: BoxLayout[],
): { boxes: BoxLayout[]; placeholders: PlaceholderBox[] } {
  const boxes: BoxLayout[] = [];
  const placeholders: PlaceholderBox[] = [];

  for (let i = inputBoxes.length - 1; i >= 0; i--) {
    const b = inputBoxes[i];
    const id = b.person.id;
    if (!id.startsWith(PLACEHOLDER_PREFIX)) {
      boxes.unshift(b);
      continue;
    }
    const rest = id.slice(PLACEHOLDER_PREFIX.length);
    const role = ROLES.find((r) => rest.startsWith(r + '_'));
    if (!role) { boxes.unshift(b); continue; }
    const childPersonId = rest.slice((role + '_').length);
    placeholders.push({ type: 'placeholder', role: role as Role, childPersonId, x: b.x, y: b.y });
  }

  return { boxes, placeholders };
}
