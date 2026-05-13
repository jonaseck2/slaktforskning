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
 * The api signatures here match `src/shared/channels/*` — every entity exposes
 * a `<domain>:create` channel, surfaced as `window.api.<domain>.create(data)`
 * by the auto-walk in `src/renderer/tauri-window-api.ts`.
 */
export async function seedHostEntity(
  driver: AppDriver,
  kind: HostKind,
): Promise<{ id: string; route: string }> {
  switch (kind) {
    case 'person': {
      const p = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        primary_name: { given: 'Test', surname: 'Person' },
        sex: 'unknown',
      });
      return { id: p.id, route: `/persons/${p.id}` };
    }
    case 'place': {
      const p = await mutateViaMcp<{ id: string }>(driver, 'places.create', {
        name: 'Testplace',
        type: 'city',
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
        primary_name: { given: 'A' },
      });
      const b = await mutateViaMcp<{ id: string }>(driver, 'persons.create', {
        primary_name: { given: 'B' },
      });
      const r = await mutateViaMcp<{ id: string }>(driver, 'relationships.create', {
        person_a_id: a.id,
        person_b_id: b.id,
        type: 'couple',
      });
      return { id: r.id, route: `/relationships/${r.id}` };
    }
    case 'group': {
      const g = await mutateViaMcp<{ id: string }>(driver, 'groups.create', {
        name: 'Test Group',
      });
      return { id: g.id, route: `/groups/${g.id}` };
    }
    case 'research-task': {
      const t = await mutateViaMcp<{ id: string }>(driver, 'researchTasks.create', {
        title: 'Test Task',
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
