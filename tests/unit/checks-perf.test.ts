// Regression tripwires for post-import worker contention.
//
// The original incident: runAllChecks held the worker thread for 11s after
// importing a 22k-person GEDCOM, blocking media:listPage and persons:list IPC
// so the renderer mounted to empty views. Two root causes:
//
//   1. Each gazetteer-aware check (E2/E3/E4) called loadGazetteersForChecks()
//      independently, deep-cloning ~42 MB of bundled data three times.
//   2. The resolver's name-depth cache used array-identity equality and
//      loadGazetteers returns fresh clones, so each call missed the cache and
//      re-walked all gazetteer trees.
//
// These tests lock in both invariants without depending on wall-clock timing.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { runAllChecks } from '../../src/api/checks';
import { resolvePlace } from '../../src/api/place-gazetteers/resolver';
import type { Gazetteer, GazetteerNode } from '../../src/api/place-gazetteers/types';
import * as gazetteersApi from '../../src/api/gazetteers';
import { createTestDb } from './helpers';
import { createPlace } from '../../src/api/places';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';

// ---------------------------------------------------------------------------
// Invariant 1: loadGazetteers* runs at most once per runAllChecks.
//
// Spies on getImportedGazetteers (the DB read inside loadGazetteersForChecks).
// If a future refactor reintroduces per-check loading, this trips immediately.
// ---------------------------------------------------------------------------

