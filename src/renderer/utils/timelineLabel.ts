/**
 * Compose the visual label for a timeline row.
 *
 * The label carries the relationship — never the bare event type —
 * so a reader scanning the focal person's timeline sees "Sons födelse"
 * instead of "Birth" for someone else's birth event.
 *
 * Render-only. The data comes from authored DB rows (event_type,
 * relationship type + subtype, person sex, person names) and is composed
 * at every render. Per the project's Prime Directive, no labelling result
 * is ever persisted.
 *
 * The composable returns a structured object so the caller controls layout
 * (Vue templates, report HTML, plain-text exports). `primary` is the main
 * line; `secondary` is an optional subdued line (e.g. place when the
 * primary line is owned by a partner name).
 *
 * @see plan docs/plans/2026-05-09-timeline-kin-event-labelling.md
 */

import type { TimelineEntry, TimelineRelationshipLabel } from '../../api/report_data';
import { formatFullName } from './nameUtils';

export interface ComposedLabel {
  /** Main label line. */
  primary: string;
  /** Optional subdued secondary line (e.g. place when partner replaces it). */
  secondary?: string;
  /**
   * Plain-text full-sentence form for ARIA / screen-reader narration.
   * Includes the date and place when present. The visual `primary` form
   * is too terse for assistive tech.
   */
  aria: string;
}

/** vue-i18n's `t` shape — narrow surface to what the composer uses. */
export type TimelineI18n = (
  key: string,
  named?: Record<string, string | number>,
) => string;

/** Couple-event types where partner replaces the place in the primary line. */
const COUPLE_EVENT_TYPES = new Set([
  'marriage',
  'divorce',
  'wedding',
  'engagement',
  'separation',
  'annulment',
  'marriage_license',
]);

interface ComposeOptions {
  /**
   * Display setting from the global birth-name toggle. When true and the
   * referenced person has a distinct birth surname, append "(f. <surname>)"
   * after the name. See plan birth-name-display-and-quality-check.
   */
  showBirthNameParenthetical?: boolean;
  /** i18n key for the "born" abbreviation, falling back to "f.". */
  bornAbbrev?: string;
}

function nameWithBirth(
  name: string,
  birthSurname: string | null | undefined,
  showBirthNameParenthetical: boolean,
  bornAbbrev: string,
): string {
  const trimmed = name.trim();
  const birth = (birthSurname ?? '').trim();
  if (!showBirthNameParenthetical || !birth) return trimmed;
  return `${trimmed} (${bornAbbrev} ${birth})`;
}

/** Sex-neutral child labels collapse to {sonBirth | daughterBirth | childBirth}. */
function eventLabelKey(role: TimelineRelationshipLabel, eventType: string): string | null {
  // Parent-of-child events
  if (role === 'son' && eventType === 'birth') return 'timelineLabels.sonBirth';
  if (role === 'daughter' && eventType === 'birth') return 'timelineLabels.daughterBirth';
  if (role === 'child' && eventType === 'birth') return 'timelineLabels.childBirth';
  if (role === 'son' && eventType === 'death') return 'timelineLabels.sonDeath';
  if (role === 'daughter' && eventType === 'death') return 'timelineLabels.daughterDeath';
  if (role === 'child' && eventType === 'death') return 'timelineLabels.childDeath';

  // Foster / step parent of focal: the *parent's* events surface under these
  // when subject is the child. Child-of-foster/step-parent events:
  if (role === 'foster_son' && eventType === 'foster_placement') return 'timelineLabels.fosterChildWelcomed';
  if (role === 'foster_daughter' && eventType === 'foster_placement') return 'timelineLabels.fosterChildWelcomed';
  if (role === 'foster_child' && eventType === 'foster_placement') return 'timelineLabels.fosterChildWelcomed';
  if (role === 'step_son' && eventType === 'foster_placement') return 'timelineLabels.stepChildWelcomed';
  if (role === 'step_daughter' && eventType === 'foster_placement') return 'timelineLabels.stepChildWelcomed';
  if (role === 'step_child' && eventType === 'foster_placement') return 'timelineLabels.stepChildWelcomed';
  if (role === 'foster_son' && eventType === 'death') return 'timelineLabels.fosterChildDeath';
  if (role === 'foster_daughter' && eventType === 'death') return 'timelineLabels.fosterChildDeath';
  if (role === 'foster_child' && eventType === 'death') return 'timelineLabels.fosterChildDeath';
  if (role === 'step_son' && eventType === 'death') return 'timelineLabels.stepChildDeath';
  if (role === 'step_daughter' && eventType === 'death') return 'timelineLabels.stepChildDeath';
  if (role === 'step_child' && eventType === 'death') return 'timelineLabels.stepChildDeath';

  // Child-of-parent events (focal is child)
  if ((role === 'father' || role === 'mother' || role === 'parent') && eventType === 'death') {
    return 'timelineLabels.parentDeath';
  }
  if ((role === 'foster_father' || role === 'foster_mother' || role === 'foster_parent') && eventType === 'death') {
    return 'timelineLabels.fosterParentDeath';
  }
  if ((role === 'step_father' || role === 'step_mother' || role === 'step_parent') && eventType === 'death') {
    return 'timelineLabels.stepParentDeath';
  }

  // Spouse death (couple partner died — focal survives them)
  if (role === 'spouse' && eventType === 'death') return 'timelineLabels.partnerDeath';

  // Sibling
  if (role === 'sibling' && eventType === 'death') return 'timelineLabels.siblingDeath';

  return null;
}

