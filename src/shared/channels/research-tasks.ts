import * as researchTasks from '../../api/research_tasks';
import { defineChannel } from './registry';

defineChannel({
  name: 'researchTasks:list',
  thread: 'worker',
  handler: (db) => researchTasks.listResearchTasks(db),
});

defineChannel({
  name: 'researchTasks:get',
  thread: 'worker',
  handler: (db, id: string) => researchTasks.getResearchTask(db, id),
});

defineChannel({
  name: 'researchTasks:forPerson',
  thread: 'worker',
  handler: (db, personId: string) => researchTasks.getResearchTasksForPerson(db, personId),
});

defineChannel({
  name: 'researchTasks:forPlace',
  thread: 'worker',
  handler: (db, placeId: string) => researchTasks.getResearchTasksForPlace(db, placeId),
});

defineChannel({
  name: 'researchTasks:forMedia',
  thread: 'worker',
  handler: (db, mediaId: string) => researchTasks.getResearchTasksForMedia(db, mediaId),
});

defineChannel({
  name: 'researchTasks:create',
  thread: 'worker',
  mutating: true,
  handler: (db, data: Parameters<typeof researchTasks.createResearchTask>[1]) =>
    researchTasks.createResearchTask(db, data),
});

defineChannel({
  name: 'researchTasks:update',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string, data: Parameters<typeof researchTasks.updateResearchTask>[2]) =>
    researchTasks.updateResearchTask(db, id, data),
});

defineChannel({
  name: 'researchTasks:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => researchTasks.deleteResearchTask(db, id),
});

defineChannel({
  name: 'researchTasks:addLink',
  thread: 'worker',
  mutating: true,
  handler: (db, taskId: string, entityType: Parameters<typeof researchTasks.addTaskLink>[2], entityId: string) =>
    researchTasks.addTaskLink(db, taskId, entityType, entityId),
});

defineChannel({
  name: 'researchTasks:removeLink',
  thread: 'worker',
  mutating: true,
  handler: (db, linkId: string) => researchTasks.removeTaskLink(db, linkId),
});

defineChannel({
  name: 'researchTasks:getLinks',
  thread: 'worker',
  handler: (db, taskId: string) => researchTasks.getTaskLinks(db, taskId),
});
