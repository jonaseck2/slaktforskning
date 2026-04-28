import * as repositories from '../../api/repositories';
import { defineChannel } from './registry';

defineChannel({
  name: 'repositories:list',
  thread: 'worker',
  handler: (db) => repositories.listRepositories(db),
});

defineChannel({
  name: 'repositories:get',
  thread: 'worker',
  handler: (db, id: string) => repositories.getRepository(db, id),
});

defineChannel({
  name: 'repositories:create',
  thread: 'worker',
  mutating: true,
  handler: (db, data: Parameters<typeof repositories.createRepository>[1]) =>
    repositories.createRepository(db, data),
});

defineChannel({
  name: 'repositories:update',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string, data: Parameters<typeof repositories.updateRepository>[2]) =>
    repositories.updateRepository(db, id, data),
});

defineChannel({
  name: 'repositories:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => repositories.deleteRepository(db, id),
});

defineChannel({
  name: 'repositories:forSource',
  thread: 'worker',
  handler: (db, sourceId: string) => repositories.getRepositoriesForSource(db, sourceId),
});

defineChannel({
  name: 'repositories:linkSource',
  thread: 'worker',
  mutating: true,
  handler: (db, sourceId: string, repoId: string) =>
    repositories.linkSourceRepository(db, sourceId, repoId),
});

defineChannel({
  name: 'repositories:unlinkSource',
  thread: 'worker',
  mutating: true,
  handler: (db, sourceId: string, repoId: string) =>
    repositories.unlinkSourceRepository(db, sourceId, repoId),
});
