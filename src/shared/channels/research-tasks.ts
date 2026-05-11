import * as researchTasks from '../../api/research_tasks';
import { defineChannel } from './registry';

defineChannel({
  name: 'researchTasks:list',
  thread: 'worker',
  handler: async (db) => await researchTasks.listResearchTasks(db),
});

defineChannel({
  name: 'researchTasks:get',
  thread: 'worker',
  handler: async (db, id: string) => await researchTasks.getResearchTask(db, id),
});

defineChannel({
  name: 'researchTasks:forPerson',
  thread: 'worker',
  handler: async (db, personId: string) => await researchTasks.getResearchTasksForPerson(db, personId),
});

defineChannel({
  name: 'researchTasks:forPlace',
  thread: 'worker',
  handler: async (db, placeId: string) => await researchTasks.getResearchTasksForPlace(db, placeId),
});

defineChannel({
  name: 'researchTasks:forMedia',
  thread: 'worker',
  handler: async (db, mediaId: string) => await researchTasks.getResearchTasksForMedia(db, mediaId),
});

defineChannel({
  name: 'researchTasks:create',
  thread: 'worker',
  mutating: true,
  handler: async (db, data: Parameters<typeof researchTasks.createResearchTask>[1]) =>
    await researchTasks.createResearchTask(db, data),
});

defineChannel({
  name: 'researchTasks:update',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string, data: Parameters<typeof researchTasks.updateResearchTask>[2]) =>
    await researchTasks.updateResearchTask(db, id, data),
});

defineChannel({
  name: 'researchTasks:delete',
  thread: 'worker',
  mutating: true,
  handler: async (db, id: string) => await researchTasks.deleteResearchTask(db, id),
});

defineChannel({
  name: 'researchTasks:addLink',
  thread: 'worker',
  mutating: true,
  handler: async (db, taskId: string, entityType: Parameters<typeof researchTasks.addTaskLink>[2], entityId: string) =>
    await researchTasks.addTaskLink(db, taskId, entityType, entityId),
});

defineChannel({
  name: 'researchTasks:removeLink',
  thread: 'worker',
  mutating: true,
  handler: async (db, linkId: string) => await researchTasks.removeTaskLink(db, linkId),
});

defineChannel({
  name: 'researchTasks:getLinks',
  thread: 'worker',
  handler: async (db, taskId: string) => await researchTasks.getTaskLinks(db, taskId),
});
