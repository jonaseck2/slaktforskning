import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';
import { loadPersonEvents, dateDefinitelyAfter, personIdsWithEvent, TODAY } from './check-utils';

export function checkBirthAfterDeath(db: Database): CheckResult[] {
  const births = loadPersonEvents(db, 'birth');
  const deaths = loadPersonEvents(db, 'death');
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

export function checkEventAfterDeath(db: Database): CheckResult[] {
  const rows = queryAll<{ person_id: string; event_id: string; event_type: string; event_date: string; death_id: string; death_date: string }>(db, `
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
      AND (SUBSTR(e.date_value, 1, 4) > SUBSTR(d.date_value, 1, 4)
           OR (SUBSTR(e.date_value, 1, 4) = SUBSTR(d.date_value, 1, 4)
               AND LENGTH(e.date_value) >= 10 AND LENGTH(d.date_value) >= 10
               AND e.date_value > d.date_value))
  `);

  return rows.map(r => ({
    code: 'EVENT_AFTER_DEATH',
    severity: 'error' as CheckSeverity,
    message: `${r.event_type} (${r.event_date}) occurs after death date (${r.death_date})`,
    messageParams: { eventType: r.event_type, eventDate: r.event_date, deathDate: r.death_date },
    personIds: [r.person_id],
    eventIds: [r.event_id, r.death_id],
  }));
}

export function checkBurialBeforeDeath(db: Database): CheckResult[] {
  const burials = loadPersonEvents(db, 'burial');
  const deaths = loadPersonEvents(db, 'death');
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

export function checkLifespan(db: Database): CheckResult[] {
  const births = loadPersonEvents(db, 'birth');
  const deaths = loadPersonEvents(db, 'death');
  const rows: { person_id: string; birth_year: number; death_year: number; birth_id: string; death_id: string }[] = [];
  for (const [personId, deathList] of deaths) {
    for (const d of deathList) {
      for (const b of births.get(personId) ?? []) {
        const birthYear = parseInt(b.date_value.substring(0, 4), 10);
        const deathYear = parseInt(d.date_value.substring(0, 4), 10);
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

export function checkFutureDates(db: Database): CheckResult[] {
  const results: CheckResult[] = [];

  const births = queryAll<{ person_id: string; event_id: string; date_value: string }>(db, `
    SELECT p.id AS person_id, e.id AS event_id, e.date_value
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'birth'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
      AND e.date_value > ?
  `, [TODAY]);

  for (const r of births) {
    results.push({
      code: 'FUTURE_BIRTH',
      severity: 'error',
      message: `Födelsedag (${r.date_value}) är i framtiden`,
      messageParams: { date: r.date_value },
      personIds: [r.person_id],
      eventIds: [r.event_id],
    });
  }

  const deaths = queryAll<{ person_id: string; event_id: string; date_value: string }>(db, `
    SELECT p.id AS person_id, e.id AS event_id, e.date_value
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id AND e.event_type = 'death'
      AND e.date_type IN ('exact','calculated') AND e.date_value IS NOT NULL
      AND e.date_value > ?
  `, [TODAY]);

  for (const r of deaths) {
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

export function checkBaptismLate(db: Database): CheckResult[] {
  const rows = queryAll<{ person_id: string; baptism_id: string; bap_year: number; birth_id: string; birth_year: number }>(db, `
    SELECT p.id AS person_id,
           bap.id AS baptism_id, CAST(SUBSTR(bap.date_value, 1, 4) AS INTEGER) AS bap_year,
           b.id AS birth_id, CAST(SUBSTR(b.date_value, 1, 4) AS INTEGER) AS birth_year
    FROM persons p
    JOIN event_participants epbap ON epbap.person_id = p.id
    JOIN events bap ON bap.id = epbap.event_id AND bap.event_type = 'baptism'
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

export function checkDeathWithoutBirth(db: Database): CheckResult[] {
  const hasBirth = personIdsWithEvent(db, 'birth');
  const deathRows = queryAll<{ person_id: string; event_id: string }>(db, `
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

export function checkNoBirthEvent(db: Database): CheckResult[] {
  const hasBirth = personIdsWithEvent(db, 'birth');
  const allPersonIds = queryAll<{ id: string }>(db, `SELECT id FROM persons`);
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
