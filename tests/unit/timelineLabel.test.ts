/**
 * Unit tests for `composeTimelineLabel` — the relational-prefix composer
 * that turns a TimelineEntry into a row label like "Sons födelse — Erik".
 *
 * The fixture uses a minimal vue-i18n-shaped `t` function that resolves
 * keys against the actual sv.ts and en.ts dictionaries. This way the
 * tests catch i18n-key drift the same way the real renderer would.
 */

import { describe, it, expect } from 'vitest';
import sv from '../../src/renderer/i18n/sv';
import en from '../../src/renderer/i18n/en';
import { composeTimelineLabel } from '../../src/renderer/utils/timelineLabel';
import type { TimelineEntry, EventWithPlace } from '../../src/api/report_data';

type Locale = typeof sv;

function makeT(dict: Locale) {
  return (key: string, named?: Record<string, string | number>): string => {
    const parts = key.split('.');
    let cursor: unknown = dict as unknown;
    for (const p of parts) {
      if (cursor && typeof cursor === 'object' && p in (cursor as Record<string, unknown>)) {
        cursor = (cursor as Record<string, unknown>)[p];
      } else {
        return key;
      }
    }
    if (typeof cursor !== 'string') return key;
    if (!named) return cursor;
    return cursor.replace(/\{(\w+)\}/g, (_m, k) => String(named[k] ?? `{${k}}`));
  };
}

const tSv = makeT(sv);
const tEn = makeT(en);

function makeEvent(partial: Partial<EventWithPlace>): EventWithPlace {
  return {
    id: 'e1',
    event_type: 'birth',
    date_type: 'exact',
    date_value: '1972-04-01',
    date_value_end: null,
    date_original: '1972-04-01',
    place_id: null,
    place_address: null,
    cause: null,
    value: null,
    notes: '',
    relationship_id: null,
    created_at: '',
    updated_at: '',
    place_name: null,
    place_path: null,
    ...partial,
  };
}

function makeEntry(partial: Partial<TimelineEntry>): TimelineEntry {
  return {
    event: makeEvent({}),
    person_id: 'p1',
    person_given_name: 'Anna',
    person_surname: 'Andersson',
    person_birth_surname: null,
    relationship_label: 'self',
    partner: null,
    ...partial,
  };
}

describe('composeTimelineLabel — self events', () => {
  it('returns the bare event type for self events', () => {
    const result = composeTimelineLabel(
      makeEntry({ relationship_label: 'self', event: makeEvent({ event_type: 'birth' }) }),
      tSv,
    );
    expect(result.primary).toBe('Födelse');
  });

  it('renders couple events with partner name in the primary line', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'self',
        event: makeEvent({ event_type: 'marriage', place_name: 'Stockholm' }),
        partner: {
          person_id: 'p2',
          given_name: 'Anna',
          surname: 'Andersson',
          birth_surname: null,
        },
      }),
      tSv,
    );
    expect(result.primary).toBe('Vigsel — Anna Andersson');
    expect(result.secondary).toBe('Stockholm');
  });

  it('uses the unknown placeholder when partner has no names', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'self',
        event: makeEvent({ event_type: 'divorce' }),
        partner: {
          person_id: 'p2',
          given_name: '',
          surname: '',
          birth_surname: null,
        },
      }),
      tSv,
    );
    expect(result.primary).toBe('Skilsmässa — (okänd)');
  });
});

describe('composeTimelineLabel — parent of child', () => {
  it('labels son birth correctly', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'son',
        event: makeEvent({ event_type: 'birth' }),
        person_given_name: 'Erik',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    expect(result.primary).toBe('Sons födelse — Erik Andersson');
  });

  it('labels daughter death correctly', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'daughter',
        event: makeEvent({ event_type: 'death' }),
        person_given_name: 'Lisa',
        person_surname: 'Persson',
      }),
      tSv,
    );
    expect(result.primary).toBe('Dotters död — Lisa Persson');
  });

  it('labels child birth (sex unknown) correctly', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'child',
        event: makeEvent({ event_type: 'birth' }),
        person_given_name: 'Sam',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    expect(result.primary).toBe('Barns födelse — Sam Andersson');
  });
});

