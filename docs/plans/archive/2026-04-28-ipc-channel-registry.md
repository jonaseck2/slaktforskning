# IPC Channel Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 3-layer string-keyed IPC boilerplate (handler file + worker dispatch + preload + window.api types) with a single typed channel registry.

**Architecture:** A central `src/shared/channels/` package defines every channel as a typed object: `{ name, args: ZodSchema | runtime-noop, handler: (db, args) => result, thread: 'worker' | 'main' }`. The worker, the main-thread IPC bootstrapper, and the preload bridge all consume the same registry. The renderer's `window.api` type is derived from the registry, so renaming a channel is a compile-time error in every consumer.

**Tech Stack:** TypeScript, Electron, Vitest. No new runtime dependencies.

---

## Why this first

Adding any new IPC channel currently requires synchronized edits in `src/main/ipc/<domain>.ts`, `src/main/db-worker.ts`, `src/preload/index.ts`, and any renderer file that re-declares `window.api`. The renderer's `window.api` is typed as `Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>` in 8+ files, so typos in channel names are runtime errors. The coverage test (`tests/unit/ipc-worker-coverage.test.ts`) only catches missing worker entries via a fragile regex (`[a-zA-Z]+:[a-zA-Z]+`).

After this refactor:
- One file per domain registers all its channels.
- Adding a channel = adding one entry. The dispatcher, preload, and types are derived.
- Renaming a channel breaks the build everywhere it is used.
- The coverage test and the static-SPA stub parity test both walk the registry directly.

## File Structure

```
src/shared/channels/
├── types.ts              # ChannelDef, ThreadMode, RegistryEntry types
├── registry.ts           # registry: Record<string, ChannelDef>; defineChannel<A,R>(...)
├── persons.ts            # persons:* channel definitions (data + handler refs)
├── places.ts
├── events.ts
├── sources.ts            # sources:* + citations:*
├── relationships.ts
├── utility.ts            # groups, repos, tasks, reports, undo
├── media.ts
├── gazetteers.ts
├── database.ts
├── import.ts             # gedcom, archive, holger, genney
└── index.ts              # barrel export of merged registry

src/main/ipc/index.ts     # auto-registers from registry, no per-domain wiring
src/main/db-worker.ts     # dispatch table generated from registry
src/preload/index.ts      # window.api built from registry walk
```

Files removed at end of plan:
- `src/main/ipc/persons.ts`, `places.ts`, `events.ts`, `sources.ts`, `relationships.ts`, `utility.ts`, `media.ts`, `gazetteers.ts` (DB channels move into registry; main-only handlers stay in `src/main/ipc/main-only.ts`)
- `src/renderer/api.d.ts` if it duplicates types now derived from the registry

## Conventions

- TDD: write the failing test, run it, see it fail, implement, see it pass, commit.
- Run `npm run lint` and `npx vitest run tests/unit/ipc-worker-coverage.test.ts tests/unit/channels-registry.test.ts` after each task. Both must be green.
- After every domain migration, run `npm run test:e2e` (the packaged-app smoke test catches integration breakage).
- Conventional commits: `refactor(ipc):` for migrations, `feat(ipc):` for new infrastructure, `test(ipc):` for test-only.
- Never commit a partial migration. Each task ends in a green tree.

---

## Task 1: Channel registry scaffold

**Files:**
- Create: `src/shared/channels/types.ts`
- Create: `src/shared/channels/registry.ts`
- Create: `tests/unit/channels-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/channels-registry.test.ts
import { describe, it, expect } from 'vitest';
import { defineChannel, channelRegistry } from '../../src/shared/channels/registry';

describe('channel registry', () => {
  it('registers a channel and stores its handler + thread mode', () => {
    const ch = defineChannel({
      name: 'test:echo',
      thread: 'worker',
      handler: (_db, msg: string) => msg.toUpperCase(),
    });
    expect(ch.name).toBe('test:echo');
    expect(channelRegistry['test:echo']).toBe(ch);
    expect(ch.thread).toBe('worker');
  });

  it('throws when registering a duplicate name', () => {
    defineChannel({ name: 'test:dup', thread: 'worker', handler: () => 1 });
    expect(() =>
      defineChannel({ name: 'test:dup', thread: 'worker', handler: () => 2 })
    ).toThrow(/already registered/);
  });
});
```

- [ ] **Step 2: Run test, see it fail**

```
npx vitest run tests/unit/channels-registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement types**

```ts
// src/shared/channels/types.ts
import type { Database } from 'node-sqlite3-wasm';

export type ThreadMode = 'worker' | 'main';

