# TypeScript window.api Typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unsafe `declare const window: Window & { api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> }` pattern in 37 renderer components with a single authoritative typed declaration, giving full IDE autocomplete and compile-time safety.

**Architecture:** Create `src/renderer/api.d.ts` as a global ambient declaration that augments the `Window` interface with a fully-typed `api` property mirroring the preload surface. Components then use `window.api` without any local `declare const window` override.

**Tech Stack:** TypeScript ambient module declarations, types from `src/api/types.ts`

---

### Task 1: Create src/renderer/api.d.ts

**Files:**
- Create: `src/renderer/api.d.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/renderer/api.d.ts
// Typed declaration for window.api, matching src/preload/index.ts exactly.
// Do NOT import from this file — it augments the global Window interface automatically.

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
  GroupMember,
  Repository,
  ResearchTask,
  Media,
  MediaLink,
} from '../../api/types';

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
    api: {
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
        search: (query: string) => Promise<PersonWithNames[]>;
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
        getCurrent: () => Promise<string | null>;
        getRecent: () => Promise<string[]>;
        createNew: () => Promise<string | null>;
        openExisting: () => Promise<string | null>;
        switchTo: (dbPath: string) => Promise<void>;
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
        getPath: (id: string) => Promise<Place[]>;
      };
      groups: {
        list: () => Promise<Group[]>;
        get: (id: string) => Promise<Group | null>;
        create: (data: { name: string; notes?: string }) => Promise<Group>;
        update: (id: string, data: { name?: string; notes?: string }) => Promise<Group | null>;
        delete: (id: string) => Promise<boolean>;
        addMember: (groupId: string, personId: string) => Promise<GroupMember>;
        removeMember: (groupId: string, personId: string) => Promise<boolean>;
        getMembers: (groupId: string) => Promise<GroupMember[]>;
        forPerson: (personId: string) => Promise<Group[]>;
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
        create: (data: {
          task: string;
          notes?: string;
          result?: string;
          person_id?: string;
          priority?: number;
          status?: ResearchTask['status'];
        }) => Promise<ResearchTask>;
        update: (
          id: string,
          data: Partial<Pick<ResearchTask, 'task' | 'notes' | 'result' | 'status' | 'priority'>>,
        ) => Promise<ResearchTask | null>;
        delete: (id: string) => Promise<boolean>;
      };
      checks: {
        runAll: () => Promise<CheckResult[]>;
        forPerson: (personId: string) => Promise<CheckResult[]>;
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
        attach: (data?: { entity_type?: string; entity_id?: string }) => Promise<Media | null>;
        openFile: (id: string) => Promise<void>;
        getFilePath: (id: string) => Promise<string | null>;
        readAsDataUrl: (id: string) => Promise<string | null>;
      };
      print: {
        print: () => Promise<void>;
        exportPdf: (path?: string) => Promise<string | null>;
      };
      backup: {
        backup: () => Promise<string | null>;
        restore: () => Promise<void>;
      };
      onDataChanged: (cb: () => void) => void;
    };
  }
}
```

- [ ] **Step 2: Verify TypeScript can resolve the import path**

Run: `npx tsc --noEmit`
Expected: No errors on api.d.ts itself. (There will be errors in components until step 3.)

---

### Task 2: Remove declare const window from all components

**Files:**
- Modify: All renderer `.vue` and `.ts` files containing `declare const window`

- [ ] **Step 1: Find all occurrences**

Run:
```bash
grep -rn "declare const window" src/renderer/ --include="*.vue" --include="*.ts"
```
Note every file path returned. These are all files to edit.

- [ ] **Step 2: Remove the declaration block from each file**

For each file listed, delete the following block (exact content may vary slightly but follows this pattern):
```typescript
declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};
```

The global `Window` augmentation in `api.d.ts` makes this unnecessary — TypeScript resolves `window.api` via the ambient declaration automatically.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Zero errors. If you see "Property 'X' does not exist on type 'Y'", the method name is wrong — check `api.d.ts` against `src/preload/index.ts`.

---

### Task 3: Remove explicit type casts from API calls

**Files:**
- Modify: Any `.vue` file that still uses `as SomeType` casts on `window.api` call results

- [ ] **Step 1: Find remaining casts**

Run:
```bash
grep -rn "window.api\." src/renderer/ --include="*.vue" -A1 | grep " as "
```

- [ ] **Step 2: Remove casts**

For each hit, remove the `as SomeType` suffix. Example:

Before:
```typescript
const persons = (await window.api.persons.list()) as Array<{ id: string; given_name: string }>;
```

After:
```typescript
const persons = await window.api.persons.list();
// Type is now PersonWithNames[] from api.d.ts — no cast needed
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: Zero errors.

---

### Task 4: Run tests and commit

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: All tests pass (api.d.ts only affects renderer types; backend tests are unaffected).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(renderer): typed window.api via ambient declaration in api.d.ts

Replace unsafe Record<string,Record<string,...>> window declarations in
37 renderer components with a single authoritative api.d.ts that mirrors
the preload surface with proper domain types from src/api/types.ts."
```