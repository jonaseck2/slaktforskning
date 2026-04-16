import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Database } from 'node-sqlite3-wasm';
import * as groupApi from '../../../api/groups';
import * as personApi from '../../../api/persons';
import * as relationshipApi from '../../../api/relationships';
import * as eventApi from '../../../api/events';
import { _createPersonCore } from '../prod/persons';
import type { ToolContext } from '../prod/types';

const MALE_NAMES = ['Erik', 'Johan', 'Karl', 'Anders', 'Per', 'Nils', 'Lars', 'Olof', 'Sven', 'Gustaf'];
const FEMALE_NAMES = ['Anna', 'Maria', 'Karin', 'Margareta', 'Elisabet', 'Kristina', 'Ingrid', 'Britta', 'Eva', 'Maja'];
const SURNAMES = ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Pettersson'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getOrCreateTestGroup(db: Database): string {
  const groups = groupApi.listGroups(db);
  const existing = groups.find(g => g.name === '__test__');
  if (existing) return existing.id;
  const group = groupApi.createGroup(db, { name: '__test__', notes: 'Test data — safe to delete' });
  return group.id;
}

function createSeededPerson(
  db: Database,
  groupId: string,
  opts: { given_name?: string; surname?: string; sex?: 'M' | 'F' | 'U'; birth_date?: string; birth_place?: string }
): string {
  const sex = opts.sex ?? (Math.random() > 0.5 ? 'M' : 'F');
  const given_name = opts.given_name ?? (sex === 'M' ? pick(MALE_NAMES) : pick(FEMALE_NAMES));
  const surname = opts.surname ?? pick(SURNAMES);

  const { person } = _createPersonCore(db, {
    given_name,
    surname,
    sex: sex as 'M' | 'F' | 'U',
    birth_date: opts.birth_date,
    birth_place: opts.birth_place,
  });

  groupApi.addGroupMember(db, groupId, person.id);
  return person.id;
}

export interface SeedFamilyArgs {
  generations?: number;
  children_per_family?: number;
  include_events?: boolean;
}

export interface SeedFamilyResult {
  focal_person_id: string;
  person_ids: string[];
}

export function seedFamilyWorkflow(db: Database, args: SeedFamilyArgs = {}): SeedFamilyResult {
  const generations = args.generations ?? 2;
  const childrenPerFamily = args.children_per_family ?? 2;
  const includeEvents = args.include_events !== false;

  const groupId = getOrCreateTestGroup(db);
  const personIds: string[] = [];

  function createCouple(husbandId: string, wifeId: string): void {
    const rel = relationshipApi.createRelationship(db, {
      type: 'couple',
      person1_id: husbandId,
      person2_id: wifeId,
      subtype: 'marriage',
    });
    if (includeEvents) {
      const marriageEvent = eventApi.createEvent(db, {
        event_type: 'marriage',
        date_original: String(1850 + Math.floor(Math.random() * 100)),
        date_type: 'exact',
        date_value: String(1850 + Math.floor(Math.random() * 100)),
        relationship_id: rel.id,
      });
      relationshipApi.addEventParticipant(db, { event_id: marriageEvent.id, person_id: husbandId, role: 'primary' });
      relationshipApi.addEventParticipant(db, { event_id: marriageEvent.id, person_id: wifeId, role: 'spouse' });
    }
  }

  function linkParentChild(parentId: string, childId: string): void {
    relationshipApi.createRelationship(db, {
      type: 'parent_child',
      person1_id: parentId,
      person2_id: childId,
      subtype: 'biological',
    });
  }

  // Create focal person
  const focalYear = 1970 + Math.floor(Math.random() * 20);
  const focalId = createSeededPerson(db, groupId, {
    sex: 'M',
    birth_date: String(focalYear),
    birth_place: includeEvents ? 'Stockholm' : undefined,
  });
  personIds.push(focalId);

  // Add spouse for focal
  const focalSpouseId = createSeededPerson(db, groupId, { sex: 'F', birth_date: String(focalYear - 2) });
  personIds.push(focalSpouseId);
  createCouple(focalId, focalSpouseId);

  // Add children
  for (let i = 0; i < childrenPerFamily; i++) {
    const childSex = Math.random() > 0.5 ? 'M' : 'F';
    const childId = createSeededPerson(db, groupId, {
      sex: childSex as 'M' | 'F',
      birth_date: String(focalYear + 25 + i),
    });
    personIds.push(childId);
    linkParentChild(focalId, childId);
    linkParentChild(focalSpouseId, childId);
  }

  if (generations >= 2) {
    const fatherYear = focalYear - 30;
    const fatherId = createSeededPerson(db, groupId, { sex: 'M', birth_date: String(fatherYear) });
    personIds.push(fatherId);
    const motherId = createSeededPerson(db, groupId, { sex: 'F', birth_date: String(fatherYear + 2) });
    personIds.push(motherId);
    createCouple(fatherId, motherId);
    linkParentChild(fatherId, focalId);
    linkParentChild(motherId, focalId);

    if (generations >= 3) {
      const gpYear = fatherYear - 30;

      // Paternal grandparents
      const pfatherId = createSeededPerson(db, groupId, { sex: 'M', birth_date: String(gpYear) });
      personIds.push(pfatherId);
      const pmotherId = createSeededPerson(db, groupId, { sex: 'F', birth_date: String(gpYear + 2) });
      personIds.push(pmotherId);
      createCouple(pfatherId, pmotherId);
      linkParentChild(pfatherId, fatherId);
      linkParentChild(pmotherId, fatherId);

      // Maternal grandparents
      const mfatherId = createSeededPerson(db, groupId, { sex: 'M', birth_date: String(gpYear) });
      personIds.push(mfatherId);
      const mmotherId = createSeededPerson(db, groupId, { sex: 'F', birth_date: String(gpYear + 2) });
      personIds.push(mmotherId);
      createCouple(mfatherId, mmotherId);
      linkParentChild(mfatherId, motherId);
      linkParentChild(mmotherId, motherId);
    }
  }

  return { focal_person_id: focalId, person_ids: personIds };
}