export type ChannelHandler<Args extends unknown[], Result> =
  | ((db: Database, ...args: Args) => Result | Promise<Result>)  // worker
  | ((...args: Args) => Result | Promise<Result>);              // main

export interface ChannelDef<Args extends unknown[] = unknown[], Result = unknown> {
  readonly name: string;
  readonly thread: ThreadMode;
  readonly handler: ChannelHandler<Args, Result>;
}

export type ChannelRegistry = Readonly<Record<string, ChannelDef>>;
```

- [ ] **Step 4: Implement registry**

```ts
// src/shared/channels/registry.ts
import type { ChannelDef } from './types';

const registry: Record<string, ChannelDef> = {};

export function defineChannel<Args extends unknown[], Result>(
  def: ChannelDef<Args, Result>
): ChannelDef<Args, Result> {
  if (registry[def.name]) {
    throw new Error(`Channel "${def.name}" already registered`);
  }
  registry[def.name] = def as ChannelDef;
  return def;
}

export const channelRegistry: Readonly<Record<string, ChannelDef>> = registry;

export function listChannels(): string[] {
  return Object.keys(registry);
}

export function getChannel(name: string): ChannelDef | undefined {
  return registry[name];
}
```

- [ ] **Step 5: Run test, see it pass**

```
npx vitest run tests/unit/channels-registry.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```
git add src/shared/channels/types.ts src/shared/channels/registry.ts tests/unit/channels-registry.test.ts
git commit -m "feat(ipc): add channel registry scaffold"
```

---

## Task 2: Migrate persons domain (proof of concept)

This is the canonical migration pattern. Every other domain follows it verbatim.

**Files:**
- Create: `src/shared/channels/persons.ts`
- Modify: `src/main/db-worker.ts:60-200` (remove the inline `persons:*` keys from the dispatch object)
- Modify: `src/main/ipc/persons.ts` (delete file at end)
- Modify: `src/main/ipc/index.ts` (route persons via registry)
- Modify: `src/preload/index.ts:40-90` (replace persons block with registry walk)

- [ ] **Step 1: Audit current persons channels**

Run:
```
grep -E "wrapHandler\('persons:" src/main/ipc/persons.ts
grep -E "'persons:" src/main/db-worker.ts
```

Record the list. There should be ~21 channels (`persons:create`, `persons:get`, `persons:list`, `persons:update`, `persons:delete`, `persons:search`, `persons:addName`, `persons:getNames`, `persons:updateName`, `persons:deleteName`, `persons:getIdentifiers`, `persons:addIdentifier`, `persons:updateIdentifier`, `persons:deleteIdentifier`, `persons:setProfilePic`, `persons:findDuplicates`, `persons:merge`, `persons:createWithEvent`, plus undo-wrapped variants).

- [ ] **Step 2: Write the migration test**

```ts
// tests/unit/channels-persons.test.ts
import { describe, it, expect } from 'vitest';
import '../../src/shared/channels/persons';
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('persons channel registry', () => {
  it('registers all persons:* channels', () => {
    const personsChannels = listChannels().filter(c => c.startsWith('persons:'));
    expect(personsChannels.length).toBeGreaterThanOrEqual(15);
  });
  it('persons:get is a worker channel', () => {
    const ch = getChannel('persons:get');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });
});
```

- [ ] **Step 3: Run test, see it fail**

```
npx vitest run tests/unit/channels-persons.test.ts
```

Expected: FAIL — `persons.ts` does not exist.

- [ ] **Step 4: Create the persons registry file**

Move every `persons:*` handler body from `db-worker.ts` and the wiring from `ipc/persons.ts` into channel definitions:

```ts
// src/shared/channels/persons.ts
import * as api from '../../api/persons';
import * as uw from '../../api/undo-wrappers';      // adjust import if path differs
import { defineChannel } from './registry';

defineChannel({
  name: 'persons:create',
  thread: 'worker',
  handler: (db, data: Parameters<typeof uw.createPersonUndo>[1]) =>
    uw.createPersonUndo(db, data),
});

defineChannel({
  name: 'persons:get',
  thread: 'worker',
  handler: (db, id: string) => api.getPerson(db, id),
});

defineChannel({
  name: 'persons:list',
  thread: 'worker',
  handler: (db) => api.listPersons(db),
});

// ...continue for every persons:* channel.
```

For each channel: copy the existing handler body verbatim — do not change behaviour in this task. The handler signature is `(db, ...args) => result` for worker channels, `(...args) => result` for main channels.

- [ ] **Step 5: Run new test, see it pass**

