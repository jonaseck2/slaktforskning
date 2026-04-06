---
name: performance-profiling
description: Use when diagnosing slow operations, CPU saturation, or hangs in the Electron app — especially after import or during quality checks. Covers CPU profiling setup, cpuprofile analysis, and the known SQLite WASM bottleneck patterns in this codebase.
---

# Performance Profiling for Släktforskning

## Rule Zero

**Do not guess. Do not change code. Get a profile first.**

CPU profiles tell you exactly which functions consumed the time, with sample counts and call chains. Without one, you are guessing — and the bottleneck is almost never where you expect.

---

## Step 1: Instrument the Suspect Operation

The profiling helper lives in `src/main/ipc.ts`. Add it if not already present:

```typescript
import * as inspector from 'inspector';
import * as os from 'os';

async function captureProfile<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  const session = new inspector.Session();
  session.connect();
  await new Promise<void>((resolve, reject) =>
    session.post('Profiler.enable', (err) => (err ? reject(err) : resolve()))
  );
  await new Promise<void>((resolve, reject) =>
    session.post('Profiler.start', (err) => (err ? reject(err) : resolve()))
  );
  const t0 = Date.now();
  let result: T;
  try {
    result = await fn();
  } finally {
    const profile = await new Promise<inspector.Profiler.Profile>((resolve, reject) =>
      session.post('Profiler.stop', (_err, params) =>
        _err ? reject(_err) : resolve(params.profile)
      )
    );
    session.disconnect();
    const elapsed = Date.now() - t0;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(os.homedir(), 'Desktop', `${label}-${stamp}.cpuprofile`);
    fs.writeFileSync(outPath, JSON.stringify(profile), 'utf-8');
    console.log(`[profile] ${label}: ${elapsed}ms → ${outPath}`);
  }
  return result!;
}
```

Wrap the slow handler:

```typescript
// GEDCOM import
return await captureProfile('gedcom-import', () => {
  const text = readGedcomFile(filePath);
  const tree = parseGedcom(text);
  return importGedcom(getDatabase(), tree, options);
});

// Quality checks
return captureProfile('checks-runAll', () => {
  const raw = checks.runAllChecks(db);
  // ...
});
```

Run `npm start`, trigger the operation. Look for `[profile] label: Nms → /path/to/file.cpuprofile` in the terminal.

---

## Step 2: Analyze the Profile

**Option A — Chrome DevTools (best flamegraph):**
1. Open Chrome → F12 → Performance tab → click the upload icon (⬆) → load the `.cpuprofile`
2. Look at the flamegraph: wide bars are hot. Narrow bars are fast.

**Option B — Agent analysis (when the file is too large to open):**
Hand the `.cpuprofile` path to an Explore agent with this instruction: "Parse the V8 cpuprofile JSON. Find the top 30 nodes by hitCount. For each hot node walk up the parent chain. Report total samples, top functions by hitCount with functionName/url/lineNumber, and the call chains. Identify the bottleneck."

Key metrics:
- **Total samples** = profile duration × sample rate (1000 Hz)
- **hitCount** on a leaf node = % of total time executing that code
- **High hitCount in WASM frames** = the SQL query itself is the bottleneck
- **High hitCount in JS** = the JS logic is the bottleneck

---

## Step 3: Interpret What You Find

### Pattern: WASM SQLite execution dominates (80%+ of samples)

The SQL query is slow. Look at the call chain to find which check function is calling it. The fix is always one of:

1. **4-way event_participants self-join** → 2-query + JS join (see below)
2. **Correlated NOT EXISTS subquery** → Set membership (see below)
3. **N+1 queries in a loop** → single bulk query + JS grouping

### Pattern: High hitCount in a specific check function

The function name and line number tell you exactly where to look. Read that function, identify which query pattern it uses, apply the appropriate fix.

### Pattern: `read()` syscalls (10–20% of samples)

Normal — this is SQLite doing WAL file I/O. Not actionable.

### Pattern: High hitCount in `getPersonDisplayNames`

The name-resolution query after `checks.runAllChecks()` is slow. Cap the result set before calling it (already done with 500-result cap per notice-severity check code in `checks:runAll` handler).

---

## Known Slow Patterns in This Codebase

