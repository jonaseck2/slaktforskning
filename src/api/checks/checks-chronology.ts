import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';
import { loadPersonEvents, dateDefinitelyAfter, personIdsWithEvent, TODAY, extractYear, parseLooseDate } from './check-utils';

const TODAY_PARSED = parseLooseDate(TODAY)!;
function dateInFuture(s: string): boolean {
  return dateDefinitelyAfter(s, TODAY);
}

export async function checkBirthAfterDeath(db: Database): Promise<CheckResult[]> {
  const births = await loadPersonEvents(db, 'birth');
  const deaths = await loadPersonEvents(db, 'death');
  const results: CheckResult[] = [];
  for (const [personId, deathList] of deaths) {
    for (const d of deathList) {
      for (const b of births.get(personId) ?? []) {
        if (dateDefinitelyAfter(b.date_value, d.date_value)) {
          results.push({
            code: 'BIRTH_AFTER_DEATH',
            severity: 'error',
            message: `Födelsedag (${b.date_value}) är efter dödsdatum (${d.date_value})`,
            messageParams: { birthDate: b.date_value, deathDate: d.date_value },
            personIds: [personId],
            eventIds: [b.event_id, d.event_id],
          });
        }
      }
    }
  }
  return results;
}

export async function checkEventAfterDeath(db: Database): Promise<CheckResult[]> {
  // Pre-filter on cheap shape (death + non-death event for same person), then
  // compare dates in JS via parseLooseDate so free-form date_value strings
  // ("26 Jan 1763" etc.) are handled correctly. The previous SUBSTR(0,4)
  // string compare assumed ISO and produced ~13 false EVENT_AFTER_DEATH hits
  // per session on the Bernadotte test database.
  const rows = await queryAll<{ person_id: string; event_id: string; event_type: string; event_date: string; death_id: string; death_date: string }>(db, `
    SELECT p.id AS person_id,
           e.id AS event_id, e.event_type, e.date_value AS event_date,
           d.id AS death_id, d.date_value AS death_date
    FROM persons p
    JOIN event_participants epd ON epd.person_id = p.id
    JOIN events d ON d.id = epd.event_id AND d.event_type = 'death'
      AND d.date_type IN ('exact','calculated') AND d.date_value IS NOT NULL
    JOIN event_participants epe ON epe.person_id = p.id
    JOIN events e ON e.id = epe.event_id
      AND e.event_type NOT IN ('death','burial','will','probate')
      AND e.date_type NOT IN ('unknown')
      AND e.date_value IS NOT NULL
  `);

  return rows
    .filter(r => dateDefinitelyAfter(r.event_date, r.death_date))
    .map(r => ({
      code: 'EVENT_AFTER_DEATH',
      severity: 'error' as CheckSeverity,
      message: `${r.event_type} (${r.event_date}) occurs after death date (${r.death_date})`,
      messageParams: { eventType: r.event_type, eventDate: r.event_date, deathDate: r.death_date },
      personIds: [r.person_id],
      eventIds: [r.event_id, r.death_id],
    }));
}

export async function checkBurialBeforeDeath(db: Database): Promise<CheckResult[]> {
  const burials = await loadPersonEvents(db, 'burial');
  const deaths = await loadPersonEvents(db, 'death');
  const results: CheckResult[] = [];
  for (const [personId, burialList] of burials) {
    for (const b of burialList) {
      for (const d of deaths.get(personId) ?? []) {
        if (dateDefinitelyAfter(d.date_value, b.date_value)) {
          results.push({
            code: 'BURIAL_BEFORE_DEATH',
            severity: 'error',
            message: `Begravning (${b.date_value}) sker före dödsdatum (${d.date_value})`,
            messageParams: { burialDate: b.date_value, deathDate: d.date_value },
            personIds: [personId],
            eventIds: [b.event_id, d.event_id],
          });
        }
      }
    }
  }
  return results;
}

export async function checkLifespan(db: Database): Promise<CheckResult[]> {
  const births = await loadPersonEvents(db, 'birth');
  const deaths = await loadPersonEvents(db, 'death');
  const rows: { person_id: string; birth_year: number; death_year: number; birth_id: string; death_id: string }[] = [];
  for (const [personId, deathList] of deaths) {
    for (const d of deathList) {
      for (const b of births.get(personId) ?? []) {
        const birthYear = extractYear(b.date_value);
        const deathYear = extractYear(d.date_value);
        if (birthYear === null || deathYear === null) continue;
        if (deathYear - birthYear > 105) {
          rows.push({ person_id: personId, birth_year: birthYear, death_year: deathYear, birth_id: b.event_id, death_id: d.event_id });
        }
      }
    }
  }

  const results: CheckResult[] = [];
  for (const r of rows) {
    const span = r.death_year - r.birth_year;
    if (span > 120) {
      results.push({
        code: 'LIFESPAN_OVER_120',
        severity: 'warning',
        message: `Livsspan på ${span} år överstiger 120 år (född ${r.birth_year}, död ${r.death_year})`,
        messageParams: { span, birthYear: r.birth_year, deathYear: r.death_year },
        personIds: [r.person_id],
        eventIds: [r.birth_id, r.death_id],
      });
    } else {
      results.push({
        code: 'LIFESPAN_OVER_105',
        severity: 'notice',
        message: `Livsspan på ${span} år överstiger 105 år (född ${r.birth_year}, död ${r.death_year})`,
        messageParams: { span, birthYear: r.birth_year, deathYear: r.death_year },
        personIds: [r.person_id],
        eventIds: [r.birth_id, r.death_id],
      });
    }
  }
  return results;
}

