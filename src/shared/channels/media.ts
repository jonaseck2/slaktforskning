import * as media from '../../api/media';
import { getMediaTimeline } from '../../api/media_timeline';
import * as mediaRegions from '../../api/media_regions';
import { defineChannel } from './registry';

// ── Media (DB-backed) ─────────────────────────────────────────────────────────
// Note: media:getFilePath and media:readAsDataUrl remain in the legacy dispatch
// table in db-worker.ts because they require getDbDir() — worker-local state.
// media:attach and media:openFile remain in src/main/ipc/media.ts as main-thread
// operations (dialog, shell, fs).

defineChannel({
  name: 'media:list',
  thread: 'worker',
  handler: (db) => media.listMedia(db),
});

defineChannel({
  name: 'media:listPage',
  thread: 'worker',
  handler: (db, limit: number, offset: number, sortBy?: media.ListMediaSortBy, sortDir?: media.ListMediaSortDir, query?: string) => ({
    items: media.listMediaPage(db, limit, offset, sortBy, sortDir, query),
    total: media.countMedia(db, query),
  }),
});

defineChannel({
  name: 'media:get',
  thread: 'worker',
  handler: (db, id: string) => media.getMedia(db, id),
});

defineChannel({
  name: 'media:create',
  thread: 'worker',
  mutating: true,
  handler: (db, data: Parameters<typeof media.createMedia>[1]) => media.createMedia(db, data),
});

defineChannel({
  name: 'media:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => media.deleteMedia(db, id),
});

defineChannel({
  name: 'media:update',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string, data: Parameters<typeof media.updateMedia>[2]) =>
    media.updateMedia(db, id, data),
});

defineChannel({
  name: 'media:forEntity',
  thread: 'worker',
  handler: (db, entityType: Parameters<typeof media.getMediaForEntity>[1], entityId: string) =>
    media.getMediaForEntity(db, entityType, entityId),
});

defineChannel({
  name: 'media:linksForMedia',
  thread: 'worker',
  handler: (db, mediaId: string) => media.getLinksForMedia(db, mediaId),
});

defineChannel({
  name: 'media:addLink',
  thread: 'worker',
  mutating: true,
  handler: (db, data: Parameters<typeof media.addMediaLink>[1]) => media.addMediaLink(db, data),
});

defineChannel({
  name: 'media:removeLink',
  thread: 'worker',
  mutating: true,
  handler: (db, linkId: string) => media.removeMediaLink(db, linkId),
});

defineChannel({
  name: 'media:reorder',
  thread: 'worker',
  mutating: true,
  handler: (db, linkIds: string[]) => media.reorderMediaLinks(db, linkIds),
});

defineChannel({
  name: 'media:profilePicRef',
  thread: 'worker',
  handler: (db, personId: string) => media.getPersonProfilePicRef(db, personId),
});

defineChannel({
  name: 'media:profilePicRefs',
  thread: 'worker',
  handler: (db, personIds: string[]) => media.getPersonProfilePicRefs(db, personIds),
});

defineChannel({
  name: 'media:getTimeline',
  thread: 'worker',
  handler: (db, entityType: string, entityId: string) =>
    getMediaTimeline(db, entityType, entityId),
});

// ── Media Regions ─────────────────────────────────────────────────────────────

defineChannel({
  name: 'mediaRegions:create',
  thread: 'worker',
  mutating: true,
  handler: (db, data: Parameters<typeof mediaRegions.createMediaRegion>[1]) =>
    mediaRegions.createMediaRegion(db, data),
});

defineChannel({
  name: 'mediaRegions:getForMedia',
  thread: 'worker',
  handler: (db, mediaId: string) => mediaRegions.getMediaRegions(db, mediaId),
});

defineChannel({
  name: 'mediaRegions:getForPerson',
  thread: 'worker',
  handler: (db, personId: string) => mediaRegions.getRegionsForPerson(db, personId),
});

defineChannel({
  name: 'mediaRegions:update',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string, data: Parameters<typeof mediaRegions.updateMediaRegion>[2]) =>
    mediaRegions.updateMediaRegion(db, id, data),
});

defineChannel({
  name: 'mediaRegions:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => mediaRegions.deleteMediaRegion(db, id),
});