```
npx vitest run tests/unit/channels-persons.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Wire registry into the worker**

In `src/main/db-worker.ts`, replace the `persons:*` keys in the `handlers` object with a registry-driven loop. Keep all other domains unchanged in this task:

```ts
// src/main/db-worker.ts (top of file)
import '../shared/channels/persons';
import { channelRegistry } from '../shared/channels/registry';

// inside the message handler, before the existing handlers[channel] dispatch:
const ch = channelRegistry[channel];
if (ch && ch.thread === 'worker') {
  return await (ch.handler as (db: Database, ...a: unknown[]) => unknown)(getDb(), ...args);
}
// ... fall through to legacy handlers object for non-migrated domains
```

Remove the `persons:*` keys from the legacy `handlers` object.

- [ ] **Step 7: Wire registry into main-thread IPC bootstrapper**

In `src/main/ipc/index.ts`, before the existing `register*` calls, add:

```ts
import '../../shared/channels/persons';
import { channelRegistry } from '../../shared/channels/registry';
import { wrapHandler } from './wrap-handler';
import { callWorker } from './worker-client';

for (const ch of Object.values(channelRegistry)) {
  if (ch.thread === 'worker') {
    wrapHandler(ch.name, (...args: unknown[]) => callWorker(ch.name, ...args));
  } else {
    wrapHandler(ch.name, (...args: unknown[]) =>
      (ch.handler as (...a: unknown[]) => unknown)(...args)
    );
  }
}
```

Then delete `src/main/ipc/persons.ts` and remove its `registerPersons()` call from `index.ts`.

- [ ] **Step 8: Wire registry into preload**

In `src/preload/index.ts`, replace the per-method `persons` block with a registry walk that builds the same shape:

```ts
import '../shared/channels/persons';
import { channelRegistry } from '../shared/channels/registry';

const apiByDomain: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> = {};
for (const ch of Object.values(channelRegistry)) {
  const [domain, method] = ch.name.split(':');
  apiByDomain[domain] ??= {};
  apiByDomain[domain][method] = (...args) => ipcRenderer.invoke(ch.name, ...args);
}

