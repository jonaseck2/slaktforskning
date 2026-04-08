import type { Database } from 'node-sqlite3-wasm';
import { v4 as uuid } from 'uuid';
import type { Assertion, AssertionSubjectType, ConflictGroup } from './types';
import { queryOne, queryAll, runSql, runSqlChanges } from './db';

export function createAssertion(
  db: Database,
  data: {
    citation_id: string;
    subject_type: AssertionSubjectType;
    subject_id: string;
    attribute: string;
    value?: string;
    value_original?: string;
    confidence?: number;
    is_accepted?: boolean;
    evidence_type?: string | null;
    notes?: string;
  }
): Assertion {
  const id = uuid();
  runSql(db, `
    INSERT INTO assertions (id, citation_id, subject_type, subject_id, attribute, value, value_original, confidence, is_accepted, evidence_type, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, data.citation_id, data.subject_type, data.subject_id, data.attribute,
    data.value ?? '', data.value_original ?? '', data.confidence ?? 0,
    data.is_accepted ? 1 : 0, data.evidence_type ?? null, data.notes ?? '',
  ]);
  return getAssertion(db, id)!;
}

export function getAssertion(db: Database, id: string): Assertion | null {
  const row = queryOne<Assertion & { is_accepted: number }>(db, `SELECT * FROM assertions WHERE id = ?`, [id]);
  return row ? { ...row, is_accepted: !!row.is_accepted } : null;
}

export function listAssertions(db: Database): Assertion[] {
  const rows = queryAll<Assertion & { is_accepted: number }>(db, `
    SELECT * FROM assertions ORDER BY subject_type, subject_id, attribute, created_at
  `);
  return rows.map(r => ({ ...r, is_accepted: !!r.is_accepted }));
}

export function getAssertionsForSubject(db: Database, subjectType: string, subjectId: string): Assertion[] {
  const rows = queryAll<Assertion & { is_accepted: number }>(db, `
    SELECT * FROM assertions WHERE subject_type = ? AND subject_id = ? ORDER BY attribute, created_at
  `, [subjectType, subjectId]);
  return rows.map(r => ({ ...r, is_accepted: !!r.is_accepted }));
}

export function getAssertionsForAttribute(db: Database, subjectType: string, subjectId: string, attribute: string): Assertion[] {
  const rows = queryAll<Assertion & { is_accepted: number }>(db, `
    SELECT * FROM assertions WHERE subject_type = ? AND subject_id = ? AND attribute = ? ORDER BY created_at
  `, [subjectType, subjectId, attribute]);
  return rows.map(r => ({ ...r, is_accepted: !!r.is_accepted }));
}

export function getAssertionsForCitation(db: Database, citationId: string): Assertion[] {
  const rows = queryAll<Assertion & { is_accepted: number }>(db, `
    SELECT * FROM assertions WHERE citation_id = ? ORDER BY subject_type, attribute, created_at
  `, [citationId]);
  return rows.map(r => ({ ...r, is_accepted: !!r.is_accepted }));
}

export function updateAssertion(
  db: Database,
  id: string,
  updates: Partial<Pick<Assertion, 'value' | 'value_original' | 'confidence' | 'is_accepted' | 'evidence_type' | 'notes' | 'attribute'>>
): Assertion | null {
  const allowed = ['value', 'value_original', 'confidence', 'is_accepted', 'evidence_type', 'notes', 'attribute'] as const;
  const fields = allowed.filter(k => k in updates);
  if (fields.length === 0) return getAssertion(db, id);
  const setClauses = fields.map(f => `${f} = ?`).join(', ');
  const vals = fields.map(f => {
    const v = (updates as Record<string, unknown>)[f];
    if (f === 'is_accepted') return v ? 1 : 0;
    return v ?? null;
  });
  runSql(db, `UPDATE assertions SET ${setClauses} WHERE id = ?`, [...vals, id]);
  return getAssertion(db, id);
}

export function deleteAssertion(db: Database, id: string): boolean {
  return runSqlChanges(db, `DELETE FROM assertions WHERE id = ?`, [id]) > 0;
}

export function getConflicts(db: Database): ConflictGroup[] {
  // Find (subject_type, subject_id, attribute) groups with 2+ distinct values
  const groups = queryAll<{ subject_type: AssertionSubjectType; subject_id: string; attribute: string }>(db, `
    SELECT subject_type, subject_id, attribute
    FROM assertions
    WHERE attribute != ''
    GROUP BY subject_type, subject_id, attribute
    HAVING COUNT(DISTINCT value) > 1
  `);

  return groups.map(g => {
    const assertions = getAssertionsForAttribute(db, g.subject_type, g.subject_id, g.attribute);
    return { ...g, assertions };
  });
}

export interface ProofSummaryItem {
  attribute: string;
  accepted_value: string;
  value_original: string;
  source_title: string;
  citation_page: string;
  confidence: number;
  evidence_type: string | null;
  notes: string;
}

export interface ProofSummary {
  person_id: string;
  items: ProofSummaryItem[];
  conflicts: ConflictGroup[];
}

export function generateProofSummary(db: Database, personId: string): ProofSummary {
  // Get all accepted assertions about this person and their events
  const personAssertions = queryAll<Assertion & { is_accepted: number }>(db, `
    SELECT a.* FROM assertions a
    WHERE a.subject_type = 'person' AND a.subject_id = ? AND a.is_accepted = 1
    ORDER BY a.attribute, a.created_at
  `, [personId]).map(r => ({ ...r, is_accepted: !!r.is_accepted }));

  // Get event assertions for events this person participates in
  const eventAssertions = queryAll<Assertion & { is_accepted: number }>(db, `
    SELECT a.* FROM assertions a
    JOIN event_participants ep ON ep.event_id = a.subject_id AND a.subject_type = 'event'
    WHERE ep.person_id = ? AND a.is_accepted = 1
    ORDER BY a.attribute, a.created_at
  `, [personId]).map(r => ({ ...r, is_accepted: !!r.is_accepted }));

  const allAccepted = [...personAssertions, ...eventAssertions];

  // Resolve source info for each assertion
  const items: ProofSummaryItem[] = [];
  for (const a of allAccepted) {
    const citRow = queryOne<{ source_id: string; page: string }>(db, `
      SELECT source_id, page FROM citations WHERE id = ?
    `, [a.citation_id]);
    let sourceTitle = '';
    if (citRow) {
      const src = queryOne<{ title: string }>(db, `SELECT title FROM sources WHERE id = ?`, [citRow.source_id]);
      sourceTitle = src?.title ?? '';
    }
    items.push({
      attribute: a.attribute,
      accepted_value: a.value,
      value_original: a.value_original,
      source_title: sourceTitle,
      citation_page: citRow?.page ?? '',
      confidence: a.confidence,
      evidence_type: a.evidence_type,
      notes: a.notes,
    });
  }

  const conflicts = getConflictsForPerson(db, personId);

  return { person_id: personId, items, conflicts };
}

export function getConflictsForPerson(db: Database, personId: string): ConflictGroup[] {
  // Conflicts on person-level assertions
  const personConflicts = getConflicts(db).filter(
    c => c.subject_type === 'person' && c.subject_id === personId
  );

  // Conflicts on events this person participates in
  const eventIds = queryAll<{ event_id: string }>(db, `
    SELECT event_id FROM event_participants WHERE person_id = ?
  `, [personId]).map(r => r.event_id);

  if (eventIds.length > 0) {
    const placeholders = eventIds.map(() => '?').join(', ');
    const eventGroups = queryAll<{ subject_type: AssertionSubjectType; subject_id: string; attribute: string }>(db, `
      SELECT subject_type, subject_id, attribute
      FROM assertions
      WHERE subject_type = 'event' AND subject_id IN (${placeholders}) AND attribute != ''
      GROUP BY subject_type, subject_id, attribute
      HAVING COUNT(DISTINCT value) > 1
    `, eventIds);

    for (const g of eventGroups) {
      const assertions = getAssertionsForAttribute(db, g.subject_type, g.subject_id, g.attribute);
      personConflicts.push({ ...g, assertions });
    }
  }

  return personConflicts;
}