### 1. The 4-Way event_participants Self-Join (the #1 killer)

```sql
-- SLOW: Cartesian product explosion with 20k persons
SELECT e.id, ep.person_id, b.date_value
FROM events e
JOIN event_participants ep ON ep.event_id = e.id
JOIN event_participants epb ON epb.person_id = ep.person_id   -- self-join
JOIN events b ON b.id = epb.event_id AND b.event_type = 'birth'
WHERE e.event_type = 'marriage'
```

**Fix: Two queries + JS join**

```typescript
// Load all events of each type separately — two simple index seeks
const marriages = loadPersonEvents(db, 'marriage', ['exact', 'calculated']);
const births    = loadPersonEvents(db, 'birth',    ['exact', 'calculated']);

// Join in JS — O(n) with Map lookup
for (const [personId, personMarriages] of marriages) {
  const personBirths = births.get(personId);
  if (!personBirths) continue;
  for (const m of personMarriages) {
    for (const b of personBirths) {
      // compare dates here
    }
  }
}
```

The `loadPersonEvents` helper already exists in `src/api/checks.ts`:

```typescript
function loadPersonEvents(
  db: Database,
  eventType: string,
  dateTypes: string[] = ['exact', 'calculated'],
): Map<string, Array<{ event_id: string; date_value: string }>>
```

### 2. Correlated NOT EXISTS per Person

```sql
-- SLOW: one subquery per row → O(n) queries
SELECT id FROM persons p
WHERE NOT EXISTS (
  SELECT 1 FROM event_participants ep
  JOIN events e ON e.id = ep.event_id
  WHERE ep.person_id = p.id AND e.event_type = 'birth'
)
```

**Fix: Set membership**

```typescript
// One query to get all person_ids that HAVE the event
const withBirth = personIdsWithEvent(db, 'birth');

// Filter in JS
const allPersons = queryAll<{ id: string }>(db, 'SELECT id FROM persons');
for (const p of allPersons) {
  if (!withBirth.has(p.id)) { /* flag it */ }
}
```

The `personIdsWithEvent` helper exists in `src/api/checks.ts`.

### 3. N+1 Queries in a Loop

```typescript
// SLOW: one SQL query per relationship
for (const rel of relationships) {
  const person = queryOne(db, 'SELECT ... FROM persons WHERE id = ?', [rel.person_id]);
}
```

**Fix: Bulk query + JS Map**

```typescript
const allPersons = queryAll<{ id: string }>(db, 'SELECT id, ... FROM persons');
const personMap = new Map(allPersons.map(p => [p.id, p]));
for (const rel of relationships) {
  const person = personMap.get(rel.person_id);
}
```

---

## Indexes That Matter

The schema already has these covering the common check queries:

```sql
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_type_datetype ON events(event_type, date_type);
CREATE INDEX idx_event_participants_event_id ON event_participants(event_id);
CREATE INDEX idx_event_participants_person_id ON event_participants(person_id);
```

If a new query filters on a column not listed here, add the index in `src/api/schema.ts` (inside the final `db.exec(...)` block, using `CREATE INDEX IF NOT EXISTS`).

---

## Per-Check Timing (Debug Mode)

`runAllCheckFunctions` in `src/api/checks.ts` already logs per-check timing to stdout:

```
[checks] checkBirthAfterDeath: 80ms → 2 result(s)
[checks] checkMarriageAge: 12000ms → 45 result(s)   ← slow
```

Use these to narrow down which check to profile before capturing a full CPU profile.

---

## Profiling Checklist

When a user reports CPU saturation or slowness:

1. [ ] Check per-check timing logs first — identify the slow check by name
2. [ ] If the slow function is not obvious, add `captureProfile` wrapper to the suspected IPC handler
3. [ ] Trigger the operation with the actual large dataset
4. [ ] Collect the `.cpuprofile` from `~/Desktop/`
5. [ ] Analyze: top nodes by hitCount → identify bottleneck function + line number
6. [ ] Read that function in the source; identify the slow query pattern
7. [ ] Apply the appropriate fix (4-way JOIN → 2-query+JS, NOT EXISTS → Set, N+1 → bulk)
8. [ ] `npm test` — all tests must pass before declaring done
9. [ ] Re-run to verify the hot function is gone from the profile