contextBridge.exposeInMainWorld('api', {
  ...existingNonRegistryApi,    // keep until all domains migrate
  ...apiByDomain,                // overrides domain-by-domain as migrations land
});
```

- [ ] **Step 9: Run the full test suite**

```
npm run lint
npx vitest run
```

Expected: all green. The IPC coverage test still passes because `db-worker.ts` no longer matches `persons:*` keys via regex, but `wrapHandler('persons:*'` is also gone, so `extractWrapHandlerChannels` returns an empty list for persons. Verify the coverage test logic still holds; if not, adjust in Task 7.

- [ ] **Step 10: Run e2e**

```
npm run test:e2e
```

Expected: all 5 tests green. The CRUD round-trip exercises persons.

- [ ] **Step 11: Commit**

```
git add src/shared/channels/persons.ts src/main/db-worker.ts src/main/ipc/index.ts \
        src/preload/index.ts tests/unit/channels-persons.test.ts
git rm src/main/ipc/persons.ts
git commit -m "refactor(ipc): migrate persons domain to channel registry"
```

---

## Task 3: Derive typed `window.api` from the registry

**Files:**
- Create: `src/shared/channels/api-type.ts`
- Modify: `src/preload/index.ts` (typed contextBridge)
- Modify: `src/renderer/api.d.ts` (re-export derived type)

- [ ] **Step 1: Strengthen `defineChannel` to capture handler types**

```ts
// src/shared/channels/registry.ts (replace defineChannel signature)
export function defineChannel<
  Name extends string,
  Args extends unknown[],
  Result,
>(def: {
  name: Name;
  thread: ThreadMode;
  handler: ((db: Database, ...args: Args) => Result | Promise<Result>)
        | ((...args: Args) => Result | Promise<Result>);
}): { name: Name; thread: ThreadMode; args: Args; result: Result } {
  // implementation unchanged at runtime; only the return type tightens
}
```

- [ ] **Step 2: Build the type derivation**

```ts
// src/shared/channels/api-type.ts
import type { ChannelDef } from './types';

type DropDb<Args> = Args extends [unknown, ...infer Rest] ? Rest : Args;

export type ChannelClient<C extends ChannelDef> = C['thread'] extends 'worker'
  ? (...args: DropDb<Parameters<C['handler']>>) => Promise<Awaited<ReturnType<C['handler']>>>
  : (...args: Parameters<C['handler']>) => Promise<Awaited<ReturnType<C['handler']>>>;

export type SplitName<S extends string> =
  S extends `${infer D}:${infer M}` ? [D, M] : never;

export type ApiSurface<Reg extends Record<string, ChannelDef>> = {
  [D in SplitName<Extract<keyof Reg, string>>[0]]: {
    [M in SplitName<Extract<keyof Reg, string>>[1] as
      `${D}:${M}` extends keyof Reg ? M : never]:
      `${D}:${M}` extends keyof Reg ? ChannelClient<Reg[`${D}:${M}`]> : never;
  };
};
```

- [ ] **Step 3: Add a renderer-facing typed bridge**

```ts
// src/renderer/api.d.ts (replace contents)
import type { ApiSurface } from '../shared/channels/api-type';
import type { channelRegistry } from '../shared/channels/registry';

declare global {
  interface Window {
    api: ApiSurface<typeof channelRegistry>;
  }
}
export {};
```

- [ ] **Step 4: Verify with a sample renderer call**

```ts
// tests/unit/api-type.test-d.ts (new file, type-only)
import type {} from '../../src/renderer/api.d';

async function _typeCheck() {
  const p = await window.api.persons.get('id');  // must type-check
  // @ts-expect-error  -- nonexistent method
  await window.api.persons.gett('id');
}
```

- [ ] **Step 5: Run typecheck**

```
npx tsc --noEmit
```

Expected: 0 errors. The `@ts-expect-error` comment validates the typo case.

- [ ] **Step 6: Remove redundant `window.api` redeclarations**

Grep:
```
grep -RIn "Record<string, Record<string, (\\.\\.\\.args: unknown\\[\\]) => Promise<unknown>>>" src/renderer
```

Delete each redeclaration; the global type now covers it. Run lint + tsc.

- [ ] **Step 7: Commit**

```
git add src/shared/channels/api-type.ts src/shared/channels/registry.ts \
        src/renderer/api.d.ts tests/unit/api-type.test-d.ts \
        $(git ls-files src/renderer | xargs grep -l 'Record<string, Record<string')
git commit -m "feat(ipc): derive typed window.api from channel registry"
```

---

## Task 4: Migrate places domain

Apply Task 2's pattern verbatim, substituting `places` for `persons`. Channels: `places:create|get|list|update|delete|search|findOrCreate|getPersons`.

- [ ] **Step 1:** Create `src/shared/channels/places.ts` with one `defineChannel` per channel.
- [ ] **Step 2:** Remove `places:*` keys from `db-worker.ts` legacy handlers.
- [ ] **Step 3:** Delete `src/main/ipc/places.ts`; remove `registerPlaces()` from `ipc/index.ts`.
- [ ] **Step 4:** `import '../shared/channels/places'` in both `db-worker.ts` and `main/ipc/index.ts` (and `preload/index.ts` is unchanged because it walks the registry).
- [ ] **Step 5:** Run `npm run lint && npx vitest run && npm run test:e2e`. All green.
- [ ] **Step 6:** Commit `refactor(ipc): migrate places domain to channel registry`.

---

## Task 5: Migrate events, sources/citations, relationships

Three domains, identical pattern. One commit each.

- [ ] **Events:** `events:create|get|list|update|delete|forPerson|forRelationship|forPlace|addParticipant|getParticipants|removeParticipant`. Commit.
- [ ] **Sources/citations:** `sources:*` plus `citations:*`. Both go in `src/shared/channels/sources.ts`. Commit.
- [ ] **Relationships:** `relationships:*` plus `eventParticipants:*` if not already in events. Commit.

After each: run `npm run lint && npx vitest run && npm run test:e2e`.

---

## Task 6: Migrate utility, media, gazetteers, database, import

These pull in larger surfaces — split commits sensibly.

- [ ] **Utility:** `groups:*`, `repositories:*`, `tasks:*`, `reports:*`, `undo:*`, `checks:*`, `db_settings:*`. All from `src/main/ipc/utility.ts`. Commit per sub-domain (`groups`, `repos`, `tasks`, `reports`, `undo+checks+settings`) — five commits.
- [ ] **Media:** `media:*` worker channels go in registry; `media:attach` and `media:openFile` stay main-only — register them with `thread: 'main'` so the registry still owns them. Commit.
- [ ] **Gazetteers:** worker + main channels both in registry. Commit.
- [ ] **Database:** `db:getSetting|setSetting|deleteSetting` + worker channels. The hand-written `db:createNew|switchTo|openExisting` (which use `ipcMain.handle` directly per the existing test comment) stay outside the registry for now — leave a TODO. Commit.
- [ ] **Import:** `gedcom:*`, `archive:*`, `holger:*`, `genney:*`. All thread:`'main'` (use `fs`, `dialog`). Commit.

After each domain: full lint + unit + e2e.

---

## Task 7: Update coverage tests + add static-api parity test

**Files:**
- Modify: `tests/unit/ipc-worker-coverage.test.ts`
- Create: `tests/unit/static-api-coverage.test.ts`

- [ ] **Step 1: Drive the coverage test from the registry**

Replace the regex extraction with a registry walk:

```ts
// tests/unit/ipc-worker-coverage.test.ts (rewrite)
import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';            // imports the barrel — registers all
import { channelRegistry } from '../../src/shared/channels/registry';

describe('IPC channel registry', () => {
  it('every worker channel has a worker handler', () => {
    const workerChannels = Object.values(channelRegistry).filter(c => c.thread === 'worker');
    expect(workerChannels.length).toBeGreaterThan(80);
    for (const ch of workerChannels) expect(typeof ch.handler).toBe('function');
  });

  it('critical hot-path channels are registered', () => {
    const must = ['persons:get', 'persons:list', 'events:forPerson',
                  'reports:personSummary', 'reports:ancestorTree',
                  'undo:undo', 'undo:redo', 'checks:runAll'];
    for (const name of must) expect(channelRegistry[name], name).toBeDefined();
  });
});
```

The legacy regex-based test is deleted. The fragility of `[a-zA-Z]+:[a-zA-Z]+` (which silently passed channels with underscores) is now moot — channel names are typed strings checked at compile time.

- [ ] **Step 2: Write static-api parity test**

```ts
// tests/unit/static-api-coverage.test.ts
import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';
import { channelRegistry } from '../../src/shared/channels/registry';
import { staticApi } from '../../src/static/static-api';

describe('static API parity', () => {
  it('every registry channel has a stub or noop in the static api', () => {
    const missing: string[] = [];
    for (const name of Object.keys(channelRegistry)) {
      const [domain, method] = name.split(':');
      if (!(domain in staticApi) || !(method in (staticApi as Record<string, Record<string, unknown>>)[domain])) {
        missing.push(name);
      }
    }
    if (missing.length) {
      throw new Error('static-api.ts is missing stubs for:\n  ' + missing.join('\n  '));
    }
  });
});
```

This requires `src/static/static-api.ts` to export its `api` object (currently bound to `globalThis`). Add `export const staticApi = { ... }` and assign to globalThis afterwards.

- [ ] **Step 3: Run both tests, fix any drift**

```
npx vitest run tests/unit/ipc-worker-coverage.test.ts tests/unit/static-api-coverage.test.ts
```

If the parity test reveals missing static stubs (likely — review found this exact gap), add stubs (`async () => null`, `async () => []`, etc.) until green.

- [ ] **Step 4: Commit**

```
git add tests/unit/ipc-worker-coverage.test.ts tests/unit/static-api-coverage.test.ts \
        src/static/static-api.ts
git commit -m "test(ipc): drive coverage tests from channel registry; add static-api parity"
```

---

## Task 8: Cleanup

- [ ] **Step 1: Remove dead code**

```
git rm src/main/ipc/persons.ts src/main/ipc/places.ts src/main/ipc/events.ts \
       src/main/ipc/sources.ts src/main/ipc/relationships.ts src/main/ipc/utility.ts \
       src/main/ipc/media.ts src/main/ipc/gazetteers.ts
```

(Keep `src/main/ipc/database.ts` and `src/main/ipc/import.ts` if they still hold the few hand-written `ipcMain.handle` channels; otherwise delete.)

Drop `wrapHandler` legacy handlers object from `db-worker.ts` once empty.

- [ ] **Step 2: Update CLAUDE.md**

Replace the IPC section's "register in TWO places" instructions with: "Add a `defineChannel` entry in `src/shared/channels/<domain>.ts`. The dispatcher, preload, and types are derived." Update the file map.

- [ ] **Step 3: Run full suite**

```
npm run lint
npx vitest run
npm run test:e2e
```

All green.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "refactor(ipc): remove legacy per-domain wiring"
```

---

## Self-review checklist

- [ ] Every channel listed in the original `ipc/*.ts` files is now in a `src/shared/channels/*.ts` file.
- [ ] No file in `src/renderer/` redeclares `window.api` as `Record<string, Record<...>>`.
- [ ] `npx tsc --noEmit` reports 0 errors.
- [ ] `npm run test:e2e` passes (CRUD round-trip is the integration smoke).
- [ ] Static-api parity test green.
- [ ] CLAUDE.md updated.

## Out of scope (for follow-up plans)

- Panel composables (see `2026-04-28-panel-composables.md`).
- API link helpers (see `2026-04-28-api-link-helpers.md`).
- MCP tool typing — MCP wraps API functions, not IPC channels, so this plan does not change MCP.
