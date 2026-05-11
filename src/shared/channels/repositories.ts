import * as repositories from '../../api/repositories';
import { defineChannel } from './registry';

defineChannel({
  name: 'repositories:list',
  thread: 'worker',
  handler: async (db) => await repositories.listRepositories(db),
});

defineChannel({
  name: 'repositories:get',
  thread: 'worker',
  handler: async (db, id: string) => await repositories.getRepository(db, id),
});

defineChannel({
  name: 'repositories:create',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof repositories.createRepository>[1]) =>
    await repositories.createRepository(db, data),
});

defineChannel({
  name: 'repositories:update',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string, data: Parameters<typeof repositories.updateRepository>[2]) =>
    await repositories.updateRepository(db, id, data),
});

defineChannel({
  name: 'repositories:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => await repositories.deleteRepository(db, id),
});

defineChannel({
  name: 'repositories:forSource',
  thread: 'worker',
  handler: async (db, sourceId: string) => await repositories.getRepositoriesForSource(db, sourceId),
});

defineChannel({
  name: 'repositories:linkSource',
  thread: 'worker',
  mutating: true,
  handler: async (db, sourceId: string, repoId: string) =>
    await repositories.linkSourceRepository(db, sourceId, repoId),
});

defineChannel({
  name: 'repositories:unlinkSource',
  thread: 'worker',
  mutating: true,
  handler: async (db, sourceId: string, repoId: string) =>
    await repositories.unlinkSourceRepository(db, sourceId, repoId),
});
