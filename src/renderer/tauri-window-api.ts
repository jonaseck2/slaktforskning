// Runtime polyfill that mounts `window.api.*` for the Tauri build.
//
// Two halves:
//   - Rust-backed commands (DB primitives, fs, dialog, media thumbnailing)
//     come from `./bindings.ts` which `tauri-specta` regenerates from the
//     #[tauri::command] + #[specta::specta] annotations every build.
//   - Renderer-local TS handlers (persons.list, events.create, …) are bound
//     explicitly below by mapping each `window.api.<domain>.<method>` to a
//     direct call against the matching `src/api/*` function. The Database
//     instance is the renderer-side shim from `src/renderer/db-shim.ts`
//     (vite alias of `node-sqlite3-wasm`); its methods invoke() rusqlite
//     primitives in `src-tauri/src/db.rs`.
//
// The previous Electron-era `src/shared/channels/` registry was deleted in
// the Specta migration. The wiring it carried lives inline below — no
// indirection, one source of truth per surface.

import { Database } from 'node-sqlite3-wasm';
import { invoke } from '@tauri-apps/api/core';
import { initializeSchema } from '../api/schema';
import * as media from '../api/media';
import * as mediaRegions from '../api/media_regions';
import { getMediaTimeline } from '../api/media_timeline';
import * as checks from '../api/checks';
import * as persons from '../api/persons';
import * as places from '../api/places';
import * as events from '../api/events';
import * as sources from '../api/sources';
import * as relationships from '../api/relationships';
import * as groups from '../api/groups';
import * as repositories from '../api/repositories';
import * as researchTasks from '../api/research_tasks';
import * as duplicates from '../api/duplicates';
import * as gazetteers from '../api/gazetteers';
import * as reportData from '../api/report_data';
import * as uw from '../api/undo_wrappers';
import { getAllGazetteers } from '../api/place-gazetteers/bundled';
import { getDbSetting, setDbSetting, deleteDbSetting } from '../api/db_settings';
import { queryAll } from '../api/db';
import { undoManager } from '../api/undo';
import { commands } from './bindings';

// Specta wraps every `Result<T, String>` return in an `{ status, data | error }`
// envelope so the renderer can distinguish typed errors from thrown JS errors.
// Every renderer call site in this file used to invoke<T>(...) and either
// receive T or reject — preserve that contract by unwrapping the envelope into
// either a resolved value or a thrown Error.
async function unwrap<T>(
  p: Promise<{ status: 'ok'; data: T } | { status: 'error'; error: unknown }>,
): Promise<T> {
  const r = await p;
  if (r.status === 'error') {
    const msg = typeof r.error === 'string' ? r.error : JSON.stringify(r.error);
    throw new Error(msg);
  }
  return r.data;
}

// Some commands return `serde_json::Value` on the Rust side (wrapped in
// JsonValueWire for Specta), which Specta types as `Record<string, never>`.
// The renderer knows the actual shape at the call site; this helper makes the
// cast explicit and keeps the unwrap path uniform.
async function unwrapAs<T>(
  p: Promise<{ status: 'ok'; data: Record<string, never> } | { status: 'error'; error: unknown }>,
): Promise<T> {
  return (await unwrap(p)) as unknown as T;
}

let dbInstance: Database | null = null;

function getDb(): Database {
  if (!dbInstance) throw new Error('window.api called before database opened');
  return dbInstance;
}

// Renderer-local "import in progress" flag. The Tauri build runs imports
// directly in the renderer (no worker thread), so the worker-side
// `setWorkerImportInProgress` from db-worker-state.ts is bypassed for the
// polyfilled importers. We mirror the same gate here: long-running quality
// checks return early when an import is mid-flight, so they don't race the
// import for the DB mutex and slow it down. Set by each importer polyfill
// (holgerRun, grampsRun, rootsmagicRun), consumed by api.checks.* below.
let _importInProgress = false;

// data:changed broadcast — emit through Tauri's event bus so multiple windows
// stay in sync. The Electron build does this via main → BrowserWindow.send;
// in Tauri, every renderer that mutates calls `emit('data:changed')` which
// fans out to ALL Tauri windows (sender included), and every renderer
// `listen('data:changed')` translates incoming events into local
// dataChangedListeners callbacks. Net effect: identical cross-window
// reactivity to the Electron build, no main-side bridge required.
const dataChangedListeners: Array<() => void> = [];
// db:switched / undo:changed / undo:performed are discrete events the renderer
// subscribes to via window.api.db.onSwitched / undo.onChanged / undo.onPerformed.
// In Electron these are ipcRenderer.on(channel) wires; here we keep parallel
// in-process listener registries and broadcast across windows via the Tauri
// event bus, mirroring the data:changed pattern below.
const dbSwitchedListeners: Array<() => void> = [];
const undoChangedListeners: Array<() => void> = [];
const undoPerformedListeners: Array<(data: { type: string; label: string }) => void> = [];
let suppressNextRemoteFire = false;
let suppressNextRemoteDbSwitched = false;
let suppressNextRemoteUndoChanged = false;
let suppressNextRemoteUndoPerformed = false;
function fireDataChanged(): void {
  for (const cb of dataChangedListeners) cb();
  // Fire-and-forget cross-window broadcast.
  import('@tauri-apps/api/event').then(({ emit }) => {
    suppressNextRemoteFire = true;  // local listener will receive our own emit
    emit('data:changed').catch(() => { /* ignore */ });
  }).catch(() => { /* ignore */ });
}
function fireDbSwitched(): void {
  for (const cb of dbSwitchedListeners) cb();
  import('@tauri-apps/api/event').then(({ emit }) => {
    suppressNextRemoteDbSwitched = true;
    emit('db:switched').catch(() => { /* ignore */ });
  }).catch(() => { /* ignore */ });
}
function fireUndoChanged(): void {
  for (const cb of undoChangedListeners) cb();
  import('@tauri-apps/api/event').then(({ emit }) => {
    suppressNextRemoteUndoChanged = true;
    emit('undo:changed').catch(() => { /* ignore */ });
  }).catch(() => { /* ignore */ });
}
function fireUndoPerformed(data: { type: string; label: string }): void {
  for (const cb of undoPerformedListeners) cb(data);
  import('@tauri-apps/api/event').then(({ emit }) => {
    suppressNextRemoteUndoPerformed = true;
    emit('undo:performed', data).catch(() => { /* ignore */ });
  }).catch(() => { /* ignore */ });
}

// Set up the inverse — receive these events from other windows.
import('@tauri-apps/api/event').then(({ listen }) => {
  listen('data:changed', () => {
    if (suppressNextRemoteFire) { suppressNextRemoteFire = false; return; }
    for (const cb of dataChangedListeners) cb();
  }).catch(() => { /* ignore */ });
  listen('db:switched', () => {
    if (suppressNextRemoteDbSwitched) { suppressNextRemoteDbSwitched = false; return; }
    for (const cb of dbSwitchedListeners) cb();
  }).catch(() => { /* ignore */ });
  listen('undo:changed', () => {
    if (suppressNextRemoteUndoChanged) { suppressNextRemoteUndoChanged = false; return; }
    for (const cb of undoChangedListeners) cb();
  }).catch(() => { /* ignore */ });
  listen<{ type: string; label: string }>('undo:performed', (event) => {
    if (suppressNextRemoteUndoPerformed) { suppressNextRemoteUndoPerformed = false; return; }
    for (const cb of undoPerformedListeners) cb(event.payload);
  }).catch(() => { /* ignore */ });
}).catch(() => { /* ignore */ });

export interface MountResult {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
  onDataChanged: (cb: () => void) => void;
}

// Bind a renderer-local handler taking `(db, ...args)` and broadcast
// data:changed after the call completes. The Specta-migrated `mountWindowApi`
// uses these two helpers in place of the deleted channel-registry walk.
function mutating<Args extends unknown[], R>(
  fn: (db: Database, ...args: Args) => Promise<R> | R,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    const result = await fn(getDb(), ...args);
    fireDataChanged();
    return result as R;
  };
}

function readOnly<Args extends unknown[], R>(
  fn: (db: Database, ...args: Args) => Promise<R> | R,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => fn(getDb(), ...args) as Promise<R>;
}

