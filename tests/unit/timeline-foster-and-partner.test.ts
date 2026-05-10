/**
 * Tests for the foster/step parent_child timeline filter and the partner
 * payload on self couple events. Both ship as part of the
 * timeline-kin-event-labelling plan — they are the data-side guarantees
 * the renderer composer relies on.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { getTimeline } from '../../src/api/report_data';
import { createTestDb } from './helpers';

let db: any;

beforeEach(() => {
  db = createTestDb();
});

describe('getTimeline — foster/step subtype filter', () => {
  it('drops the biological birth event for a foster child', () => {
    const fosterParent = createPerson(db, { given_name: 'Olof', surname: 'Persson', sex: 'M' });
    const fosterChild = createPerson(db, { given_name: 'Erik', surname: 'Lindberg', sex: 'M' });

    // Foster parent's own birth (so the focal has a birth year and the
    // lifetime constraint passes).
    const parentBirth = createEvent(db, { event_type: 'birth', date_original: '1900-01-01' });
    addEventParticipant(db, { event_id: parentBirth.id, person_id: fosterParent.id });

    // Foster child's biological birth — must NOT appear on the foster
    // parent's timeline.
    const childBirth = createEvent(db, { event_type: 'birth', date_original: '1925-04-10' });
    addEventParticipant(db, { event_id: childBirth.id, person_id: fosterChild.id });

    // Foster placement event tied to the relationship — the child's
    // arrival in the foster home. SHOULD appear.
    const placement = createEvent(db, { event_type: 'foster_placement', date_original: '1928-06-01' });
    addEventParticipant(db, { event_id: placement.id, person_id: fosterChild.id });

    createRelationship(db, {
      type: 'parent_child',
      person1_id: fosterParent.id,
      person2_id: fosterChild.id,
      subtype: 'foster',
    });

    const entries = getTimeline(db, fosterParent.id)!;
    const childBirthRows = entries.filter(e =>
      e.relationship_label !== 'self' && e.event.event_type === 'birth',
    );
    expect(childBirthRows).toHaveLength(0);

    const placementRows = entries.filter(e => e.event.event_type === 'foster_placement');
    expect(placementRows).toHaveLength(1);
    expect(placementRows[0].relationship_label).toBe('foster_son');
  });

  it('drops the biological birth event for a step child', () => {
    const stepParent = createPerson(db, { given_name: 'Maja', surname: 'Andersson', sex: 'F' });
    const stepChild = createPerson(db, { given_name: 'Lisa', surname: 'Persson', sex: 'F' });

    const parentBirth = createEvent(db, { event_type: 'birth', date_original: '1880-01-01' });
    addEventParticipant(db, { event_id: parentBirth.id, person_id: stepParent.id });

    const childBirth = createEvent(db, { event_type: 'birth', date_original: '1905-04-10' });
    addEventParticipant(db, { event_id: childBirth.id, person_id: stepChild.id });

    createRelationship(db, {
      type: 'parent_child',
      person1_id: stepParent.id,
      person2_id: stepChild.id,
      subtype: 'step',
    });

    const entries = getTimeline(db, stepParent.id)!;
    const childBirthRows = entries.filter(e =>
      e.relationship_label !== 'self' && e.event.event_type === 'birth',
    );
    expect(childBirthRows).toHaveLength(0);
  });

  it('keeps biological birth for a normal (biological) parent_child', () => {
    const parent = createPerson(db, { given_name: 'Per', surname: 'Andersson', sex: 'M' });
    const child = createPerson(db, { given_name: 'Erik', surname: 'Persson', sex: 'M' });

    const parentBirth = createEvent(db, { event_type: 'birth', date_original: '1900-01-01' });
    addEventParticipant(db, { event_id: parentBirth.id, person_id: parent.id });

    const childBirth = createEvent(db, { event_type: 'birth', date_original: '1925-04-10' });
    addEventParticipant(db, { event_id: childBirth.id, person_id: child.id });

    createRelationship(db, {
      type: 'parent_child',
      person1_id: parent.id,
      person2_id: child.id,
      subtype: 'biological',
    });

    const entries = getTimeline(db, parent.id)!;
    const childBirthRows = entries.filter(e =>
      e.relationship_label === 'son' && e.event.event_type === 'birth',
    );
    expect(childBirthRows).toHaveLength(1);
  });

  it('labels foster parent death from the child side', () => {
    const fosterParent = createPerson(db, { given_name: 'Olof', surname: 'Persson', sex: 'M' });
    const fosterChild = createPerson(db, { given_name: 'Erik', surname: 'Lindberg', sex: 'M' });

    const childBirth = createEvent(db, { event_type: 'birth', date_original: '1925-04-10' });
    addEventParticipant(db, { event_id: childBirth.id, person_id: fosterChild.id });

    const parentDeath = createEvent(db, { event_type: 'death', date_original: '1960-12-01' });
    addEventParticipant(db, { event_id: parentDeath.id, person_id: fosterParent.id });

    createRelationship(db, {
      type: 'parent_child',
      person1_id: fosterParent.id,
      person2_id: fosterChild.id,
      subtype: 'foster',
    });

    const entries = getTimeline(db, fosterChild.id)!;
    const fosterDeath = entries.find(e =>
      e.event.event_type === 'death' && e.relationship_label === 'foster_father',
    );
    expect(fosterDeath).toBeDefined();
  });

  it('labels step parent death from the child side', () => {
    const stepParent = createPerson(db, { given_name: 'Maja', surname: 'Andersson', sex: 'F' });
    const stepChild = createPerson(db, { given_name: 'Lisa', surname: 'Persson', sex: 'F' });

    const childBirth = createEvent(db, { event_type: 'birth', date_original: '1905-04-10' });
    addEventParticipant(db, { event_id: childBirth.id, person_id: stepChild.id });

    const parentDeath = createEvent(db, { event_type: 'death', date_original: '1940-12-01' });
    addEventParticipant(db, { event_id: parentDeath.id, person_id: stepParent.id });

    createRelationship(db, {
      type: 'parent_child',
      person1_id: stepParent.id,
      person2_id: stepChild.id,
      subtype: 'step',
    });

    const entries = getTimeline(db, stepChild.id)!;
    const stepDeath = entries.find(e =>
      e.event.event_type === 'death' && e.relationship_label === 'step_mother',
    );
    expect(stepDeath).toBeDefined();
  });
});

describe('getTimeline — partner payload on self couple events', () => {
  it('attaches partner data to a self marriage event', () => {
    const focal = createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    const partner = createPerson(db, { given_name: 'Anna', surname: 'Svensson', sex: 'F' });

    const focalBirth = createEvent(db, { event_type: 'birth', date_original: '1900-01-01' });
    addEventParticipant(db, { event_id: focalBirth.id, person_id: focal.id });

    const couple = createRelationship(db, {
      type: 'couple',
      person1_id: focal.id,
      person2_id: partner.id,
    });

    const marriage = createEvent(db, {
      event_type: 'marriage',
      relationship_id: couple.id,
      date_original: '1925-06-15',
    });
    addEventParticipant(db, { event_id: marriage.id, person_id: focal.id });
    addEventParticipant(db, { event_id: marriage.id, person_id: partner.id, role: 'spouse' });

    const entries = getTimeline(db, focal.id)!;
    const marriageEntry = entries.find(e =>
      e.event.event_type === 'marriage' && e.relationship_label === 'self',
    );
    expect(marriageEntry).toBeDefined();
    expect(marriageEntry!.partner).toBeDefined();
    expect(marriageEntry!.partner!.given_name).toBe('Anna');
    expect(marriageEntry!.partner!.surname).toBe('Svensson');
    expect(marriageEntry!.partner!.person_id).toBe(partner.id);
  });

  it('leaves partner null on a non-couple self event', () => {
    const focal = createPerson(db, { given_name: 'Erik', surname: 'Andersson', sex: 'M' });
    const birth = createEvent(db, { event_type: 'birth', date_original: '1900-01-01' });
    addEventParticipant(db, { event_id: birth.id, person_id: focal.id });

    const entries = getTimeline(db, focal.id)!;
    const birthEntry = entries.find(e => e.event.event_type === 'birth');
    expect(birthEntry).toBeDefined();
    expect(birthEntry!.partner ?? null).toBeNull();
  });
});
