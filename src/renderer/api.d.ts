// src/renderer/api.d.ts
// Typed declaration for window.api.
// Do NOT import from this file — it augments the global Window interface automatically.
//
// Architecture note (post-Specta migration):
// - Rust-backed commands (db_*, fs_*, dialog_*, media_*) are typed by Specta in
//   `./bindings.ts`. The renderer-facing wrappers in `tauri-window-api.ts`
//   delegate to those generated types.
// - Renderer-local handlers (persons.list, events.create, …) are explicitly
//   typed below. The Electron-era `ApiSurface<typeof channelRegistry>` derivation
//   was retired alongside `src/shared/channels/`.
// - LooseFallback catches any other unknown keys (e.g. third-party extensions).

import type {
  Person,
  PersonName,
  PersonIdentifier,
  Relationship,
  EventParticipant,
  GenealogyEvent,
  Place,
  Source,
  Citation,
  Group,
  GroupLink,
  LinkEntityType,
  Repository,
  ResearchTask,
  TaskLink,
  Media,
  MediaLink,
  Note,
  NoteLink,
  NoteEntityType,
  PersonAssociation,
  PersonAssociationRole,
  NameTranslation,
  PlaceTranslation,
} from '../../api/types';

type LooseFallback = Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;

export type PersonWithNames = Person & { given_name: string | null; surname: string | null };

export type RelationshipWithNames = Relationship & {
  person1_given_name: string | null;
  person1_surname: string | null;
  person2_given_name: string | null;
  person2_surname: string | null;
};

export type MediaWithLink = Media & { link_id: string; link_type: number | null };