export interface ClearTestDataResult {
  deleted_count: number;
}

export function clearTestData(db: Database): ClearTestDataResult {
  const groups = groupApi.listGroups(db);
  const testGroup = groups.find(g => g.name === '__test__');
  if (!testGroup) return { deleted_count: 0 };

  const members = groupApi.getGroupMembers(db, testGroup.id);
  let deleted_count = 0;
  for (const member of members) {
    personApi.deletePerson(db, member.person_id);
    deleted_count++;
  }
  groupApi.deleteGroup(db, testGroup.id);
  return { deleted_count };
}

export function registerSeedTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.tool(
    'seed_person',
    'Create a test person added to the __test__ group. If no name is given, generates a random Swedish name.',
    {
      given_name: z.string().optional().describe('Given name (random Swedish name if omitted)'),
      surname: z.string().optional().describe('Surname (random Swedish surname if omitted)'),
      sex: z.enum(['M', 'F', 'U']).optional().describe('Sex'),
      birth_date: z.string().optional().describe('Birth date (free text)'),
      birth_place: z.string().optional().describe('Birth place name'),
    },
    async ({ given_name, surname, sex, birth_date, birth_place }) => {
      const db = getDb();
      db.exec('BEGIN');
      try {
        const groupId = getOrCreateTestGroup(db);
        const personId = createSeededPerson(db, groupId, { given_name, surname, sex, birth_date, birth_place });
        db.exec('COMMIT');
        const person = personApi.getPerson(db, personId);
        const names = personApi.getPersonNames(db, personId);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ person, names }, null, 2) }] };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  );

  server.tool(
    'seed_family',
    'Create a test family tree with focal person, spouse, children, parents, and optionally grandparents. All persons added to the __test__ group.',
    {
      generations: z.number().optional().describe('Number of generations (1=focal+spouse+children, 2=adds parents, 3=adds grandparents; default: 2)'),
      children_per_family: z.number().optional().describe('Number of children for the focal person (default: 2)'),
      include_events: z.boolean().optional().describe('Whether to create birth and marriage events (default: true)'),
    },
    async ({ generations, children_per_family, include_events }) => {
      const db = getDb();
      db.exec('BEGIN');
      try {
        const result = seedFamilyWorkflow(db, { generations, children_per_family, include_events });
        db.exec('COMMIT');
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  );

  server.tool(
    'clear_test_data',
    'Delete all persons in the __test__ group and the group itself. Cascade deletes all their associated data.',
    {},
    async () => {
      const db = getDb();
      db.exec('BEGIN');
      try {
        const result = clearTestData(db);
        db.exec('COMMIT');
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  );
}