export function mountWindowApi(db: Database): MountResult {
  dbInstance = db;
  const api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> = {};

  // ── Inlined channel bindings ────────────────────────────────────────────
  // Each `domain:method` from the Electron-era `src/shared/channels/` registry
  // is bound here as a direct call against its `src/api/*` handler. Mutating
  // operations go through `mutating()` so `data:changed` fires after them.

  // persons
  api.persons = {
    create: mutating((db, data: Parameters<typeof uw.createPersonUndo>[1]) => uw.createPersonUndo(db, data)),
    createWithEvent: mutating((db, data: Parameters<typeof uw.createPersonWithEventUndo>[1]) => uw.createPersonWithEventUndo(db, data)),
    get: readOnly((db, id: string) => persons.getPerson(db, id)),
    list: readOnly((db) => persons.listPersons(db)),
    update: mutating((db, id: string, data: Parameters<typeof uw.updatePersonUndo>[2]) => uw.updatePersonUndo(db, id, data)),
    delete: mutating((db, id: string) => uw.deletePersonUndo(db, id)),
    search: readOnly((db, query: string, relateeId: string | null) => persons.searchPersons(db, query, relateeId ?? null)),
    addName: mutating((db, personId: string, data: Parameters<typeof uw.addPersonNameUndo>[2]) => uw.addPersonNameUndo(db, personId, data)),
    getNames: readOnly((db, personId: string) => persons.getPersonNames(db, personId)),
    updateName: mutating((db, id: string, data: Parameters<typeof uw.updatePersonNameUndo>[2]) => uw.updatePersonNameUndo(db, id, data)),
    deleteName: mutating((db, id: string) => uw.deletePersonNameUndo(db, id)),
    addIdentifier: mutating((db, personId: string, data: Parameters<typeof persons.addPersonIdentifier>[2]) => persons.addPersonIdentifier(db, personId, data)),
    getIdentifiers: readOnly((db, personId: string) => persons.getPersonIdentifiers(db, personId)),
    deleteIdentifier: mutating((db, id: string) => persons.deletePersonIdentifier(db, id)),
    listPage: readOnly(async (
      db,
      limit: number,
      offset: number,
      sortBy: persons.ListPersonsSortBy,
      sortDir: persons.ListPersonsSortDir,
      query?: string,
      sortBy2?: persons.ListPersonsSortBy | null,
      sortDir2?: persons.ListPersonsSortDir,
    ) => ({
      persons: await persons.listPersonsPage(db, limit, offset, sortBy, sortDir, query, sortBy2 ?? null, sortDir2),
      total: await persons.countPersons(db, query),
    })),
    // Not flagged mutating — derived render-time cache. The quality_issue_counts
    // table is exempt from the GEDCOM fidelity registry for the same reason.
    refreshQualityIssueCounts: readOnly((db, counts: Record<string, number>) => persons.refreshQualityIssueCounts(db, counts)),
    getQualityIssueCounts: readOnly((db, personIds: string[]) => persons.getQualityIssueCounts(db, personIds)),
    searchWithDetails: readOnly((db, query: string) => persons.searchPersonsWithDetails(db, query)),
    listUnsourcedPage: readOnly(async (db, limit: number, offset: number) => ({
      persons: await persons.listUnsourcedPersonsPage(db, limit, offset),
      total: await persons.countUnsourcedPersons(db),
    })),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // places
  api.places = {
    create: mutating((db, data: Parameters<typeof places.createPlace>[1]) => places.createPlace(db, data)),
    get: readOnly((db, id: string) => places.getPlace(db, id)),
    list: readOnly((db) => places.listPlaces(db)),
    listPage: readOnly(async (
      db,
      limit: number,
      offset: number,
      sortBy: places.ListPlacesSortBy,
      sortDir: places.ListPlacesSortDir,
      query?: string,
    ) => ({
      items: await places.listPlacesPage(db, limit, offset, sortBy, sortDir, query),
      total: await places.countPlaces(db, query),
    })),
    search: readOnly((db, query: string) => places.searchPlaces(db, query)),
    update: mutating((db, id: string, data: Parameters<typeof places.updatePlace>[2]) => places.updatePlace(db, id, data)),
    delete: mutating((db, id: string) => places.deletePlace(db, id)),
    findOrCreate: mutating((db, name: string) => places.findOrCreatePlace(db, name)),
    findOrCreateWithChain: mutating((db, name: string, chain: Parameters<typeof places.findOrCreatePlaceWithChain>[2]) =>
      places.findOrCreatePlaceWithChain(db, name, chain)),
    getPath: readOnly((db, id: string) => places.getPlacePath(db, id)),
    getPersons: readOnly((db, placeId: string) => places.getPersonsForPlace(db, placeId)),
    listChildren: readOnly((db, parentId: string | null) => places.listPlaceChildren(db, parentId)),
    getAncestors: readOnly((db, id: string) => places.getPlaceAncestors(db, id)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // events
  api.events = {
    create: mutating((db, data: Parameters<typeof events.createEvent>[1]) => uw.createEventUndo(db, data)),
    get: readOnly((db, id: string) => events.getEvent(db, id)),
    forPerson: readOnly((db, personId: string) => events.getEventsForPerson(db, personId)),
    forRelationship: readOnly((db, relationshipId: string) => events.getEventsForRelationship(db, relationshipId)),
    update: mutating((db, id: string, data: Parameters<typeof events.updateEvent>[2]) => uw.updateEventUndo(db, id, data)),
    delete: mutating((db, id: string) => uw.deleteEventUndo(db, id)),
    forPlace: readOnly((db, placeId: string) => events.getEventsForPlace(db, placeId)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // sources + citations
  api.sources = {
    create: mutating((db, data: Parameters<typeof sources.createSource>[1]) => uw.createSourceUndo(db, data)),
    get: readOnly((db, id: string) => sources.getSource(db, id)),
    list: readOnly((db) => sources.listSources(db)),
    listPage: readOnly(async (
      db,
      limit: number,
      offset: number,
      sortBy: sources.ListSourcesSortBy,
      sortDir: sources.ListSourcesSortDir,
      query?: string,
    ) => ({
      items: await sources.listSourcesPage(db, limit, offset, sortBy, sortDir, query),
      total: await sources.countSources(db, query),
    })),
    update: mutating((db, id: string, data: Parameters<typeof sources.updateSource>[2]) => uw.updateSourceUndo(db, id, data)),
    delete: mutating((db, id: string) => uw.deleteSourceUndo(db, id)),
    search: readOnly((db, query: string) => sources.searchSources(db, query)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  api.citations = {
    create: mutating((db, data: Parameters<typeof sources.createCitation>[1]) => uw.createCitationUndo(db, data)),
    get: readOnly((db, id: string) => sources.getCitation(db, id)),
    forSource: readOnly((db, sourceId: string) => sources.getCitationsForSource(db, sourceId)),
    forEvent: readOnly((db, eventId: string) => sources.getCitationsForEvent(db, eventId)),
    forPerson: readOnly((db, personId: string) => sources.getCitationsForPerson(db, personId)),
    forRelationship: readOnly((db, relationshipId: string) => sources.getCitationsForRelationship(db, relationshipId)),
    forPlace: readOnly((db, placeId: string) => sources.getCitationsForPlace(db, placeId)),
    forPersonName: readOnly((db, personNameId: string) => sources.getCitationsForPersonName(db, personNameId)),
    delete: mutating((db, id: string) => uw.deleteCitationUndo(db, id)),
    update: mutating((db, id: string, data: Parameters<typeof sources.updateCitation>[2]) => uw.updateCitationUndo(db, id, data)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // relationships + eventParticipants
  api.relationships = {
    create: mutating((db, data: Parameters<typeof relationships.createRelationship>[1]) => uw.createRelationshipUndo(db, data)),
    get: readOnly((db, id: string) => relationships.getRelationship(db, id)),
    list: readOnly((db) => relationships.listRelationships(db)),
    listPage: readOnly(async (db, limit: number, offset: number) => ({
      relationships: await relationships.listRelationshipsPage(db, limit, offset),
      total: await relationships.countRelationships(db),
    })),
    update: mutating((db, id: string, data: Parameters<typeof relationships.updateRelationship>[2]) => uw.updateRelationshipUndo(db, id, data)),
    delete: mutating((db, id: string) => uw.deleteRelationshipUndo(db, id)),
    getForPerson: readOnly((db, personId: string) => relationships.getRelationshipsOfPerson(db, personId)),
    search: readOnly((db, query: string) => relationships.searchRelationships(db, query)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  api.eventParticipants = {
    add: mutating((db, data: Parameters<typeof relationships.addEventParticipant>[1]) => uw.addEventParticipantUndo(db, data)),
    getForEvent: readOnly((db, eventId: string) => relationships.getEventParticipants(db, eventId)),
    remove: mutating((db, id: string) => uw.removeEventParticipantUndo(db, id)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // groups
  api.groups = {
    list: readOnly((db) => groups.listGroups(db)),
    get: readOnly((db, id: string) => groups.getGroup(db, id)),
    create: mutating((db, data: Parameters<typeof groups.createGroup>[1]) => groups.createGroup(db, data)),
    update: mutating((db, id: string, data: Parameters<typeof groups.updateGroup>[2]) => groups.updateGroup(db, id, data)),
    delete: mutating((db, id: string) => groups.deleteGroup(db, id)),
    addLink: mutating((db, groupId: string, entityType: Parameters<typeof groups.addGroupLink>[2], entityId: string) =>
      groups.addGroupLink(db, groupId, entityType, entityId)),
    removeLink: mutating((db, linkId: string) => groups.removeGroupLink(db, linkId)),
    removeLinkByEntity: mutating((db, groupId: string, entityType: Parameters<typeof groups.removeGroupLinkByEntity>[2], entityId: string) =>
      groups.removeGroupLinkByEntity(db, groupId, entityType, entityId)),
    getLinks: readOnly((db, groupId: string) => groups.getGroupLinks(db, groupId)),
    forPerson: readOnly((db, personId: string) => groups.getGroupsForPerson(db, personId)),
    forPlace: readOnly((db, placeId: string) => groups.getGroupsForPlace(db, placeId)),
    forMedia: readOnly((db, mediaId: string) => groups.getGroupsForMedia(db, mediaId)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // repositories
  api.repositories = {
    list: readOnly((db) => repositories.listRepositories(db)),
    get: readOnly((db, id: string) => repositories.getRepository(db, id)),
    create: mutating((db, data: Parameters<typeof repositories.createRepository>[1]) => repositories.createRepository(db, data)),
    update: mutating((db, id: string, data: Parameters<typeof repositories.updateRepository>[2]) => repositories.updateRepository(db, id, data)),
    delete: mutating((db, id: string) => repositories.deleteRepository(db, id)),
    forSource: readOnly((db, sourceId: string) => repositories.getRepositoriesForSource(db, sourceId)),
    linkSource: mutating((db, sourceId: string, repoId: string) => repositories.linkSourceRepository(db, sourceId, repoId)),
    unlinkSource: mutating((db, sourceId: string, repoId: string) => repositories.unlinkSourceRepository(db, sourceId, repoId)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // researchTasks
  api.researchTasks = {
    list: readOnly((db) => researchTasks.listResearchTasks(db)),
    get: readOnly((db, id: string) => researchTasks.getResearchTask(db, id)),
    forPerson: readOnly((db, personId: string) => researchTasks.getResearchTasksForPerson(db, personId)),
    forPlace: readOnly((db, placeId: string) => researchTasks.getResearchTasksForPlace(db, placeId)),
    forMedia: readOnly((db, mediaId: string) => researchTasks.getResearchTasksForMedia(db, mediaId)),
    create: mutating((db, data: Parameters<typeof researchTasks.createResearchTask>[1]) => researchTasks.createResearchTask(db, data)),
    update: mutating((db, id: string, data: Parameters<typeof researchTasks.updateResearchTask>[2]) => researchTasks.updateResearchTask(db, id, data)),
    delete: mutating((db, id: string) => researchTasks.deleteResearchTask(db, id)),
    addLink: mutating((db, taskId: string, entityType: Parameters<typeof researchTasks.addTaskLink>[2], entityId: string) =>
      researchTasks.addTaskLink(db, taskId, entityType, entityId)),
    removeLink: mutating((db, linkId: string) => researchTasks.removeTaskLink(db, linkId)),
    getLinks: readOnly((db, taskId: string) => researchTasks.getTaskLinks(db, taskId)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // reports (read-only computed views)
  api.reports = {
    personSummary: readOnly((db, personId: string) => reportData.getPersonSummary(db, personId)),
    familyUnit: readOnly((db, relId: string) => reportData.getFamilyUnit(db, relId)),
    ancestorTree: readOnly((db, personId: string, generations?: number) => reportData.getAncestorTree(db, personId, generations)),
    placeHistory: readOnly((db, placeId: string) => reportData.getPlaceHistory(db, placeId)),
    researchGaps: readOnly((db, personId: string) => reportData.getResearchGaps(db, personId)),
    timeline: readOnly((db, personId: string, options?: Parameters<typeof reportData.getTimeline>[2]) => reportData.getTimeline(db, personId, options)),
    aliveInYear: readOnly((db, year: number) => reportData.getAliveInYear(db, year)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // duplicates (persons, places, sources; media also has merge — wired later below)
  api.duplicates = {
    find: readOnly((db, limit?: number) => duplicates.findDuplicates(db, limit)),
    findPage: readOnly((db, limit?: number, offset?: number) => duplicates.findDuplicatesPage(db, limit, offset)),
    count: readOnly((db) => duplicates.countDuplicates(db)),
    merge: mutating((db, targetId: string, sourceId: string) => duplicates.mergePersons(db, targetId, sourceId)),
    ignore: mutating((db, personAId: string, personBId: string) => duplicates.ignoreDuplicate(db, personAId, personBId)),
    findPlaces: readOnly((db, limit?: number, offset?: number) => duplicates.findDuplicatePlaces(db, limit, offset)),
    countPlaces: readOnly((db) => duplicates.countDuplicatePlaces(db)),
    ignorePlace: mutating((db, placeAId: string, placeBId: string) => duplicates.ignoreDuplicatePlace(db, placeAId, placeBId)),
    mergePlaces: mutating((db, targetId: string, sourceId: string) => duplicates.mergePlaces(db, targetId, sourceId)),
    findSources: readOnly((db, limit?: number, offset?: number) => duplicates.findDuplicateSources(db, limit, offset)),
    countSources: readOnly((db) => duplicates.countDuplicateSources(db)),
    ignoreSource: mutating((db, sourceAId: string, sourceBId: string) => duplicates.ignoreDuplicateSource(db, sourceAId, sourceBId)),
    mergeSources: mutating((db, targetId: string, sourceId: string) => duplicates.mergeSources(db, targetId, sourceId)),
    findMedia: readOnly((db, limit?: number, offset?: number) => duplicates.findDuplicateMedia(db, limit, offset)),
    countMedia: readOnly((db) => duplicates.countDuplicateMedia(db)),
    ignoreMedia: mutating((db, mediaAId: string, mediaBId: string) => duplicates.ignoreDuplicateMedia(db, mediaAId, mediaBId)),
    // mergeMedia is wired below — it needs the active DB path for the file
    // snapshot + delete and lives next to the other fs-touching shims.
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // media (DB-backed; the fs+dialog shims overwrite a few entries below)
  api.media = {
    list: readOnly((db) => media.listMedia(db)),
    listPage: readOnly(async (
      db,
      limit: number,
      offset: number,
      sortBy?: media.ListMediaSortBy,
      sortDir?: media.ListMediaSortDir,
      query?: string,
      filters?: media.MediaListFilters,
    ) => ({
      items: await media.listMediaPage(db, limit, offset, sortBy, sortDir, query, filters),
      total: await media.countMedia(db, query, filters),
      total_missing: await media.countMissingMedia(db, query, filters),
    })),
    get: readOnly((db, id: string) => media.getMedia(db, id)),
    create: mutating((db, data: Parameters<typeof media.createMedia>[1]) => media.createMedia(db, data)),
    delete: mutating((db, id: string) => media.deleteMedia(db, id)),
    update: mutating((db, id: string, data: Parameters<typeof media.updateMedia>[2]) => media.updateMedia(db, id, data)),
    forEntity: readOnly((db, entityType: Parameters<typeof media.getMediaForEntity>[1], entityId: string) =>
      media.getMediaForEntity(db, entityType, entityId)),
    linksForMedia: readOnly((db, mediaId: string) => media.getLinksForMedia(db, mediaId)),
    addLink: mutating((db, data: Parameters<typeof media.addMediaLink>[1]) => media.addMediaLink(db, data)),
    removeLink: mutating((db, linkId: string) => media.removeMediaLink(db, linkId)),
    reorder: mutating((db, linkIds: string[]) => media.reorderMediaLinks(db, linkIds)),
    profilePicRef: readOnly((db, personId: string) => media.getPersonProfilePicRef(db, personId)),
    profilePicRefs: readOnly((db, personIds: string[]) => media.getPersonProfilePicRefs(db, personIds)),
    getTimeline: readOnly((db, entityType: Parameters<typeof getMediaTimeline>[1], entityId: string) =>
      getMediaTimeline(db, entityType, entityId)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  api.mediaRegions = {
    create: mutating((db, data: Parameters<typeof mediaRegions.createMediaRegion>[1]) => mediaRegions.createMediaRegion(db, data)),
    getForMedia: readOnly((db, mediaId: string) => mediaRegions.getMediaRegions(db, mediaId)),
    getForPerson: readOnly((db, personId: string) => mediaRegions.getRegionsForPerson(db, personId)),
    update: mutating((db, id: string, data: Parameters<typeof mediaRegions.updateMediaRegion>[2]) => mediaRegions.updateMediaRegion(db, id, data)),
    delete: mutating((db, id: string) => mediaRegions.deleteMediaRegion(db, id)),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // gazetteers — DB-backed (worker-shape) + pure-function (main-shape) blocks
  api.gazetteers = {
    list: readOnly((db) => gazetteers.listGazetteers(db)),
    import: mutating((db, json: string) => gazetteers.importGazetteer(db, json)),
    export: readOnly((db, id: string) => gazetteers.exportGazetteer(db, id)),
    delete: mutating((db, id: string) => gazetteers.deleteGazetteer(db, id)),
    getImported: readOnly((db) => gazetteers.getImportedGazetteers(db)),
    // Pure functions — no db argument.
    getSchema: async () => gazetteers.getGazetteerSchema(),
    getBundled: async () => getAllGazetteers(),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // db settings (the broader api.db block with file dialogs is built later
  // in this function and adds getCurrent / openExisting / createNew / etc.).
  api.db = {
    getSetting: readOnly((db, key: string) => getDbSetting(db, key)),
    // Settings changes don't trigger a full data:changed broadcast.
    setSetting: readOnly(async (db, key: string, value: string) => { await setDbSetting(db, key, value); }),
    deleteSetting: readOnly(async (db, key: string) => { await deleteDbSetting(db, key); }),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // undo state queries (the undo.undo / undo.redo entrypoints with data:changed
  // broadcasts are wired further down — kept together with the other event
  // emitters for that domain).
  api.undo = {
    state: readOnly(() => undoManager.getState()),
    beginGroup: readOnly(async (_db, label: string) => { await undoManager.beginGroup(label); }),
    endGroup: readOnly(async () => { await undoManager.endGroup(); }),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  // website export (preview snapshot — pure DB walk; buildPreviewHtml and
  // export wrappers that hit fs/dialog land further down).
  api.website = {
    previewSnapshot: readOnly((db, opts: Parameters<typeof import('../api/html_site/preview').buildPreview>[1]) =>
      import('../api/html_site/preview').then(({ buildPreview }) => buildPreview(db, opts))),
  } as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;


  // Main-only channels that the registry walk can't satisfy because they
  // require Tauri runtime services (file dialog, app data dir). Override the
  // generated stubs with real implementations.
  if (!api.db) api.db = {};
  api.db.getCurrent = async () => {
    const path = await commands.dbCurrentPath();
    if (!path) return null;
    // Match the shape the renderer expects from the Electron build.
    return { path, name: deriveDbName(path) };
  };
  api.db.openExisting = async () => {
    const path = await unwrap(commands.dbPickExisting());
    if (!path) return { cancelled: true };
    await switchDbTo(path, /* createSchema */ false);
    return { path, name: deriveDbName(path) };
  };
  api.db.createNew = async () => {
    const path = await unwrap(commands.dbPickNew());
    if (!path) return { cancelled: true };
    await switchDbTo(path, /* createSchema */ true);
    return { path, name: deriveDbName(path) };
  };
  api.db.switchTo = async (path: unknown) => {
    if (typeof path !== 'string') throw new Error('switchTo: path must be string');
    await switchDbTo(path, /* createSchema */ false);
    return { path, name: deriveDbName(path) };
  };
  // Recent databases — stored as JSON in db_settings under 'recent_dbs'.
  // switchDbTo() prepends each newly-opened path with dedupe and a 10-entry
  // cap, mirroring the Electron build's settings.json-backed list.
  api.db.getRecent = async () => {
    try {
      const dbSet = await import('../api/db_settings');
      const raw = await dbSet.getDbSetting(getDb(), 'recent_dbs');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Array<{ path: string; name: string; lastOpenedAt?: string }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  // Discrete db:switched event — onSwitched(cb) registers a callback that
  // fires after every switchDbTo. Distinct from data:changed (which also
  // fires) so subscribers like App.vue's window.location.reload listener
  // can react specifically to a DB switch without piggy-backing.
  api.db.onSwitched = (cb: unknown) => {
    if (typeof cb === 'function') dbSwitchedListeners.push(cb as () => void);
  };

  // Media: file picker + copy lives in Rust (renderer can't touch fs).
  // After the file is in <dbname>-media/, do the DB work via the api/ functions.
  if (!api.media) api.media = {};
  api.media.attach = async (data: unknown) => {
    const opts = data as { entityType?: string; entityId?: string } | undefined;
    const r = await unwrapAs<{ canceled: boolean; fileRef?: string; format?: string | null; title?: string }>(
      commands.mediaPickAndCopy(),
    );
    if (r.canceled) return { canceled: true };
    const item = await media.createMedia(getDb(), {
      file_ref: r.fileRef ?? null,
      title: r.title ?? '',
      format: (r.format ?? null) as string | null,
    });
    if (opts?.entityType && opts?.entityId) {
      await media.addMediaLink(getDb(), {
        media_id: item.id,
        entity_type: opts.entityType as Parameters<typeof media.addMediaLink>[1]['entity_type'],
        entity_id: opts.entityId,
      });
    }
    fireDataChanged();
    return { canceled: false, media: item };
  };
  api.media.readAsDataUrl = async (mediaIdOrRef: unknown) => {
    // Electron preload accepts either a media-id (looked up in DB) or a
    // file_ref. Mirror both shapes.
    let fileRef: string | null = null;
    if (typeof mediaIdOrRef === 'string') {
      // First try as media id.
      const row = await media.getMedia(getDb(), mediaIdOrRef);
      if (row?.file_ref) fileRef = row.file_ref;
      else fileRef = mediaIdOrRef;  // assume it's a file_ref
    }
    if (!fileRef) return null;
    return await unwrap(commands.mediaReadAsDataUrl(fileRef));
  };
  api.media.getFilePath = async (mediaId: unknown) => {
    if (typeof mediaId !== 'string') return null;
    const row = await media.getMedia(getDb(), mediaId);
    return row?.file_ref ?? null;
  };
  // media.createFromFile — same fs flow as media.attach but with a
  // user-supplied default title (`suggestedTitle`), and no entity-link
  // step. Mirrors the Electron handler at src/main/ipc/media.ts:144.
  api.media.createFromFile = async (data: unknown) => {
    const opts = data as { suggestedTitle?: string } | undefined;
    const r = await unwrapAs<{ canceled: boolean; fileRef?: string; format?: string | null; title?: string }>(
      commands.mediaPickAndCopy(),
    );
    if (r.canceled) return { canceled: true };
    const item = await media.createMedia(getDb(), {
      file_ref: r.fileRef ?? null,
      title: opts?.suggestedTitle?.trim() || r.title || '',
      format: (r.format ?? null) as string | null,
    });
    fireDataChanged();
    return { canceled: false, media: item };
  };
  // media.openFile — open a media file in the OS's default app (Photos,
  // Preview, VLC, etc.). Renderer hands us the media row's id; we look up
  // file_ref, resolve to an absolute path against the DB directory, and
  // hand it to tauri-plugin-opener's open_path on the Rust side.
  api.media.openFile = async (mediaId: unknown) => {
    if (typeof mediaId !== 'string') return { success: false, error: 'missing media id' };
    const row = await media.getMedia(getDb(), mediaId);
    if (!row?.file_ref) return { success: false, error: 'Media not found or no file_ref' };
    const cur = await commands.dbCurrentPath();
    if (!cur) return { success: false, error: 'no DB open' };
    const dbDir = cur.replace(/[\\/][^\\/]+$/, '');
    // file_ref is normally relative (`<dbname>-media/foo.jpg`); if it ever
    // is absolute (pre-consolidate), use it as-is.
    const isAbsolute = /^([A-Za-z]:[\\/]|\/)/.test(row.file_ref);
    const absPath = isAbsolute ? row.file_ref : `${dbDir}/${row.file_ref}`;
    try {
      await unwrap(commands.shellOpenPath(absPath));
      return { success: true };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };
  // media.thumbnailDataUrl — JPEG thumbnail via the Rust `image` crate.
  // Mirrors the Electron `nativeImage.resize().toJPEG()` path in
  // src/main/ipc/media.ts:60. Returns null on missing files or
  // undecodable formats so the renderer can fall back to an icon.
  api.media.thumbnailDataUrl = async (fileRefArg: unknown, maxWidthArg?: unknown) => {
    const fileRef = typeof fileRefArg === 'string' ? fileRefArg : null;
    if (!fileRef) return null;
    const maxWidth = typeof maxWidthArg === 'number' && maxWidthArg > 0 ? maxWidthArg : null;
    return await unwrap(commands.mediaThumbnail(fileRef, maxWidth));
  };

  // Duplicates: mergeMedia is intentionally NOT registered in
  // src/shared/channels/duplicates.ts because the Electron build keeps it
  // on the main thread (it does sync fs to delete + snapshot the file).
  // In Tauri there's no worker thread; api/ runs in the renderer; the
  // sync fs calls inside mergeMedia run against the host fs through the
  // Rust side. We polyfill the channel here so window.api.duplicates.mergeMedia
  // resolves at runtime — without it, MergeMediaModal and the e2e [duplicates]
  // project both fail with an undefined-callee error. Repaired as part of
  // the e2e-test-repair plan (2026-05-12).
  if (!api.duplicates) api.duplicates = {};
  api.duplicates.mergeMedia = async (
    targetIdArg: unknown,
    sourceIdArg: unknown,
    keepFileArg: unknown,
  ) => {
    if (typeof targetIdArg !== 'string' || typeof sourceIdArg !== 'string') {
      throw new Error('duplicates.mergeMedia: targetId and sourceId must be strings');
    }
    if (keepFileArg !== 'target' && keepFileArg !== 'source') {
      throw new Error("duplicates.mergeMedia: keepFile must be 'target' or 'source'");
    }
    const dbPath = await commands.dbCurrentPath();
    if (!dbPath) throw new Error('duplicates.mergeMedia: no database open');
    const result = await duplicates.mergeMedia(getDb(), targetIdArg, sourceIdArg, keepFileArg, { dbPath });
    fireDataChanged();
    return result;
  };

  // Checks: main-only IPC channels in the Electron build (worker-local
  // cancellation state). In Tauri the whole thing runs in the renderer, so
  // we call the api/ functions directly. Re-runs aren't expected to be
  // cancelled here — the user-visible effect is just slower checks.
  if (!api.checks) api.checks = {};
  const dbDirFromPath = async (): Promise<string | undefined> => {
    const cur = await commands.dbCurrentPath();
    if (!cur) return undefined;
    return cur.replace(/[\\/][^\\/]+$/, '');
  };
  api.checks.runAll = async () => {
    if (_importInProgress) return [];
    const dbDir = await dbDirFromPath();
    const results = await checks.runAllChecks(getDb(), dbDir);
    // Cap notice severity per code at 500, mirroring the worker's behaviour.
    const countByCode = new Map<string, number>();
    const capped = results.filter(r => {
      if (r.severity !== 'notice') return true;
      const n = (countByCode.get(r.code) ?? 0) + 1;
      countByCode.set(r.code, n);
      return n <= 500;
    });
    const allIds = [...new Set(capped.flatMap(r => r.personIds))];
    const nameMap = await persons.getPersonDisplayNames(getDb(), allIds);
    const enrich = async (ids: string[], table: string, col: string): Promise<Map<string, string>> => {
      const out = new Map<string, string>();
      if (ids.length === 0) return out;
      const ph = ids.map(() => '?').join(',');
      const rows = await queryAll<{ id: string; v: string | null }>(getDb(), `SELECT id, ${col} AS v FROM ${table} WHERE id IN (${ph})`, ids);
      for (const r of rows) out.set(r.id, r.v ?? '');
      return out;
    };
    const placeNameMap = await enrich([...new Set(capped.flatMap(r => r.placeIds ?? []))], 'places', 'name');
    const mediaTitleMap = await enrich([...new Set(capped.flatMap(r => r.mediaIds ?? []))], 'media', 'COALESCE(title, file_ref)');
    const sourceTitleMap = await enrich([...new Set(capped.flatMap(r => r.sourceIds ?? []))], 'sources', 'title');
    return capped.map(r => ({
      ...r,
      personNames: r.personIds.map(id => nameMap.get(id) ?? ''),
      placeNames: (r.placeIds ?? []).map(id => placeNameMap.get(id) ?? ''),
      mediaTitles: (r.mediaIds ?? []).map(id => mediaTitleMap.get(id) ?? ''),
      sourceTitles: (r.sourceIds ?? []).map(id => sourceTitleMap.get(id) ?? ''),
    }));
  };
  api.checks.forPerson = async (personId: unknown) => {
    if (typeof personId !== 'string') return [];
    // Skip during active imports — checks run every rule against every event
    // for a person and contend with the importer for the DB mutex. Old
    // Electron build had the same gate via `getWorkerImportInProgress`; the
    // Tauri build needs it explicitly because the polyfilled importers
    // bypass `withImportLifecycle`. The panel section will re-load when the
    // import emits its post-completion data:changed broadcast.
    if (_importInProgress) return [];
    const dbDir = await dbDirFromPath();
    const results: import('../api/checks').CheckResult[] = [];
    for (const c of checks.getAllCheckFunctions()) {
      if (c.global) continue;
      const res = await c.fn(getDb(), dbDir);
      results.push(...res.filter(r => r.personIds.includes(personId)));
    }
    return results;
  };
  api.checks.forPlace = async (placeId: unknown) => {
    if (typeof placeId !== 'string') return [];
    if (_importInProgress) return [];
    const dbDir = await dbDirFromPath();
    return await checks.runChecksForPlace(getDb(), placeId, dbDir);
  };
  api.checks.forMedia = async (mediaId: unknown) => {
    if (typeof mediaId !== 'string') return [];
    if (_importInProgress) return [];
    const dbDir = await dbDirFromPath();
    return await checks.runChecksForMedia(getDb(), mediaId, dbDir);
  };
  api.checks.runForEvent = async (eventId: unknown) => {
    if (typeof eventId !== 'string') return [];
    if (_importInProgress) return [];
    return await checks.runChecksForEvent(getDb(), eventId);
  };
  api.checks.cancel = async () => { /* no cancellation surface here yet */ };

  // File-dialog wrappers (Electron used dialog.showOpenDialog/SaveDialog on the
  // main thread; Tauri uses tauri-plugin-dialog via a generic Rust command).
  type Pick = { canceled: boolean; path?: string };
  const pickFile = (title: string, exts?: string[], extLabel?: string): Promise<Pick> =>
    unwrapAs<Pick>(commands.dialogPick('openFile', title, exts ?? null, extLabel ?? null, null));
  const pickFolder = (title: string): Promise<Pick> =>
    unwrapAs<Pick>(commands.dialogPick('openDirectory', title, null, null, null));
  const saveFile = (title: string, defaultName: string, exts?: string[], extLabel?: string): Promise<Pick> =>
    unwrapAs<Pick>(commands.dialogPick('saveFile', title, exts ?? null, extLabel ?? null, defaultName));

  if (!api.gedcom) api.gedcom = {};
  api.gedcom.selectFile = () => pickFile('Select GEDCOM File', ['ged', 'gedcom', 'zip'], 'GEDCOM Files');

  // GEDCOM import: read bytes via Rust, decode encoding-aware in JS, parse +
  // import via the existing api/ functions. The Electron build's worker
  // handler does the same flow but with sync fs.readFileSync; the renderer
  // can't use fs so it goes through `commands.fsReadBytesBase64` (generated).
  api.gedcom.import = async (opts: unknown) => {
    const o = opts as { filePath?: string; mediaDir?: string; profile?: 'standard' | 'minimal' } | undefined;
    if (!o?.filePath) return { success: false, error: 'filePath is required' };
    _importInProgress = true;
    try {
      const [enc, parserMod, importerMod] = await Promise.all([
        import('../gedcom/encoding'),
        import('../gedcom/parser'),
        import('../import/gedcom'),
      ]);
      const b64 = await unwrap(commands.fsReadBytesBase64(o.filePath));
      const bytes = base64ToUint8Array(b64);
      const text = enc.decodeGedcomBytes(bytes);
      const tree = parserMod.parseGedcom(text);
      const report = await importerMod.importGedcom(getDb(), tree, {
        mediaDir: o.mediaDir,
        profile: o.profile,
        onProgress: (m) => fireProgress('genney', m),
      });
      fireDataChanged();
      return report;
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    } finally {
      _importInProgress = false;
    }
  };

  // GEDCOM preview: same shape, returns a count summary without inserting.
  api.gedcom.preview = async (opts: unknown) => {
    const o = opts as { filePath?: string } | undefined;
    if (!o?.filePath) return { success: false, error: 'filePath is required' };
    try {
      const [enc, parserMod, importerMod] = await Promise.all([
        import('../gedcom/encoding'),
        import('../gedcom/parser'),
        import('../import/gedcom'),
      ]);
      const b64 = await unwrap(commands.fsReadBytesBase64(o.filePath));
      const bytes = base64ToUint8Array(b64);
      const text = enc.decodeGedcomBytes(bytes);
      const tree = parserMod.parseGedcom(text);
      return importerMod.previewGedcomImport(tree);
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };

  // GEDCOM export: build the .ged in renderer, then write via Rust.
  api.gedcom.export = async (opts: unknown) => {
    const o = opts as { version?: '5.5.1' | '7.0'; exportOptions?: unknown } | undefined;
    const version = o?.version === '7.0' ? '7.0' : '5.5.1';
    const fileName = version === '7.0' ? 'family-tree-70.ged' : 'family-tree.ged';
    const r = await saveFile('Export GEDCOM File', fileName, ['ged'], 'GEDCOM Files');
    if (r.canceled || !r.path) return { canceled: true };
    try {
      const exporterMod = await import('../gedcom/exporter');
      const { ged, report } = await exporterMod.exportGedcom(getDb(), {
        version,
        exportOptions: o?.exportOptions as Parameters<typeof exporterMod.exportGedcom>[1]['exportOptions'],
      });
      await unwrap(commands.fsWriteText(r.path, ged));
      return { exported: true, filePath: r.path, report };
    } catch (e) {
      return { canceled: false, error: String((e as Error)?.message || e) };
    }
  };

  if (!api.import) api.import = {};

  // Progress event subscriptions — Electron uses `ipcRenderer.on('import:*Progress', cb)`.
  // The renderer-side polyfilled importers (gramps, holger, rootsmagic) run in
  // the same process; they thread an onProgress callback through and we fan
  // it out to all subscribed listeners. Genney isn't wired but its picker UI
  // mounts the listener — keep the registry empty-but-callable to stop the
  // "window.api.import.onProgress is not a function" throw.
  const progressListeners: Record<string, Array<(msg: string) => void>> = {
    genney: [], holger: [], rootsmagic: [], gramps: [],
  };
  const subscribe = (kind: string) => (cb: unknown) => {
    if (typeof cb !== 'function') return;
    progressListeners[kind].push(cb as (msg: string) => void);
  };
  const fireProgress = (kind: string, msg: string): void => {
    for (const cb of progressListeners[kind]) try { cb(msg); } catch { /* ignore */ }
  };
  api.import.onProgress = subscribe('genney');
  api.import.onHolgerProgress = subscribe('holger');
  api.import.onRootsmagicProgress = subscribe('rootsmagic');
  api.import.onGrampsProgress = subscribe('gramps');

  api.import.genneyCheckDocker = async () => ({ available: false });
  api.import.genneySelectDerby = () => pickFolder('Välj Genney Derby-databasmapp');
  api.import.genneySelectArchive = () => pickFile('Välj Genney-arkivfil (.gcc, .backup)', ['gcc', 'backup', 'zip'], 'Genney-arkiv');
  api.import.genneySelectMedia = () => pickFolder('Select Genney media folder (optional)');
  api.import.holgerSelectFile = () => pickFile('Select Holger GEDCOM export', ['ged', 'zip'], 'GEDCOM / Zip');
  api.import.holgerSelectMedia = () => pickFolder('Select OurKind Media folder (optional)');
  api.import.rootsmagicSelectFile = () => pickFile('Välj RootsMagic-databasfil', ['rmtree', 'rmgc'], 'RootsMagic-databas');
  api.import.grampsSelectFile = () => pickFile('Välj Gramps-databasfil', ['gramps', 'xml', 'gpkg'], 'Gramps-databas');
  api.import.grampsRun = async (opts: unknown) => {
    const o = opts as { filePath?: string } | undefined;
    if (!o?.filePath) return { success: false, error: 'filePath is required' };
    _importInProgress = true;
    try {
      const grampsMod = await import('../import/gramps');
      const b64 = await unwrap(commands.fsReadBytesBase64(o.filePath));
      const bytes = base64ToUint8Array(b64);
      const result = await grampsMod.importFromGrampsBytes(getDb(), bytes, { onProgress: (m) => fireProgress('gramps', m) });
      fireDataChanged();
      return { success: true, summary: result.summary };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    } finally {
      _importInProgress = false;
    }
  };

  // RootsMagic — pick file, write its bytes to a temp file via Rust (so
  // rusqlite has a real path to open), open as a read-only secondary
  // SQLite connection through the SecondaryDatabase shim, then run the
  // shared `importFromRootsMagicDb` transform against the active DB.
  // Cleanup (close secondary + delete temp) lives in the `finally` block
  // so a failed import doesn't leak the rusqlite handle or the temp file.
  // Accepts both `{ sourcePath }` (the renderer UI's wire shape) and
  // `{ filePath }` (the channel-spec name) so neither side has to change.
  api.import.rootsmagicRun = async (opts: unknown) => {
    const o = opts as { sourcePath?: string; filePath?: string } | undefined;
    const path = o?.sourcePath ?? o?.filePath;
    if (!path) return { success: false, error: 'sourcePath is required' };
    let tempPath: string | null = null;
    let secondary: import('./secondary-db-shim').SecondaryDatabase | null = null;
    _importInProgress = true;
    try {
      const [{ SecondaryDatabase }, rmMod] = await Promise.all([
        import('./secondary-db-shim'),
        import('../import/rootsmagic'),
      ]);
      // Read picked file → write to OS temp dir → hand temp path to
      // secondary_db_open. We can't pass the user's original path
      // straight to rusqlite because (a) the renderer's chosen-file
      // sandbox might not grant Rust the same access on all platforms,
      // and (b) the .rmgc may live on a network share where read-only
      // SQLite open + journal probing is unreliable.
      const b64 = await unwrap(commands.fsReadBytesBase64(path));
      const baseName = path.split(/[\\/]/).pop() ?? 'rootsmagic.rmgc';
      tempPath = await unwrap(commands.fsWriteTempBytesBase64(baseName, b64));
      secondary = await SecondaryDatabase.open(tempPath);
      const result = await rmMod.importFromRootsMagicDb(
        getDb(),
        secondary as unknown as Database,
      );
      fireDataChanged();
      return { success: true, summary: result.summary };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    } finally {
      _importInProgress = false;
      if (secondary) {
        try { secondary.close(); } catch { /* ignore */ }
      }
      if (tempPath) {
        try { await unwrap(commands.fsRemoveFile(tempPath)); } catch { /* ignore */ }
      }
    }
  };

  // Holger / OurKind import — three-step flow with Rust on each end:
  //   1. holger_bulk_copy_media (if mediaDir provided): recursive copy of
  //      the user's OurKind Media folder into <dbname>-media/. After this,
  //      consolidate's fast path can hit existing dest files.
  //   2. holger_extract_ged: pulls the .ged file out of a .zip or reads a
  //      bare .ged / dir; returns bytes + an optional temp dir to clean up.
  //   3. importFromHolgerWithBytes: pure-TS parser + Holger-profile
  //      importGedcom call, with mediaDir set so Windows-style OBJE FILE
  //      paths get remapped to the user's local Media folder. Authored
  //      file_refs land in the DB as absolute paths into the user's
  //      Media folder.
  //   4. holger_consolidate_media: walks the media table, copies any
  //      absolute file_ref into <dbname>-media/, rewrites the ref to the
  //      relative form. Fast-paths every row whose ref is under the
  //      bulk-copied source dir.
  // Cleanup of the zip temp dir runs in the `finally` block so a failed
  // import doesn't leave temp data on disk.
  api.import.holgerRun = async (opts: unknown) => {
    const o = opts as { sourcePath?: string; mediaDir?: string } | undefined;
    if (!o?.sourcePath) return { success: false, error: 'sourcePath is required' };
    let tempDir: string | null = null;
    try {
      const cur = await commands.dbCurrentPath();
      if (!cur) return { success: false, error: 'no DB open' };
      const dbDir = cur.replace(/[\\/][^\\/]+$/, '');
      const dbBase = (cur.split(/[\\/]/).pop() ?? '').replace(/\.(db|sqlite|sqlite3)$/i, '');
      const mediaFolderName = `${dbBase}-media`;
      const destMediaDir = `${dbDir}/${mediaFolderName}`;

      // Step 1 — bulk copy media folder if user provided one.
      let bulkCopiedFromDir: string | null = null;
      if (o.mediaDir) {
        try {
          const r = await unwrap(commands.holgerBulkCopyMedia(o.mediaDir, destMediaDir));
          bulkCopiedFromDir = o.mediaDir;
          console.log(`[holger] bulk_copy_media — copied=${r.copied} skipped=${r.skipped} in ${r.ms}ms`);
        } catch (e) {
          console.warn(`[holger] bulk_copy_media failed (will fall back to per-row copy): ${(e as Error)?.message ?? e}`);
        }
      }

      // Step 2 — extract .ged bytes.
      const extracted = await unwrap(commands.holgerExtractGed(o.sourcePath));
      tempDir = extracted.tempDir;
      const gedBytes = base64ToUint8Array(extracted.gedBytesB64);
      console.log(`[holger] extract_ged — ${extracted.gedName} (${gedBytes.length} bytes)`);

      // Step 3 — parse + import. mediaDir = user's source Media folder so
      // OBJE FILE paths get rewritten there; consolidate then copies into
      // <dbname>-media/ via the fast path.
      const holgerMod = await import('../import/holger/index');
      fireProgress('holger', `Importing ${extracted.gedName}…`);
      // CRITICAL: route per-phase and per-row progress emitted by the GEDCOM
      // import pipeline (phasePrepPlaces, phaseObje, phaseSources,
      // phaseIndividuals, phaseFamilies) through fireProgress so the toast
      // bar in HolgerImportSection.vue actually receives (N / M) messages.
      // Without this, the bar stays indeterminate for the whole import even
      // though phases.ts is emitting fine-grained progress.
      _importInProgress = true;
      let report;
      try {
        ({ report } = await holgerMod.importFromHolgerWithBytes(getDb(), gedBytes, {
          mediaDir: o.mediaDir,
          onProgress: (m) => fireProgress('holger', m),
        }));
      } finally {
        _importInProgress = false;
      }
      fireProgress('holger', `Imported ${report?.persons ?? 0} persons; consolidating media…`);

      // Step 4 — copy + rewrite media file_refs.
      const consol = await unwrap(commands.holgerConsolidateMedia(cur, bulkCopiedFromDir));
      console.log(`[holger] consolidate_media — copied=${consol.copied} skipped=${consol.skipped} missing=${consol.missing} in ${consol.ms}ms`);

      fireDataChanged();
      return { success: true, report };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    } finally {
      if (tempDir) {
        try { await unwrap(commands.fsRemoveDir(tempDir)); } catch { /* ignore */ }
      }
    }
  };
  // Deferred: the "progress" listener used by the Electron build is a
  // Tauri event listener subscribed via window.api.import.onHolgerProgress(cb).
  // We don't broadcast progress messages from the Rust side yet — the
  // import is fast enough on a modern Mac that a single "Importerar…"
  // banner from the Vue UI is acceptable. Wire as no-op so the UI's
  // listener registration doesn't crash.
  // (NOTE: line 832 above wires `api.import.onHolgerProgress = subscribe('holger')`
  // for in-process per-message progress; this assignment silently overrides
  // it. Un-defer trigger: a Holger import that runs slowly enough for a user
  // to want per-row progress — at that point, drop this override and the
  // subscribe('holger') wiring delivers the messages.)
  api.import.onHolgerProgress = () => { /* not yet wired */ };

  // Genney importer — three-step flow:
  //   1. invoke('genneyImport', ...) → Rust spawns the Bun sidecar bundling
  //      src/import/genney/index.ts (Node-shape child_process / worker_threads /
  //      https that the webview lacks). The sidecar opens the same SQLite file
  //      with node-sqlite3-wasm and runs importFromGenney directly.
  //   2. If the sidecar returns gedcomFallbackPath (encrypted .gcc, or .backup
  //      with no Derby DB), the polyfill reads the temp .ged via
  //      fs_read_bytes_base64 and runs the GEDCOM importer through the same
  //      path Holger uses.
  //   3. Cleanup of the temp dir owned by the GEDCOM fallback is the
  //      sidecar's responsibility — the renderer's only post-import work is
  //      consolidateMediaFolder + fireDataChanged.
  api.import.genneyRun = async (opts: unknown) => {
    const o = opts as { sourcePath?: string; mediaDir?: string; schema?: string } | undefined;
    if (!o?.sourcePath) return { success: false, error: 'sourcePath is required' };
    _importInProgress = true;
    try {
      const cur = await commands.dbCurrentPath();
      if (!cur) return { success: false, error: 'no DB open' };
      const dbDir = cur.replace(/[\\/][^\\/]+$/, '');
      const dbBase = (cur.split(/[\\/]/).pop() ?? '').replace(/\.(db|sqlite|sqlite3)$/i, '');
      const destMediaDir = `${dbDir}/${dbBase}-media`;

      fireProgress('genney', 'Starting Genney import…');
      // repoRoot is only used by the Rust dev-fallback to locate
      // `dist-genney/genney-import.bundle.mjs`. The renderer doesn't
      // know its own repo root (no fs in the webview); we pass an
      // empty string and let the Rust side fall back to cwd, which is
      // the project root under `tauri dev` / `tauri build --no-bundle`.
      const result = await unwrap(commands.genneyImport(
        '',
        o.sourcePath,
        cur,
        o.mediaDir ?? null,
        destMediaDir,
        o.schema ?? null,
      ));

      // Replay progress messages the sidecar buffered so the toast UI
      // sees the same stream the importer emitted.
      for (const msg of result.progress) fireProgress('genney', msg);

      // GEDCOM fallback path: archive was encrypted (or had no Derby DB
      // but a .ged inside). The sidecar extracts the .ged to a temp file
      // and returns its path — read it back and run the normal GEDCOM
      // importer through the same decode → parse → importGedcom path that
      // api.gedcom.import uses.
      if (result.gedcomFallbackPath) {
        fireProgress('genney', 'Importing GEDCOM fallback…');
        const [enc, parserMod, importerMod] = await Promise.all([
          import('../gedcom/encoding'),
          import('../gedcom/parser'),
          import('../import/gedcom'),
        ]);
        const b64 = await unwrap(commands.fsReadBytesBase64(result.gedcomFallbackPath));
        const gedBytes = base64ToUint8Array(b64);
        const text = enc.decodeGedcomBytes(gedBytes);
        const tree = parserMod.parseGedcom(text);
        await importerMod.importGedcom(getDb(), tree, {
          onProgress: (m) => fireProgress('genney', m),
        });
        // Sidecar copied the .ged to a sibling temp dir (outside its
        // own short-lived tempDir) precisely so this read could still
        // succeed; now that we've consumed it, drop the whole dir.
        // Best-effort: a leak here just costs disk space until the OS
        // sweeps /tmp.
        try {
          const lastSep = Math.max(
            result.gedcomFallbackPath.lastIndexOf('/'),
            result.gedcomFallbackPath.lastIndexOf('\\'),
          );
          const parentDir = lastSep > 0
            ? result.gedcomFallbackPath.slice(0, lastSep)
            : result.gedcomFallbackPath;
          await unwrap(commands.fsRemoveDir(parentDir));
        } catch (e) {
          console.warn(`[genney] fallback ged cleanup failed: ${(e as Error)?.message ?? e}`);
        }
      }

      // Consolidate any absolute file_refs that the importer wrote
      // (mirrors the Holger flow). Idempotent — near-no-op when refs
      // are already relative.
      try {
        await unwrap(commands.holgerConsolidateMedia(cur, o.mediaDir ?? null));
      } catch (e) {
        console.warn(`[genney] consolidate_media failed: ${(e as Error)?.message ?? e}`);
      }

      fireDataChanged();
      return { success: true, summary: result.summary };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    } finally {
      _importInProgress = false;
    }
  };
  // Deferred: api.import.genneyDiscover is the UI affordance for picking which
  // tables in a .gcc to scope the import to. Not load-bearing for the import
  // itself — when the user picks a file the regular genneyRun path covers all
  // tables. Tracked in docs/plans/2026-05-14-genney-tauri-wiring.md Scope
  // deviations (option to add as follow-up if users ask).
  api.import.genneyDiscover = async () => ({ success: false, error: 'genneyDiscover not yet wired in Tauri build (deferred — see 2026-05-14-genney-tauri-wiring.md)' });

  if (!api.archive) api.archive = {};
  // Archive export — open save dialog, build zip in memory via the pure
  // `exportArchiveToBytes` helper (which calls the supplied media reader
  // for each `file_ref` row), then write the resulting bytes via
  // `fs_write_bytes_base64`. Mirrors the Electron archive:_exportRun
  // worker channel without the worker hop.
  api.archive.export = async (opts?: unknown) => {
    const o = opts as { gedcomVersion?: '5.5.1' | '7.0' } | undefined;
    const version = o?.gedcomVersion ?? '5.5.1';
    const r = await saveFile('Export Archive', 'family-tree.zip', ['zip'], 'Zip Archive');
    if (r.canceled || !r.path) return { canceled: true };
    try {
      const archiveMod = await import('../api/archive_export');
      const dbDir = (await dbDirFromPath()) ?? '';
      const mediaReader = async (relPath: string): Promise<Uint8Array | null> => {
        try {
          const abs = dbDir ? `${dbDir}/${relPath}` : relPath;
          const b64 = await unwrap(commands.fsReadBytesBase64(abs));
          return base64ToUint8Array(b64);
        } catch {
          return null;
        }
      };
      const { zipBytes, report } = await archiveMod.exportArchiveToBytes(
        getDb(),
        mediaReader,
        { gedcomVersion: version },
      );
      const b64 = uint8ArrayToBase64(zipBytes);
      await unwrap(commands.fsWriteBytesBase64(r.path, b64));
      return { exported: true, filePath: r.path, report };
    } catch (e) {
      return { canceled: false, error: String((e as Error)?.message || e) };
    }
  };

  // Archive import — open file dialog, read zip bytes via
  // `fs_read_bytes_base64`, hand them to the pure
  // `importArchiveFromBytes` helper. Each media entry is written through
  // a writer that resolves into the active DB's `<dbname>-media/` folder
  // using `fs_write_bytes_base64`. Mirrors archive:_importRun.
  api.archive.import = async () => {
    const r = await pickFile('Import Archive', ['zip'], 'Zip Archive');
    if (r.canceled || !r.path) return { canceled: true };
    try {
      const archiveMod = await import('../api/archive_import');
      const cur = await commands.dbCurrentPath();
      if (!cur) return { canceled: false, error: 'no DB open' };
      const dbDir = cur.replace(/[\\/][^\\/]+$/, '');
      const dbBase = (cur.split(/[\\/]/).pop() ?? '').replace(/\.(db|sqlite|sqlite3)$/i, '');
      const mediaFolderName = `${dbBase}-media`;
      const mediaDir = `${dbDir}/${mediaFolderName}`;

      const b64 = await unwrap(commands.fsReadBytesBase64(r.path));
      const zipBytes = base64ToUint8Array(b64);

      const mediaWriter = async (filename: string, bytes: Uint8Array): Promise<void> => {
        const dest = `${mediaDir}/${filename}`;
        const outB64 = uint8ArrayToBase64(bytes);
        await unwrap(commands.fsWriteBytesBase64(dest, outB64));
      };

      const report = await archiveMod.importArchiveFromBytes(
        getDb(),
        zipBytes,
        mediaFolderName,
        mediaWriter,
      );
      fireDataChanged();
      return { imported: true, filePath: r.path, report };
    } catch (e) {
      return { canceled: false, error: String((e as Error)?.message || e) };
    }
  };

  // Website export — `previewSnapshot` is auto-walked from the registry
  // (worker-shape, no Electron deps). `buildPreviewHtml` mirrors the
  // Electron handler in src/main/ipc/website-export.ts:59 — it builds a
  // full DB snapshot with media metadata, bakes the first 24 image
  // thumbnails into JPEG data URLs via the Rust `image` crate, and inlines
  // the result into a copy of dist-static/index.html that the renderer
  // drops into a Blob URL for the preview iframe.
  if (!api.website) api.website = {};
  api.website.buildPreviewHtml = async (opts: unknown) => {
    type BuildOpts = {
      siteTitle: string;
      focusPersonId: string | null;
      scope: { everyone?: boolean; focusId?: string; ancestors?: number; descendants?: number };
      options: { excludeLiving: boolean; redactLiving: boolean; mediaPersonOnly: boolean };
    };
    const o = opts as BuildOpts;
    const PREVIEW_THUMB_COUNT = 24;
    const IMG_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
    const snapshotMod = await import('../api/html_site/snapshot');
    const snapshot = await snapshotMod.buildSnapshot(getDb(), {
      siteTitle: o.siteTitle,
      focusPersonId: o.focusPersonId ?? '',
      scope: o.scope,
      options: {
        ...o.options,
        includeMedia: true,
        includeReports: false,
        includePrints: false,
      },
    }) as {
      meta: Record<string, unknown>;
      media: Array<{ id: string; file_ref: string | null; format?: string | null }>;
      mediaLinks: Array<{ media_id: string }>;
      mediaRegions: Array<{ media_id: string }>;
      settings: Record<string, string>;
    };
    const totalMediaInScope = snapshot.media.length;
    // Filter to image media (the Rust thumbnailer only handles raster
    // formats), trim to the preview cap, then bake.
    const imageRefs = snapshot.media
      .filter(m => {
        if (!m.file_ref) return false;
        const ext = (m.format ?? '').toLowerCase() ||
          (m.file_ref.split('.').pop() ?? '').toLowerCase();
        return IMG_EXTENSIONS.has(ext);
      })
      .slice(0, PREVIEW_THUMB_COUNT)
      .map(m => ({ id: m.id, fileRef: m.file_ref as string }));
    const previewMediaDataUrls = imageRefs.length === 0
      ? {} as Record<string, string>
      : await unwrap(commands.websiteBakePreviewThumbnails(imageRefs));
    // Trim media (and dependent rows) to the items we actually inlined,
    // matching the Electron handler's behaviour so the preview gallery
    // shows real photos and no broken images.
    const inlinedIds = new Set(Object.keys(previewMediaDataUrls));
    snapshot.media = snapshot.media.filter(m => inlinedIds.has(m.id));
    snapshot.mediaLinks = snapshot.mediaLinks.filter(ml => inlinedIds.has(ml.media_id));
    snapshot.mediaRegions = snapshot.mediaRegions.filter(r => inlinedIds.has(r.media_id));
    snapshot.meta = { ...snapshot.meta, previewMediaDataUrls };
    snapshot.settings = {
      ...snapshot.settings,
      preview_media_limit: String(PREVIEW_THUMB_COUNT),
      preview_media_total_linked: String(totalMediaInScope),
    };
    const html = await unwrap(commands.websiteLoadStaticIndexHtml());
    // Shared with the test harness via src/shared/preview-html-inject.ts.
    // Throws when the marker is missing — silent no-op was the original
    // failure mode (blank iframe with a `fetch ./data.json` error from
    // installStaticApi's last-resort dev path).
    const { injectSnapshotIntoHtml } = await import('../shared/preview-html-inject');
    return injectSnapshotIntoHtml(html, snapshot ?? null);
  };

  // website.export — full multi-file export to a user-chosen folder.
  // Mirrors the Electron handler in src/main/ipc/website-export.ts:
  //   1. Pick output dir (skipped when `_outputDir` is provided — used by
  //      e2e tests).
  //   2. Build the snapshot via the pure api/ helper.
  //   3. Copy media files into <outputDir>/media/full/<id>.<ext> via Rust.
  //   4. Trim the snapshot to the actually-copied media (no broken images
  //      in the static gallery).
  //   5. Gzip the snapshot JSON, base64 it, and inject into the dist-static
  //      index.html as `window.__SNAPSHOT_GZ__` before writing the result
  //      to <outputDir>/index.html.
  api.website.export = async (opts: unknown) => {
    type ExportOpts = {
      siteTitle: string;
      focusPersonId: string | null;
      scope: { everyone?: boolean; focusId?: string; ancestors?: number; descendants?: number };
      options: {
        includeMedia: boolean;
        excludeLiving: boolean;
        redactLiving: boolean;
        mediaPersonOnly: boolean;
      };
      _outputDir?: string;
    };
    const o = opts as ExportOpts;
    let outDir: string;
    if (o._outputDir) {
      outDir = o._outputDir;
    } else {
      const r = await pickFolder('Choose export folder');
      if (r.canceled || !r.path) return { canceled: true };
      outDir = r.path;
    }
    try {
      const snapshotMod = await import('../api/html_site/snapshot');
      const snapshot = await snapshotMod.buildSnapshot(getDb(), {
        siteTitle: o.siteTitle,
        focusPersonId: o.focusPersonId ?? '',
        scope: o.scope,
        options: {
          ...o.options,
          // The exporter snapshot deliberately mirrors the Electron handler's
          // includeMedia toggle: false drops every media row; true ships the
          // metadata and the per-file copy step decides what survives.
          includeMedia: o.options.includeMedia,
          includeReports: false,
          includePrints: false,
        },
      }) as {
        meta: Record<string, unknown>;
        media: Array<{ id: string; file_ref: string | null; format?: string | null }>;
        mediaLinks: Array<{ media_id: string }>;
        mediaRegions: Array<{ media_id: string }>;
        settings: Record<string, string>;
      };

      // Copy media into <outDir>/media/full/<id>.<ext>. Returns the IDs
      // that actually landed on disk so we can trim the snapshot below —
      // matches the Electron handler's `exportedMediaIds` Set.
      let exportedIds = new Set<string>();
      if (o.options.includeMedia && snapshot.media.length > 0) {
        const fullDir = `${outDir}/media/full`;
        const mediaRefs = snapshot.media
          .filter(m => !!m.file_ref)
          .map(m => ({ id: m.id, fileRef: m.file_ref as string }));
        const r = await unwrap(commands.websiteExportMedia(fullDir, mediaRefs));
        exportedIds = new Set(r.exportedIds);
      }

      if (o.options.includeMedia) {
        snapshot.media = snapshot.media.filter(m => exportedIds.has(m.id));
        snapshot.mediaLinks = snapshot.mediaLinks.filter(ml => exportedIds.has(ml.media_id));
        snapshot.mediaRegions = snapshot.mediaRegions.filter(r => exportedIds.has(r.media_id));
      } else {
        snapshot.media = [];
        snapshot.mediaLinks = [];
        snapshot.mediaRegions = [];
      }

      // Embed the gzipped snapshot as base64 in an inline <script> in
      // index.html (mirrors the Electron handler — the bootstrap reads
      // window.__SNAPSHOT_GZ__ and decompresses in-page so the file works
      // from file:// without a server fetch round-trip).
      const json = JSON.stringify(snapshot);
      const { gzipSync } = await import('fflate');
      const gzipped = gzipSync(textEncode(json), { level: 9 });
      const b64 = uint8ArrayToBase64(gzipped);

      const html = await unwrap(commands.websiteLoadStaticIndexHtml());
      const tag = `<script>window.__SNAPSHOT_GZ__=${JSON.stringify(b64)};</script>`;
      const injected = html.includes('</head>')
        ? html.replace('</head>', `${tag}</head>`)
        : `${tag}${html}`;
      await unwrap(commands.fsWriteText(`${outDir}/index.html`, injected));

      return { canceled: false, outputDir: outDir };
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      // The Electron handler treats a missing dist-static bundle as a
      // soft failure (`bundleMissing: true`). Mirror that so the renderer
      // UI's "Bundle missing" banner still surfaces.
      if (/dist-static\/index\.html not found/.test(msg)) {
        return { bundleMissing: true };
      }
      return { canceled: false, error: msg };
    }
  };

  if (!api.export) api.export = {};
  api.export.openFolder = async (folderPath: unknown) => {
    if (typeof folderPath !== 'string') return { ok: false };
    await unwrap(commands.shellReveal(folderPath));
    return { ok: true };
  };

  if (!api.csv) api.csv = {};

  // Backup: copy the active DB file to a user-chosen path. Mirrors the
  // Electron handler (src/main/ipc/database.ts → backup:backup) which uses
  // dialog.showSaveDialog + fs.copyFileSync. Restore picks an existing .db
  // file then switchTo's it (which triggers the regular UI reload path).
  if (!api.backup) api.backup = {};
  api.backup.backup = async () => {
    try {
      const currentPath = await commands.dbCurrentPath();
      if (!currentPath) return { success: false, error: 'No database open' };
      const base = (currentPath.split(/[\\/]/).pop() ?? 'family.db').replace(/\.db$/i, '');
      const today = new Date().toISOString().slice(0, 10);
      const defaultName = `${base}-backup-${today}.db`;
      const r = await saveFile('Spara säkerhetskopia', defaultName, ['db'], 'SQLite Database');
      if (r.canceled || !r.path) return { success: false, error: 'Cancelled' };
      await unwrap(commands.fsCopyFile(currentPath, r.path));
      return { success: true, path: r.path };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };
  api.backup.restore = async () => {
    try {
      const r = await pickFile('Välj säkerhetskopia', ['db'], 'SQLite Database');
      if (r.canceled || !r.path) return { success: false, error: 'Cancelled' };
      await switchDbTo(r.path, /* createSchema */ false);
      return { success: true, path: r.path };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };

  // Undo / Redo — main-only in Electron because they post-call broadcast
  // data:changed to all BrowserWindows. In Tauri, the renderer fires the
  // same fan-out via fireDataChanged() + the discrete undo events the
  // Electron preload exposes (`undo:changed`, `undo:performed`).
  if (!api.undo) api.undo = {};
  api.undo.undo = async () => {
    const label = await undoManager.undo();
    fireDataChanged();
    fireUndoChanged();
    if (label) fireUndoPerformed({ type: 'undo', label });
    return label;
  };
  api.undo.redo = async () => {
    const label = await undoManager.redo();
    fireDataChanged();
    fireUndoChanged();
    if (label) fireUndoPerformed({ type: 'redo', label });
    return label;
  };
  api.undo.onChanged = (cb: unknown) => {
    if (typeof cb === 'function') undoChangedListeners.push(cb as () => void);
  };
  api.undo.onPerformed = (cb: unknown) => {
    if (typeof cb === 'function') undoPerformedListeners.push(cb as (data: { type: string; label: string }) => void);
  };

  // Print + PDF export. Tauri 2 doesn't have webContents.printToPDF —
  // fall back to window.print() which opens the native print dialog
  // (with a Save-as-PDF option in macOS / Windows). Argument is ignored
  // because the user picks the destination in the dialog.
  // Chart bridge — useChartBridge composable registers callbacks via
  // window.api.chart.onXxx(handler). In Electron those wire ipcRenderer.on;
  // here we store them on a global so the UI server's /chart/* endpoints
  // can eval them via `window.__chartBridge.<name>()`.
  type ChartHandlers = {
    getVisiblePersons?: () => unknown;
    selectPerson?: (args: { person_id?: string; name?: string }) => unknown;
    focusPerson?: (args: { person_id: string }) => unknown;
    getLayout?: () => unknown;
  };
  const chartBridge: ChartHandlers = {};
  (window as Window & { __chartBridge?: ChartHandlers }).__chartBridge = chartBridge;
  if (!api.chart) api.chart = {};
  api.chart.onGetVisiblePersons = (cb: unknown) => { chartBridge.getVisiblePersons = cb as () => unknown; };
  api.chart.onSelectPerson = (cb: unknown) => { chartBridge.selectPerson = cb as (a: { person_id?: string; name?: string }) => unknown; };
  api.chart.onFocusPerson = (cb: unknown) => { chartBridge.focusPerson = cb as (a: { person_id: string }) => unknown; };
  api.chart.onGetLayout = (cb: unknown) => { chartBridge.getLayout = cb as () => unknown; };
  api.chart.removeAllChartHandlers = () => {
    delete chartBridge.getVisiblePersons;
    delete chartBridge.selectPerson;
    delete chartBridge.focusPerson;
    delete chartBridge.getLayout;
  };
  // Chart export — Reports view's "Save SVG" passes a serialised SVG
  // string + filename hint. Mirrors the Electron handler shape in
  // src/main/ipc/main-only.ts → chart:saveSvg.
  api.chart.saveSvg = async (svgContent: unknown, fileNameHint?: unknown) => {
    if (typeof svgContent !== 'string') return { success: false, error: 'svgContent must be string' };
    const r = await saveFile('Save Wall Chart SVG', (typeof fileNameHint === 'string' ? fileNameHint : 'chart.svg'), ['svg'], 'SVG');
    if (r.canceled || !r.path) return { success: false, error: 'Cancelled' };
    try {
      await unwrap(commands.fsWriteText(r.path, svgContent));
      return { success: true, path: r.path };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };
  // Chart PDF: Tauri 2 has no equivalent of Electron's hidden BrowserWindow
  // + webContents.printToPDF. Fall back to window.print() (matches the
  // existing print.exportPdf polyfill); user picks "Save as PDF" in the
  // native dialog. Regression: filename hint and explicit page-size are
  // ignored, and the user has to manually choose PDF in the print dialog.
  api.chart.savePdf = async (_svgContent: unknown, _pxWidth: unknown, _pxHeight: unknown, _fileNameHint?: unknown) => {
    window.print();
    return { success: true, note: 'Use Save-as-PDF in the native print dialog' };
  };

  if (!api.print) api.print = {};
  api.print.print = async () => { window.print(); return { ok: true }; };
  api.print.exportPdf = async () => {
    // Same dialog as print.print — user clicks "Save as PDF" in it.
    window.print();
    return { ok: true, note: 'Use Save-as-PDF in the native print dialog' };
  };

  if (!api.app) api.app = {};
  api.app.getVersion = async () => {
    try {
      return await commands.appVersion();
    } catch {
      return 'unknown';
    }
  };
  api.app.openExternal = async (url: unknown) => {
    if (typeof url !== 'string') return;
    // Use the Rust opener plugin's invoke surface directly so we don't
    // pull another @tauri-apps/* npm package into the renderer.
    await invoke('plugin:opener|open_url', { url }).catch(() => { /* ignore */ });
  };
  api.app.onOpenAbout = () => { /* menu wires this in main.ts */ };
  api.app.readThirdPartyLicenses = async () => {
    // The file is bundled as a Tauri resource (see src-tauri/tauri.conf.json
    // → bundle.resources). In packaged builds Tauri places it inside the
    // app's Resources/_up_/ folder; the Rust command resolves both that
    // and the flat layout. In `tauri dev` the resource isn't packaged, so
    // invoke fails — return '' so Settings → About shows an empty viewer
    // rather than a hard error.
    try {
      return await unwrap(commands.readBundledResource('THIRD_PARTY_LICENSES.txt'));
    } catch {
      return '';
    }
  };

  // Auto-update polyfill. Calls the tauri-plugin-updater plugin via its
  // invoke surface so we don't bloat the renderer bundle with the
  // @tauri-apps/plugin-updater wrapper. Returns a normalized shape the
  // renderer-side toast in main.ts consumes.
  //
  // In `tauri dev` (no signed update manifest reachable), the underlying
  // invoke throws — we swallow the error and return { available: false }
  // so the boot path doesn't crash. In packaged builds against a real
  // GitHub Releases endpoint, errors are still swallowed (the user sees
  // the warning in the console; we don't bother them with a toast for
  // "couldn't reach update server").
  api.app.checkForUpdates = async () => {
    try {
      const update = await invoke<
        { available: boolean; currentVersion?: string; version?: string; body?: string } | null
      >('plugin:updater|check');
      if (!update || !update.available) {
        return { available: false };
      }
      return {
        available: true,
        version: update.version ?? '',
        body: update.body ?? '',
      };
    } catch (e) {
      // Includes "no_update_available", network errors, manifest not signed
      // (dev mode with placeholder pubkey), etc. Treat all as "no update".
      console.warn('[updater] check failed:', e);
      return { available: false };
    }
  };

  api.app.downloadAndInstallUpdate = async () => {
    try {
      await invoke('plugin:updater|download_and_install');
      return { ok: true };
    } catch (e) {
      console.error('[updater] download/install failed:', e);
      return { ok: false, error: String(e) };
    }
  };

  // Onboarding ("seen" callout state). The Electron build stores this in the
  // per-user settings.json (src/main/ipc/onboarding.ts → loadSettings); the
  // Tauri build keeps it per-DB in db_settings under a single JSON object so
  // the data lives alongside the genealogist's database, not a sibling
  // settings file Tauri doesn't have. Same shape as the Electron preload:
  // getSeen → Record<string, true>, markSeen(key) → void.
  if (!api.onboarding) api.onboarding = {};
  const ONBOARDING_KEY = 'onboarding-seen';
  api.onboarding.getSeen = async () => {
    const dbSet = await import('../api/db_settings');
    const raw = await dbSet.getDbSetting(getDb(), ONBOARDING_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed as Record<string, true> : {};
    } catch {
      return {};
    }
  };
  api.onboarding.markSeen = async (keyArg: unknown) => {
    // Preload signature: markSeen(key: string) — no wrapping object.
    const key = typeof keyArg === 'string'
      ? keyArg
      : (keyArg as { key?: string } | undefined)?.key;
    if (!key) return;
    const dbSet = await import('../api/db_settings');
    const raw = await dbSet.getDbSetting(getDb(), ONBOARDING_KEY);
    let current: Record<string, true> = {};
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') current = parsed as Record<string, true>;
      } catch { /* ignore — start fresh */ }
    }
    current[key] = true;
    await dbSet.setDbSetting(getDb(), ONBOARDING_KEY, JSON.stringify(current));
  };
  api.onboarding.reset = async () => {
    const dbSet = await import('../api/db_settings');
    await dbSet.deleteDbSetting(getDb(), ONBOARDING_KEY);
  };

  api.csv.export = async (opts: unknown) => {
    const o = opts as { entityType?: string; delimiter?: string; encoding?: 'utf-8' | 'utf-8-bom' } | undefined;
    if (!o?.entityType) return { success: false, error: 'entityType is required' };
    const defaultNames: Record<string, string> = {
      persons: 'persons.csv', events: 'events.csv', sources: 'sources.csv', places: 'places.csv',
    };
    const defaultName = defaultNames[o.entityType];
    if (!defaultName) return { success: false, error: 'Unknown entityType: ' + o.entityType };
    const r = await saveFile('Export CSV', defaultName, ['csv'], 'CSV Files');
    if (r.canceled || !r.path) return { canceled: true };
    try {
      // Direct call into the csv_export api/ helpers — the Electron-era
      // csv:_exportRun worker channel that used to wrap them is gone.
      const csvMod = await import('../api/csv_export');
      const csvOptions: import('../api/csv_export').CsvOptions = {
        delimiter: o.delimiter ?? ',',
        encoding: o.encoding ?? 'utf-8',
      };
      let csv: string;
      switch (o.entityType) {
        case 'persons':
          csv = await csvMod.exportPersonsCsv(getDb(), csvOptions);
          break;
        case 'events':
          csv = await csvMod.exportEventsCsv(getDb(), csvOptions);
          break;
        case 'sources':
          csv = await csvMod.exportSourcesCsv(getDb(), csvOptions);
          break;
        case 'places':
          csv = await csvMod.exportPlacesCsv(getDb(), csvOptions);
          break;
        default:
          return { success: false, error: 'Unknown entityType: ' + o.entityType };
      }
      const encoding = o.encoding ?? 'utf-8';
      const csvOut = encoding === 'utf-8-bom' ? '﻿' + csv : csv;
      await unwrap(commands.fsWriteText(r.path, csvOut));
      return { success: true, filePath: r.path };
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) };
    }
  };

  // Top-level entries on window.api that the composables call directly.
  // useEntityData / usePagedList / App.vue badge debouncer all call
  // `window.api.onDataChanged(cb)`. Without this assignment the polyfill
  // walks every channel but the cross-view reactivity contract breaks.
  (api as unknown as { onDataChanged: (cb: () => void) => void }).onDataChanged =
    (cb: () => void) => { dataChangedListeners.push(cb); };
  // Match the preload's name exactly (offDataChanged, not off).
  (api as unknown as { offDataChanged: (cb: () => void) => void }).offDataChanged =
    (cb: () => void) => {
      const idx = dataChangedListeners.indexOf(cb);
      if (idx >= 0) dataChangedListeners.splice(idx, 1);
    };

  // window.api gets the polyfilled shape. The Electron-only
  // onDataChanged subscription mechanism is exposed too so existing
  // renderer composables (useEntityData, usePagedList) keep working.
  (globalThis as unknown as { api: typeof api }).api = api;

  return {
    api,
    onDataChanged: (cb: () => void) => { dataChangedListeners.push(cb); },
  };
}

function textEncode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Chunked btoa to avoid call-stack overflow on large arrays (zip blobs
  // can be tens of MB). 32 KiB chunks comfortably stay under the
  // String.fromCharCode arg limit on every browser.
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    bin += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return btoa(bin);
}

function deriveDbName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.(db|sqlite|sqlite3)$/i, '');
}

async function switchDbTo(path: string, createSchema: boolean): Promise<void> {
  // Close + reopen the global rusqlite connection on the Rust side.
  await commands.dbClose();
  await unwrap(commands.dbOpen(path));
  // The shim's `dbInstance` is a renderer-side handle that proxies to the
  // global Rust connection — no per-instance state, so no re-construction
  // needed. Just (re-)init schema if creating new, then refresh the UI.
  if (createSchema && dbInstance) {
    await initializeSchema(dbInstance);
  }
  // Update recent-files list (per-DB store, so reads back the row from
  // whichever DB is now active). Cap at 10 entries, dedupe by path,
  // newest first. Failures are silent — recent-files is non-essential.
  try {
    if (dbInstance) {
      const dbSet = await import('../api/db_settings');
      const raw = await dbSet.getDbSetting(dbInstance, 'recent_dbs');
      const existing = raw ? (JSON.parse(raw) as Array<{ path: string; name: string; lastOpenedAt?: string }>) : [];
      const filtered = existing.filter(e => e?.path !== path);
      const next = [{ path, name: deriveDbName(path), lastOpenedAt: new Date().toISOString() }, ...filtered].slice(0, 10);
      await dbSet.setDbSetting(dbInstance, 'recent_dbs', JSON.stringify(next));
    }
  } catch { /* ignore — recent-files is best-effort */ }
  fireDbSwitched();
  fireDataChanged();
}