describe('runAllChecks gazetteer load fan-out', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    // Seed a few unresolvable places attached to events so the
    // gazetteer-aware checks have work to do — empty DB short-circuits.
    const person = createPerson(db, { sex: 'M', given_name: 'Test', surname: 'Person' });
    for (let i = 0; i < 10; i++) {
      const place = createPlace(db, { name: `Unknown Place ${i}` });
      const ev = createEvent(db, { event_type: 'birth', place_id: place.id });
      addEventParticipant(db, { event_id: ev.id, person_id: person.id, role: 'primary' });
    }
  });

  it('reads imported gazetteers at most once per run', async () => {
    const spy = vi.spyOn(gazetteersApi, 'getImportedGazetteers');
    await runAllChecks(db);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Invariant 2: resolver caches global name depth across calls on the same
// gazetteer object.
//
// Wraps the gazetteer root with a Proxy that counts `children` property
// accesses, then calls resolvePlace twice with the SAME proxy. The first call
// builds the depth map (full tree walk). The second call must hit the cache
// and not re-walk.
// ---------------------------------------------------------------------------

describe('resolver name-depth cache', () => {
  function buildBigGazetteer(): Gazetteer {
    // Wide-and-deep tree so the build walk is many times larger than any
    // single-name lookup walk inside findMatches. That lets us assert the
    // second call's children-access count is ORDER OF MAGNITUDE smaller.
    const root: GazetteerNode = {
      name: 'World',
      type: 'world',
      children: Array.from({ length: 8 }, (_, i) => ({
        name: `Region${i}`,
        type: 'region',
        children: Array.from({ length: 8 }, (_, j) => ({
          name: `Country${i}-${j}`,
          type: 'country',
          children: Array.from({ length: 8 }, (_, k) => ({
            name: `City${i}-${j}-${k}`,
            type: 'city',
          })),
        })),
      })),
    };
    return {
      id: 'cache-test',
      name: 'Cache Test',
      locale: 'en',
      kind: 'point',
      root,
    };
  }

  function instrumentChildrenAccess(gaz: Gazetteer): { gaz: Gazetteer; getCount(): number; reset(): void } {
    let count = 0;
    function wrap(node: GazetteerNode): GazetteerNode {
      const wrappedChildren = node.children?.map(wrap);
      return new Proxy(node, {
        get(target, prop, receiver) {
          if (prop === 'children') {
            count++;
            return wrappedChildren;
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    }
    return {
      gaz: { ...gaz, root: wrap(gaz.root) },
      getCount: () => count,
      reset: () => { count = 0; },
    };
  }

  it('does not rebuild the depth map on a second resolvePlace call with the same gazetteer', () => {
    const probe = instrumentChildrenAccess(buildBigGazetteer());
    const gazetteers = [probe.gaz];

    // Cold call — full tree walk to build depth map plus per-call match walk
    resolvePlace('Stockholm', gazetteers);
    const cold = probe.getCount();

    probe.reset();

    // Warm call — cache hit, only the per-call match walk runs.
    resolvePlace('Stockholm', gazetteers);
    const warm = probe.getCount();

    // Cold included the cache build (~600+ children accesses across the
    // 8x8x8 tree); warm should be a small fraction of that. A 5x ratio
    // gives slack for future small changes to findMatches walking.
    expect(warm * 5).toBeLessThan(cold);
  });

  it('reuses the cached per-gazetteer depth map even when the surrounding array changes', () => {
    // The bug we are guarding against: callers that hand resolvePlace a fresh
    // gazetteer array each call (loadGazetteers does this) would invalidate
    // an array-identity-keyed cache. The per-root WeakMap must survive that.
    const probe = instrumentChildrenAccess(buildBigGazetteer());

    resolvePlace('Stockholm', [probe.gaz]);   // builds and caches by root identity
    probe.reset();
    resolvePlace('Stockholm', [probe.gaz]);   // NEW array, SAME root → cache hit

    // No second tree walk: the only `children` accesses come from findMatches
    // descending the cached path. For a single component, that's a small
    // constant, well under the cold-call total.
    expect(probe.getCount()).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// Invariant 3: resolver does NOT re-normalize node names on every inner-loop
// iteration after the index is built.
//
// Wraps the gazetteer tree in getter-based proxies that count every `name`
// access. After a warm (second) call, zero name reads must occur — all
// comparisons should go through pre-normalized index entries.
// ---------------------------------------------------------------------------

describe('resolver findMatches — name-normalization call count', () => {
  function makeGaz() {
    // 3-level tree: 1 root → 5 countries → 8 regions each = 40 leaves.
    // Each leaf has one alias. Two leaves share the name "Springfield"
    // to force multiple anchor candidates per resolvePlace.
    const countries = ['SE', 'DE', 'DK', 'NO', 'FI'].map(c => ({
      name: c,
      lat: 0, lon: 0,
      children: Array.from({ length: 8 }, (_, ri) => ({
        name: ri === 0 ? 'Springfield' : `${c}-region-${ri}`,
        aliases: [`${c}-alias-${ri}`],
        lat: 0, lon: 0,
      })),
    }));
    return {
      id: 'synthetic',
      name: 'Synthetic',
      kind: 'point' as const,
      root: { name: 'WORLD', children: countries, lat: 0, lon: 0 },
    };
  }

  it('does not re-normalize the same node name on every iteration', async () => {
    const gaz = makeGaz();

    // Count reads of node.name during resolvePlace by wrapping the tree in
    // proxies that increment a counter on every `name` access AFTER the
    // index is built.
    let nameReads = 0;
    function wrap(node: any): any {
      const wrapped: any = {
        get name() { nameReads++; return node.name; },
        get aliases() { return node.aliases; },
        get lat() { return node.lat; },
        get lon() { return node.lon; },
      };
      if (node.children) {
        const wrappedChildren = node.children.map(wrap);
        Object.defineProperty(wrapped, 'children', { get: () => wrappedChildren });
      }
      return wrapped;
    }

    const wrappedGaz = { ...gaz, root: wrap(gaz.root) };
    // Prime the index — this read pass is allowed to be expensive.
    resolvePlace('Springfield, SE', [wrappedGaz as any]);

    // Now measure a SECOND call. With pre-normalized index entries, this
    // call should NOT touch node.name at all (everything compared via the
    // cached normName/normAliases).
    nameReads = 0;
    resolvePlace('Springfield, SE', [wrappedGaz as any]);

    // Lock in the post-fix invariant: zero name re-reads on a cached path.
    expect(nameReads).toBe(0);
  });
});

