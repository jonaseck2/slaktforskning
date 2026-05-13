import type { AppDriver } from '../fixture';
import { mutateViaMcp } from './mutate-via-mcp';

export type HostKind =
  | 'person'
  | 'place'
  | 'source'
  | 'relationship'
  | 'group'
  | 'research-task'
  | 'media';

/**
 * Seed a single host entity via the running app's window.api.<domain>.create
 * (the auto-walked channel shape) and return its id + the panel route to
 * navigate to.
 *
 * Field shapes match the actual src/api/<domain>.ts createX signatures —
 * NOT the spec's plan-stub guesses. See `.claude/rules/api.md` for the
 * domain-type table; concrete field names verified against:
 *   - persons.ts:84  (given_name + surname + sex: 'M'|'F'|'U')
 *   - places.ts:105  (place_type, not 'type')
 *   - relationships.ts:7  (person1_id / person2_id, not _a / _b)
 *   - research_tasks.ts:6  (task field, NOT NULL — schema.ts:181)
 *   - media.ts:18  (file_ref + title)
 *
 * Channel auto-walk: filename `research-tasks.ts` exposes channel
 * namespace `researchTasks:*` (camelCase). See src/shared/channels/.
 */
export async function seedHostEntity(
  driver: AppDriver,
  kind: HostKind,
): Promise<{ id: string; route: string }> {
  switch (kind) {
    case 'person': {
      const p = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'Test',
        surname: 'Person',
        sex: 'U',
      });
      return { id: p.id, route: `/persons/${p.id}` };
    }
    case 'place': {
      const p = await mutateViaMcp<{ id: string }>(driver, 'places.create', {
        name: 'Testplace',
        place_type: 'city',
      });
      return { id: p.id, route: `/places/${p.id}` };
    }
    case 'source': {
      const s = await mutateViaMcp<{ id: string }>(driver, 'sources.create', {
        title: 'Test Source',
      });
      return { id: s.id, route: `/sources/${s.id}` };
    }
    case 'relationship': {
      const a = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'A',
        surname: 'Test',
        sex: 'U',
      });
      const b = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        given_name: 'B',
        surname: 'Test',
        sex: 'U',
      });
      const r = await mutateViaMcp<{ id: string }>(driver, 'relationships.create', {
        person1_id: a.id,
        person2_id: b.id,
        type: 'couple',
      });
      // Relationships have no top-level route — /relationships/:id redirects
      // to /persons via the per-person Relations section convention. Route
      // to person A so panel-surface specs find the relationship there.
      return { id: r.id, route: `/persons/${a.id}` };
    }
    case 'group': {
      const g = await mutateViaMcp<{ id: string }>(driver, 'groups.create', {
        name: 'Test Group',
      });
      return { id: g.id, route: `/groups/${g.id}` };
    }
    case 'research-task': {
      const t = await mutateViaMcp<{ id: string }>(driver, 'researchTasks.create', {
        task: 'Test research task',
      });
      return { id: t.id, route: `/research-tasks/${t.id}` };
    }
    case 'media': {
      const m = await mutateViaMcp<{ id: string }>(driver, 'media.create', {
        file_ref: 'tests/e2e/fixtures/imports/pixel.png',
        title: 'Test Media',
      });
      return { id: m.id, route: `/media/${m.id}` };
    }
  }
}