export interface CheckResult {
  person_id: string;
  check_id: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

declare global {
  interface Window {
    api: LooseFallback & {
      persons: {
        create: (data: {
          sex?: 'M' | 'F' | 'U';
          living?: boolean;
          notes?: string;
          given_name?: string;
          surname?: string;
        }) => Promise<Person>;
        get: (id: string) => Promise<Person | null>;
        list: () => Promise<PersonWithNames[]>;
        listPage: (limit: number, offset: number) => Promise<PersonWithNames[]>;
        update: (id: string, data: Partial<Pick<Person, 'sex' | 'living' | 'notes'>>) => Promise<Person | null>;
        delete: (id: string) => Promise<boolean>;
        search: (query: string, relateeId?: string | null) => Promise<(PersonWithNames & {
          preferred_name: string | null;
          nickname: string | null;
          relation_role: 'parent' | 'child' | 'partner' | 'sibling' | 'godparent' | null;
          birth_year: string | null;
          death_year: string | null;
        })[]>;
        searchWithDetails: (query: string) => Promise<PersonWithNames[]>;
        addName: (
          personId: string,
          data: Partial<Omit<PersonName, 'id' | 'person_id'>>,
        ) => Promise<PersonName>;
        getNames: (personId: string) => Promise<PersonName[]>;
        updateName: (id: string, data: Partial<Omit<PersonName, 'id' | 'person_id'>>) => Promise<PersonName | null>;
        deleteName: (id: string) => Promise<boolean>;
        addIdentifier: (
          personId: string,
          data: Pick<PersonIdentifier, 'identifier_type' | 'identifier_value'>,
        ) => Promise<PersonIdentifier>;
        getIdentifiers: (personId: string) => Promise<PersonIdentifier[]>;
        deleteIdentifier: (id: string) => Promise<boolean>;
      };
      relationships: {
        create: (data: {
          type: Relationship['type'];
          person1_id?: string;
          person2_id?: string;
          subtype?: string;
          notes?: string;
        }) => Promise<Relationship>;
        get: (id: string) => Promise<Relationship | null>;
        list: () => Promise<Relationship[]>;
        listPage: (limit: number, offset: number) => Promise<Relationship[]>;
        update: (
          id: string,
          data: Partial<Pick<Relationship, 'type' | 'person1_id' | 'person2_id' | 'subtype' | 'notes'>>,
        ) => Promise<Relationship | null>;
        delete: (id: string) => Promise<boolean>;
        getForPerson: (personId: string) => Promise<Relationship[]>;
        search: (query: string) => Promise<RelationshipWithNames[]>;
      };
      eventParticipants: {
        add: (data: {
          event_id: string;
          person_id: string;
          role?: EventParticipant['role'];
        }) => Promise<EventParticipant>;
        getForEvent: (eventId: string) => Promise<EventParticipant[]>;
        remove: (id: string) => Promise<boolean>;
      };
      personAssociations: {
        create: (data: {
          person_id: string;
          related_person_id: string;
          role: PersonAssociationRole;
          notes?: string;
        }) => Promise<PersonAssociation>;
        get: (id: string) => Promise<PersonAssociation | null>;
        forPerson: (personId: string) => Promise<PersonAssociation[]>;
        toPerson: (personId: string) => Promise<PersonAssociation[]>;
        update: (
          id: string,
          data: Partial<Pick<PersonAssociation, 'role' | 'notes' | 'person_id' | 'related_person_id'>>,
        ) => Promise<PersonAssociation | null>;
        delete: (id: string) => Promise<boolean>;
      };
      events: {
        create: (data: Partial<Omit<GenealogyEvent, 'id' | 'created_at' | 'updated_at'>>) => Promise<GenealogyEvent>;
        get: (id: string) => Promise<GenealogyEvent | null>;
        forPerson: (personId: string) => Promise<GenealogyEvent[]>;
        forRelationship: (relationshipId: string) => Promise<GenealogyEvent[]>;
        update: (id: string, data: Partial<Omit<GenealogyEvent, 'id' | 'created_at' | 'updated_at'>>) => Promise<GenealogyEvent | null>;
        delete: (id: string) => Promise<boolean>;
      };
      sources: {
        create: (data: Partial<Omit<Source, 'id' | 'created_at' | 'updated_at'>>) => Promise<Source>;
        get: (id: string) => Promise<Source | null>;
        list: () => Promise<Source[]>;
        update: (id: string, data: Partial<Omit<Source, 'id' | 'created_at' | 'updated_at'>>) => Promise<Source | null>;
        delete: (id: string) => Promise<boolean>;
        search: (query: string) => Promise<Source[]>;
      };
      citations: {
        create: (data: {
          source_id: string;
          event_id?: string;
          person_id?: string;
          relationship_id?: string;
          place_id?: string;
          page?: string;
          confidence?: number;
          transcription?: string;
          notes?: string;
          date_accessed?: string;
        }) => Promise<Citation>;
        get: (id: string) => Promise<Citation | null>;
        forSource: (sourceId: string) => Promise<Citation[]>;
        forEvent: (eventId: string) => Promise<Citation[]>;
        forPerson: (personId: string) => Promise<Citation[]>;
        forRelationship: (relationshipId: string) => Promise<Citation[]>;
        forPlace: (placeId: string) => Promise<Citation[]>;
        delete: (id: string) => Promise<boolean>;
        update: (id: string, updates: Partial<Omit<Citation, 'id' | 'source_id' | 'created_at'>>) => Promise<Citation | null>;
      };
      gedcom: {
        import: (opts?: { profile?: string }) => Promise<{
          imported: number;
          skipped: number;
          errors: string[];
          warnings: string[];
        } | null>;
        export: () => Promise<{ path: string } | null>;
      };
      import: {
        genneyCheckDocker: () => Promise<boolean>;
        genneySelectDerby: () => Promise<string | null>;
        genneySelectArchive: () => Promise<string | null>;
        genneyDiscover: (opts: { path: string }) => Promise<Record<string, unknown>>;
        genneyRun: (opts: Record<string, unknown>) => Promise<{ imported: number; errors: string[] }>;
        onProgress: (cb: (msg: string) => void) => void;
        holgerSelectFile: () => Promise<string | null>;
        holgerSelectMedia: () => Promise<string | null>;
        holgerRun: (opts: Record<string, unknown>) => Promise<{ imported: number; errors: string[] }>;
        holgerEdbSelectDir: () => Promise<string | null>;
        holgerEdbRun: (opts: Record<string, unknown>) => Promise<{ imported: number; errors: string[] }>;
        onHolgerProgress: (cb: (msg: string) => void) => void;
      };
      db: {
        getCurrent: () => Promise<{ path: string; name: string }>;
        getRecent: () => Promise<{ path: string; name: string }[]>;
        createNew: () => Promise<{ path: string; name: string } | { canceled: true }>;
        openExisting: () => Promise<{ path: string; name: string } | { canceled: true }>;
        switchTo: (dbPath: string) => Promise<{ path: string; name: string }>;
        onSwitched: (cb: () => void) => void;
      };
      places: {
        create: (data: Partial<Omit<Place, 'id' | 'normalized_name'>>) => Promise<Place>;
        get: (id: string) => Promise<Place | null>;
        list: () => Promise<Place[]>;
        search: (query: string) => Promise<Place[]>;
        update: (id: string, data: Partial<Omit<Place, 'id' | 'normalized_name'>>) => Promise<Place | null>;
        delete: (id: string) => Promise<boolean>;
        findOrCreate: (name: string) => Promise<Place>;
        getPath: (id: string) => Promise<string>;
      };
      groups: {
        list: () => Promise<Group[]>;
        get: (id: string) => Promise<Group | null>;
        create: (data: { name: string; notes?: string }) => Promise<Group>;
        update: (id: string, data: { name?: string; notes?: string }) => Promise<Group | null>;
        delete: (id: string) => Promise<boolean>;
        addLink: (groupId: string, entityType: LinkEntityType, entityId: string) => Promise<GroupLink>;
        removeLink: (linkId: string) => Promise<boolean>;
        removeLinkByEntity: (groupId: string, entityType: LinkEntityType, entityId: string) => Promise<boolean>;
        getLinks: (groupId: string) => Promise<GroupLink[]>;
        forPerson: (personId: string) => Promise<Group[]>;
        forPlace: (placeId: string) => Promise<Group[]>;
        forMedia: (mediaId: string) => Promise<Group[]>;
      };
      notes: {
        list: () => Promise<Note[]>;
        get: (id: string) => Promise<Note | null>;
        create: (data: { text: string; language?: string }) => Promise<Note>;
        update: (id: string, data: { text?: string; language?: string }) => Promise<Note | null>;
        delete: (id: string) => Promise<boolean>;
        forEntity: (entityType: NoteEntityType, entityId: string) => Promise<Note[]>;
      };
      noteLinks: {
        link: (noteId: string, entityType: NoteEntityType, entityId: string) => Promise<NoteLink>;
        unlink: (noteId: string, entityType: NoteEntityType, entityId: string) => Promise<boolean>;
        forNote: (noteId: string) => Promise<NoteLink[]>;
      };
      nameTranslations: {
        forName: (personNameId: string) => Promise<NameTranslation[]>;
        create: (data: { person_name_id: string; value: string; language?: string; transliteration_scheme?: string }) => Promise<NameTranslation>;
        update: (id: string, updates: Partial<Pick<NameTranslation, 'value' | 'language' | 'transliteration_scheme'>>) => Promise<NameTranslation | null>;
        delete: (id: string) => Promise<boolean>;
      };
      placeTranslations: {
        forPlace: (placeId: string) => Promise<PlaceTranslation[]>;
        create: (data: { place_id: string; value: string; language?: string; transliteration_scheme?: string }) => Promise<PlaceTranslation>;
        update: (id: string, updates: Partial<Pick<PlaceTranslation, 'value' | 'language' | 'transliteration_scheme'>>) => Promise<PlaceTranslation | null>;
        delete: (id: string) => Promise<boolean>;
      };
      repositories: {
        list: () => Promise<Repository[]>;
        get: (id: string) => Promise<Repository | null>;
        create: (data: Partial<Omit<Repository, 'id' | 'created_at'>>) => Promise<Repository>;
        update: (id: string, data: Partial<Omit<Repository, 'id' | 'created_at'>>) => Promise<Repository | null>;
        delete: (id: string) => Promise<boolean>;
        forSource: (sourceId: string) => Promise<Repository[]>;
        linkSource: (sourceId: string, repoId: string) => Promise<void>;
        unlinkSource: (sourceId: string, repoId: string) => Promise<boolean>;
      };
      researchTasks: {
        list: () => Promise<ResearchTask[]>;
        get: (id: string) => Promise<ResearchTask | null>;
        forPerson: (personId: string) => Promise<ResearchTask[]>;
        forPlace: (placeId: string) => Promise<ResearchTask[]>;
        forMedia: (mediaId: string) => Promise<ResearchTask[]>;
        create: (data: {
          task: string;
          notes?: string;
          result?: string;
          priority?: number;
          status?: ResearchTask['status'];
        }) => Promise<ResearchTask>;
        update: (
          id: string,
          data: Partial<Pick<ResearchTask, 'task' | 'notes' | 'result' | 'status' | 'priority'>>,
        ) => Promise<ResearchTask | null>;
        delete: (id: string) => Promise<boolean>;
        addLink: (taskId: string, entityType: LinkEntityType, entityId: string) => Promise<TaskLink>;
        removeLink: (linkId: string) => Promise<boolean>;
        getLinks: (taskId: string) => Promise<TaskLink[]>;
      };
      checks: {
        runAll: () => Promise<CheckResult[]>;
        forPerson: (personId: string) => Promise<CheckResult[]>;
        forPlace: (placeId: string) => Promise<CheckResult[]>;
        forMedia: (mediaId: string) => Promise<CheckResult[]>;
        runForEvent: (eventId: string) => Promise<CheckResult[]>;
      };
      media: {
        list: () => Promise<Media[]>;
        get: (id: string) => Promise<Media | null>;
        create: (data: {
          title: string;
          file_ref?: string;
          format?: string;
          notes?: string;
          is_printable?: boolean;
        }) => Promise<Media>;
        delete: (id: string) => Promise<boolean>;
        forEntity: (entityType: string, entityId: string) => Promise<MediaWithLink[]>;
        addLink: (data: {
          media_id: string;
          entity_type: string;
          entity_id: string;
          link_type?: number;
        }) => Promise<MediaLink>;
        removeLink: (linkId: string) => Promise<boolean>;
        attach: (data?: { entityType?: string; entityId?: string }) => Promise<{ canceled: false; media: Media } | { canceled: true }>;
        openFile: (id: string) => Promise<void>;
        getFilePath: (id: string) => Promise<string | null>;
        readAsDataUrl: (id: string) => Promise<string | null>;
        thumbnailDataUrl: (fileRef: string, maxWidth?: number) => Promise<string | null>;
      };
      print: {
        print: () => Promise<void>;
        exportPdf: (path?: string) => Promise<string | null>;
      };
      app: {
        getVersion: () => Promise<string>;
        openExternal: (url: string) => Promise<void>;
        onOpenAbout: (cb: () => void) => void;
        readThirdPartyLicenses: () => Promise<string>;
      };
      backup: {
        backup: () => Promise<{ success: boolean; path?: string; error?: string }>;
        restore: () => Promise<{ success: boolean; path?: string; error?: string }>;
      };
      onboarding: {
        getSeen(): Promise<Record<string, true>>;
        markSeen(key: string): Promise<void>;
        reset(): Promise<void>;
      };
      onDataChanged: (cb: () => void) => void;
      offDataChanged: (cb: () => void) => void;
    };
  }
}