export async function checkFutureDates(db: Database): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Filter all candidate births/deaths in JS via dateDefinitelyAfter so
  // free-form date_value strings ("26 Jan 1763") aren't compared
  // lexicographically against TODAY (which would silently flag historical
  // dates as "future" because '2' > '1' in ASCII). Keeps the SQL filter
  // narrow and lets parseLooseDate do the actual chronological compare.
  const births = await queryAll<{ person_id: string; event_id: string; date_value: string }>(db, `
    SELECT p.id AS person_id, e.id AS event_id, e.date_value
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'birth'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
  `);

  for (const r of births) {
    if (!dateInFuture(r.date_value)) continue;
    results.push({
      code: 'FUTURE_BIRTH',
      severity: 'error',
      message: `Födelsedag (${r.date_value}) är i framtiden`,
      messageParams: { date: r.date_value },
      personIds: [r.person_id],
      eventIds: [r.event_id],
    });
  }

  const deaths = await queryAll<{ person_id: string; event_id: string; date_value: string }>(db, `
    SELECT p.id AS person_id, e.id AS event_id, e.date_value
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
  `);

  for (const r of deaths) {
    if (!dateInFuture(r.date_value)) continue;
    results.push({
      code: 'FUTURE_DEATH',
      severity: 'error',
      message: `Dödsdatum (${r.date_value}) är i framtiden`,
      messageParams: { date: r.date_value },
      personIds: [r.person_id],
      eventIds: [r.event_id],
    });
  }

  return results;
}

export async function checkBaptismLate(db: Database): Promise<CheckResult[]> {
  const rows = await queryAll<{ person_id: string; baptism_id: string; bap_year: number; birth_id: string; birth_year: number }>(db, `
    SELECT p.id AS person_id,
           bap.id AS baptism_id, CAST(SUBSTR(bap.date_value, 1, 4) AS INTEGER) AS bap_year,
           b.id AS birth_id, CAST(SUBSTR(b.date_value, 1, 4) AS INTEGER) AS birth_year
    FROM persons p
    JOIN event_participants epbap ON epbap.person_id = p.id
    JOIN events bap ON bap.id = epbap.event_id AND bap.event_type = 'christening'
      AND bap.date_type NOT IN ('unknown') AND bap.date_value IS NOT NULL
    JOIN event_participants epb ON epb.person_id = p.id
    JOIN events b ON b.id = epb.event_id AND b.event_type = 'birth'
      AND b.date_type NOT IN ('unknown') AND b.date_value IS NOT NULL
    WHERE CAST(SUBSTR(bap.date_value, 1, 4) AS INTEGER) > CAST(SUBSTR(b.date_value, 1, 4) AS INTEGER) + 10
  `);

  return rows.map(r => ({
    code: 'BAPTISM_LATE',
    severity: 'notice' as CheckSeverity,
    message: `Dop (${r.bap_year}) sker mer än 10 år efter födseln (${r.birth_year})`,
    messageParams: { baptismYear: r.bap_year, birthYear: r.birth_year },
    personIds: [r.person_id],
    eventIds: [r.baptism_id, r.birth_id],
  }));
}

export async function checkDeathWithoutBirth(db: Database): Promise<CheckResult[]> {
  const hasBirth = await personIdsWithEvent(db, 'birth');
  const deathRows = await queryAll<{ person_id: string; event_id: string }>(db, `
    SELECT ep.person_id, e.id AS event_id
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
  `);
  return deathRows
    .filter(r => !hasBirth.has(r.person_id))
    .map(r => ({
      code: 'DEATH_WITHOUT_BIRTH',
      severity: 'notice' as CheckSeverity,
      message: `Person har dödshändelse men saknar födelsehändelse`,
      messageParams: {},
      personIds: [r.person_id],
      eventIds: [r.event_id],
    }));
}

export async function checkNoBirthEvent(db: Database): Promise<CheckResult[]> {
  const hasBirth = await personIdsWithEvent(db, 'birth');
  const allPersonIds = await queryAll<{ id: string }>(db, `SELECT id FROM persons`);
  return allPersonIds
    .filter(r => !hasBirth.has(r.id))
    .map(r => ({
      code: 'NO_BIRTH_EVENT',
      severity: 'notice' as CheckSeverity,
      message: `Person saknar födelsehändelse`,
      messageParams: {},
      personIds: [r.id],
    }));
}