describe('composeTimelineLabel — child of parent (focal is the child)', () => {
  it('labels parent death the same regardless of sex', () => {
    const father = composeTimelineLabel(
      makeEntry({
        relationship_label: 'father',
        event: makeEvent({ event_type: 'death' }),
        person_given_name: 'Olof',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    expect(father.primary).toBe('Förälders död — Olof Andersson');

    const mother = composeTimelineLabel(
      makeEntry({
        relationship_label: 'mother',
        event: makeEvent({ event_type: 'death' }),
        person_given_name: 'Maja',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    expect(mother.primary).toBe('Förälders död — Maja Andersson');
  });
});

describe('composeTimelineLabel — partner death', () => {
  it('labels spouse death as partner death', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'spouse',
        event: makeEvent({ event_type: 'death' }),
        person_given_name: 'Anna',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    expect(result.primary).toBe('Partners död — Anna Andersson');
  });
});

describe('composeTimelineLabel — sibling', () => {
  it('labels sibling death', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'sibling',
        event: makeEvent({ event_type: 'death' }),
        person_given_name: 'Per',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    expect(result.primary).toBe('Syskons död — Per Andersson');
  });
});

describe('composeTimelineLabel — foster relationships', () => {
  it('labels foster_placement event as fosterChildWelcomed', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'foster_son',
        event: makeEvent({ event_type: 'foster_placement' }),
        person_given_name: 'Erik',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    expect(result.primary).toBe('Fosterbarn välkomnas — Erik Andersson');
  });

  it('labels foster parent death (focal is foster child)', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'foster_father',
        event: makeEvent({ event_type: 'death' }),
        person_given_name: 'Olof',
        person_surname: 'Persson',
      }),
      tSv,
    );
    expect(result.primary).toBe('Fosterförälders död — Olof Persson');
  });

  it('labels foster child death (focal is foster parent)', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'foster_daughter',
        event: makeEvent({ event_type: 'death' }),
        person_given_name: 'Lisa',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    expect(result.primary).toBe('Fosterbarns död — Lisa Andersson');
  });
});

describe('composeTimelineLabel — step relationships', () => {
  it('labels step_placement as stepChildWelcomed', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'step_son',
        event: makeEvent({ event_type: 'foster_placement' }),
        person_given_name: 'Erik',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    expect(result.primary).toBe('Styvbarn välkomnas — Erik Andersson');
  });

  it('labels step parent death', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'step_mother',
        event: makeEvent({ event_type: 'death' }),
        person_given_name: 'Maja',
        person_surname: 'Persson',
      }),
      tSv,
    );
    expect(result.primary).toBe('Styvförälders död — Maja Persson');
  });
});

describe('composeTimelineLabel — fallback for unusual roles', () => {
  it('uses kinFallback for non-canonical role+event combinations', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'sibling',
        event: makeEvent({ event_type: 'birth' }),
        person_given_name: 'Per',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    // Sibling birth is not in the canonical table, so falls back to
    // "<role>: <type> — <name>".
    expect(result.primary).toBe('syskon: Födelse — Per Andersson');
  });
});

describe('composeTimelineLabel — English locale parity', () => {
  it('renders English son birth', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'son',
        event: makeEvent({ event_type: 'birth' }),
        person_given_name: 'Erik',
        person_surname: 'Andersson',
      }),
      tEn,
    );
    expect(result.primary).toBe("Son's birth — Erik Andersson");
  });

  it('renders English partner death', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'spouse',
        event: makeEvent({ event_type: 'death' }),
        person_given_name: 'Anna',
        person_surname: 'Andersson',
      }),
      tEn,
    );
    expect(result.primary).toBe("Partner's death — Anna Andersson");
  });

  it('renders English foster child welcomed', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'foster_child',
        event: makeEvent({ event_type: 'foster_placement' }),
        person_given_name: 'Erik',
        person_surname: 'Andersson',
      }),
      tEn,
    );
    expect(result.primary).toBe('Foster child welcomed — Erik Andersson');
  });

  it('renders English couple event with partner', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'self',
        event: makeEvent({ event_type: 'marriage' }),
        partner: {
          person_id: 'p2',
          given_name: 'Anna',
          surname: 'Andersson',
          birth_surname: null,
        },
      }),
      tEn,
    );
    expect(result.primary).toBe('Marriage — Anna Andersson');
  });
});

describe('composeTimelineLabel — birth-name parenthetical', () => {
  it('appends birth surname when toggle is on', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'son',
        event: makeEvent({ event_type: 'birth' }),
        person_given_name: 'Erik',
        person_surname: 'Andersson',
        person_birth_surname: 'Lindberg',
      }),
      tSv,
      { showBirthNameParenthetical: true },
    );
    expect(result.primary).toBe('Sons födelse — Erik Andersson (f. Lindberg)');
  });

  it('omits birth surname when toggle is off', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'son',
        event: makeEvent({ event_type: 'birth' }),
        person_given_name: 'Erik',
        person_surname: 'Andersson',
        person_birth_surname: 'Lindberg',
      }),
      tSv,
      { showBirthNameParenthetical: false },
    );
    expect(result.primary).toBe('Sons födelse — Erik Andersson');
  });
});

describe('composeTimelineLabel — ARIA full-sentence form', () => {
  it('appends date and place when present', () => {
    const result = composeTimelineLabel(
      makeEntry({
        relationship_label: 'son',
        event: makeEvent({
          event_type: 'birth',
          date_value: '1972-04-01',
          date_original: '1972-04-01',
          place_name: 'Stockholm',
        }),
        person_given_name: 'Erik',
        person_surname: 'Andersson',
      }),
      tSv,
    );
    expect(result.aria).toContain('Sons födelse — Erik Andersson');
    expect(result.aria).toContain('1972-04-01');
    expect(result.aria).toContain('Stockholm');
  });
});