/**
 * Returns the full-sentence ARIA form. The visual form is terse and relies
 * on visual layout (date column, age column) for context; the ARIA form
 * narrates the row as a sentence.
 */
function composeAria(
  primary: string,
  date: string | null,
  place: string | null,
  t: TimelineI18n,
): string {
  const parts: string[] = [primary];
  if (date) parts.push(t('a11y.timelineDate', { date }));
  if (place) parts.push(t('a11y.timelinePlace', { place }));
  return parts.join(', ');
}

/**
 * Compose the visual label for a timeline entry. `t` is the vue-i18n
 * `useI18n().t` function; pass `formatFullName`-formatted names to the
 * partner / kin slots.
 *
 * The function is pure — no Vue / DOM access — so it can be unit-tested
 * directly and reused inside reports.
 */
export function composeTimelineLabel(
  entry: TimelineEntry,
  t: TimelineI18n,
  options: ComposeOptions = {},
): ComposedLabel {
  const {
    showBirthNameParenthetical = false,
    bornAbbrev = t('common.bornAbbrev'),
  } = options;
  const eventType = entry.event.event_type;
  const eventLabel = t(`eventTypes.${eventType}`);
  const role = entry.relationship_label;
  const place = entry.event.place_name ?? null;
  const dateText = entry.event.date_original || entry.event.date_value || null;

  // Self event ----------------------------------------------------------
  if (role === 'self') {
    if (entry.partner && COUPLE_EVENT_TYPES.has(eventType)) {
      const partnerName = nameWithBirth(
        formatFullName({
          given_name: entry.partner.given_name,
          surname: entry.partner.surname,
        }) || t('common.unknown'),
        entry.partner.birth_surname,
        showBirthNameParenthetical,
        bornAbbrev,
      );
      const primary = t('timelineLabels.coupleEvent', {
        type: eventLabel,
        partner: partnerName,
      });
      return {
        primary,
        secondary: place ?? undefined,
        aria: composeAria(primary, dateText, place, t),
      };
    }
    // Bare self event — keep as-is (was the previous behaviour).
    return {
      primary: eventLabel,
      aria: composeAria(eventLabel, dateText, place, t),
    };
  }

  // Kin event -----------------------------------------------------------
  const kinName = nameWithBirth(
    formatFullName({
      given_name: entry.person_given_name,
      surname: entry.person_surname,
    }) || t('common.unknown'),
    entry.person_birth_surname,
    showBirthNameParenthetical,
    bornAbbrev,
  );

  const labelKey = eventLabelKey(role, eventType);
  if (labelKey) {
    // Spec table forms: "Sons födelse — <name>", "Förälders död — <name>", …
    // The label key resolves to the relational phrase; we suffix the name.
    const phrase = t(labelKey);
    const primary = t('timelineLabels.kinEvent', { phrase, name: kinName });
    return {
      primary,
      aria: composeAria(primary, dateText, place, t),
    };
  }

  // Fallback for kin events that don't fit the canonical table — e.g. an
  // unusual event_type that still wants a relational prefix. Format:
  // "<role>: <event-type> — <name>"  (matches the sibling/godparent row).
  const roleLabel = t(`timelineLabels.${role}`);
  const primary = t('timelineLabels.kinFallback', {
    role: roleLabel,
    type: eventLabel,
    name: kinName,
  });
  return {
    primary,
    aria: composeAria(primary, dateText, place, t),
  };
}
