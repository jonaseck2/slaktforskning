import { describe, it, expect, beforeEach } from 'vitest';
import { registerPlaceTools } from '../../src/mcp/tools/prod/places';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createPlace } from '../../src/api/places';
import { setDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';
import { createCaptureServer, callTool, makeCtx } from './helpers/mcpHarness';

let db: ReturnType<typeof createTestDb>;
let tools: ReturnType<typeof createCaptureServer>['tools'];

beforeEach(() => {
  db = createTestDb();
  const cap = createCaptureServer();
  registerPlaceTools(cap.server, makeCtx(db));
  tools = cap.tools;
});

// ── add_place ──────────────────────────────────────────────────────────────

describe('add_place', () => {
  it('registers the tool', () => {
    expect(tools.has('add_place')).toBe(true);
  });

  it('creates a place with minimal args and persists it to DB', async () => {
    const result = await callTool<{ id: string; name: string }>(
      tools,
      'add_place',
      { name: 'Fröderyd' },
    );

    expect(result.id).toBeTruthy();
    expect(result.name).toBe('Fröderyd');

    const rows = db.prepare('SELECT * FROM places WHERE id = ?').all([result.id]) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Fröderyd');
  });

  it('creates a place with all optional fields', async () => {
    const result = await callTool<{
      id: string;
      name: string;
      place_type: string;
      latitude: number;
      longitude: number;
      date_from: string;
      date_to: string;
      notes: string;
    }>(tools, 'add_place', {
      name: 'Linköping',
      place_type: 'city',
      latitude: 58.4,
      longitude: 15.6,
      date_from: '1300',
      date_to: '2099',
      notes: 'County seat of Östergötland',
    });

    expect(result.place_type).toBe('city');
    expect(result.latitude).toBeCloseTo(58.4);
    expect(result.longitude).toBeCloseTo(15.6);
    expect(result.notes).toBe('County seat of Östergötland');

    const rows = db.prepare('SELECT * FROM places WHERE id = ?').all([result.id]) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].place_type).toBe('city');
    expect(rows[0].date_from).toBe('1300');
    expect(rows[0].date_to).toBe('2099');
  });

  it('creates a child place with parent_place_id linkage', async () => {
    const parent = await callTool<{ id: string }>(tools, 'add_place', {
      name: 'Jönköpings län',
      place_type: 'province',
    });

    const child = await callTool<{ id: string; parent_place_id: string }>(
      tools,
      'add_place',
      {
        name: 'Fröderyd',
        place_type: 'parish',
        parent_place_id: parent.id,
      },
    );

    expect(child.parent_place_id).toBe(parent.id);

    // Assert DB state: parent_place_id is stored
    const rows = db.prepare('SELECT * FROM places WHERE id = ?').all([child.id]) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].parent_place_id).toBe(parent.id);
  });

  it('creates multiple places independently', async () => {
    const p1 = await callTool<{ id: string }>(tools, 'add_place', { name: 'Alpha' });
    const p2 = await callTool<{ id: string }>(tools, 'add_place', { name: 'Beta' });

    const rows = db.prepare('SELECT * FROM places ORDER BY name ASC').all([]) as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Alpha');
    expect(rows[1].name).toBe('Beta');
    expect(p1.id).not.toBe(p2.id);
  });

  it('rejects a comma-separated name (the "Chennai, India, World" RCA)', async () => {
    const tool = tools.get('add_place')!;
    await expect(
      tool.handler({ name: 'Chennai, India, World' }),
    ).rejects.toThrow(/comma|parent_chain/i);

    // No row was written
    const rows = db.prepare('SELECT * FROM places').all([]) as any[];
    expect(rows).toHaveLength(0);
  });

  it('parent_chain creates the full root → leaf hierarchy as separate rows', async () => {
    const result = await callTool<{ id: string; name: string; parent_place_id: string | null }>(
      tools,
      'add_place',
      { name: 'Chennai', parent_chain: ['World', 'India'] },
    );

    expect(result.name).toBe('Chennai');
    expect(result.parent_place_id).toBeTruthy();

    const rows = db.prepare('SELECT * FROM places ORDER BY name ASC').all([]) as any[];
    expect(rows).toHaveLength(3);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName['World']).toBeDefined();
    expect(byName['India']).toBeDefined();
    expect(byName['Chennai']).toBeDefined();
    expect(byName['World'].parent_place_id).toBeNull();
    expect(byName['India'].parent_place_id).toBe(byName['World'].id);
    expect(byName['Chennai'].parent_place_id).toBe(byName['India'].id);
  });

  it('parent_chain is idempotent — re-calling reuses existing rows', async () => {
    await callTool(tools, 'add_place', { name: 'Chennai', parent_chain: ['World', 'India'] });
    await callTool(tools, 'add_place', { name: 'Chennai', parent_chain: ['World', 'India'] });

    const rows = db.prepare('SELECT * FROM places').all([]) as any[];
    expect(rows).toHaveLength(3);
  });

  it('parent_chain rejects a comma in any link', async () => {
    const tool = tools.get('add_place')!;
    await expect(
      tool.handler({ name: 'Chennai', parent_chain: ['World, Earth', 'India'] }),
    ).rejects.toThrow(/comma|parent_chain/i);

    const rows = db.prepare('SELECT * FROM places').all([]) as any[];
    expect(rows).toHaveLength(0);
  });
});

// ── search_places ──────────────────────────────────────────────────────────

describe('search_places', () => {
  it('registers the tool', () => {
    expect(tools.has('search_places')).toBe(true);
  });

  it('returns empty array when no places match the query', async () => {
    createPlace(db, { name: 'Linköping' });

    const result = await callTool<any[]>(tools, 'search_places', { query: 'Gothenburg' });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns matching places for a substring query', async () => {
    createPlace(db, { name: 'Fröderyd' });
    createPlace(db, { name: 'Frödinge' });
    createPlace(db, { name: 'Linköping' });

    const result = await callTool<any[]>(tools, 'search_places', { query: 'Fröd' });

    expect(result.length).toBeGreaterThanOrEqual(2);
    const names = result.map((r: any) => r.name);
    expect(names).toContain('Fröderyd');
    expect(names).toContain('Frödinge');
    expect(names).not.toContain('Linköping');
  });

  it('returns parent_name field for each result', async () => {
    const parent = createPlace(db, { name: 'Kronobergs län', place_type: 'province' });
    createPlace(db, { name: 'Kärda', place_type: 'parish', parent_place_id: parent.id });

    const result = await callTool<Array<{ name: string; parent_name: string | null }>>(
      tools,
      'search_places',
      { query: 'Kärda' },
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Kärda');
    expect(result[0].parent_name).toBe('Kronobergs län');
  });

  it('returns up to 3 places when querying a common substring', async () => {
    createPlace(db, { name: 'Söderby' });
    createPlace(db, { name: 'Söderköping' });
    createPlace(db, { name: 'Södertälje' });

    const result = await callTool<any[]>(tools, 'search_places', { query: 'söder' });

    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});

// ── get_place_history ──────────────────────────────────────────────────────

describe('get_place_history', () => {
  it('registers the tool', () => {
    expect(tools.has('get_place_history')).toBe(true);
  });

  it('returns "Place not found" text for an unknown place_id', async () => {
    const result = await callTool<string>(tools, 'get_place_history', {
      place_id: 'nonexistent-id',
    });
    expect(result).toBe('Place not found');
  });

  it('returns place history with empty events for a place that has none', async () => {
    const place = createPlace(db, { name: 'Öregrund' });

    const result = await callTool<{
      place_id: string;
      place_name: string;
      place_path: string;
      events: unknown[];
    }>(tools, 'get_place_history', { place_id: place.id });

    expect(result.place_id).toBe(place.id);
    expect(result.place_name).toBe('Öregrund');
    expect(result.place_path).toBe('Öregrund');
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events).toHaveLength(0);
  });

  it('returns events at the place with participant names and roles', async () => {
    const place = createPlace(db, { name: 'Domkyrkan' });
    const person = createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Larsson' });
    const event = createEvent(db, {
      event_type: 'baptism',
      date_original: '1850-03-01',
      place_id: place.id,
    });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const result = await callTool<{
      place_id: string;
      events: Array<{
        event: { id: string; event_type: string };
        participants: Array<{ person_id: string; given_name: string; surname: string; role: string }>;
      }>;
    }>(tools, 'get_place_history', { place_id: place.id });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].event.event_type).toBe('baptism');
    expect(result.events[0].participants).toHaveLength(1);
    expect(result.events[0].participants[0].person_id).toBe(person.id);
    expect(result.events[0].participants[0].given_name).toBe('Erik');
    expect(result.events[0].participants[0].surname).toBe('Larsson');
    expect(result.events[0].participants[0].role).toBe('primary');
  });

  it('walks the place hierarchy for place_path', async () => {
    const province = createPlace(db, { name: 'Jönköpings län', place_type: 'province' });
    const parish = createPlace(db, { name: 'Fröderyd', place_type: 'parish', parent_place_id: province.id });

    const result = await callTool<{ place_path: string }>(
      tools,
      'get_place_history',
      { place_id: parish.id },
    );

    // place_path walks upward: leaf, then parent
    expect(result.place_path).toContain('Fröderyd');
    expect(result.place_path).toContain('Jönköpings län');
  });
});

// ── resolve_place ──────────────────────────────────────────────────────────

describe('resolve_place', () => {
  it('registers the tool', () => {
    expect(tools.has('resolve_place')).toBe(true);
  });

  it('returns "No match found" when gazetteers list is empty (no enabled gazetteers)', async () => {
    // Default: no gazetteer_config set → enabledGazetteers: [] → empty gazetteer list
    const result = await callTool<string>(tools, 'resolve_place', { name: 'Stockholm' });
    expect(result).toBe('No match found');
  });

  it('PRIME DIRECTIVE: gazetteer-only match does NOT persist to the places table', async () => {
    // Enable the world-countries gazetteer so we get a real gazetteer hit
    setDbSetting(db, 'gazetteer_config', JSON.stringify({ enabledGazetteers: ['world-countries'] }));

    // Confirm places table is empty before the call
    const before = db.prepare('SELECT COUNT(*) AS c FROM places').get([]) as { c: number };
    expect(before.c).toBe(0);

    // Call resolve_place for "Sweden" — exists in the world-countries bundled gazetteer
    const result = await callTool<string | object>(tools, 'resolve_place', { name: 'Sweden' });

    // The result should be something (the gazetteer resolved it or it was "No match found")
    // — the important assertion is what follows
    expect(result).toBeTruthy();

    // PRIME DIRECTIVE: no row must have been written to the places table
    const after = db.prepare('SELECT COUNT(*) AS c FROM places').get([]) as { c: number };
    expect(after.c).toBe(0);
  });

  it('returns a result object (not "No match found") when a gazetteer is enabled and the name matches', async () => {
    setDbSetting(db, 'gazetteer_config', JSON.stringify({ enabledGazetteers: ['world-countries'] }));

    const result = await callTool<any>(tools, 'resolve_place', { name: 'Sweden' });

    // With world-countries enabled, "Sweden" should resolve to a lat/lon
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    // The result should include coordinate or match info
    expect(result.lat !== undefined || result.latitude !== undefined || result.path !== undefined || result.match !== undefined).toBe(true);
  });

  it('still returns "No match found" for a gibberish name even with gazetteers enabled', async () => {
    setDbSetting(db, 'gazetteer_config', JSON.stringify({ enabledGazetteers: ['world-countries'] }));

    const result = await callTool<string>(tools, 'resolve_place', {
      name: 'Zxqwerty12345Nonexistent',
    });

    expect(result).toBe('No match found');

    // And no place was written
    const count = db.prepare('SELECT COUNT(*) AS c FROM places').get([]) as { c: number };
    expect(count.c).toBe(0);
  });
});

// ── list_place_children ────────────────────────────────────────────────────

describe('list_place_children', () => {
  it('registers the tool', () => {
    expect(tools.has('list_place_children')).toBe(true);
  });

  it('returns root-level places when parent_place_id is null', async () => {
    const root1 = createPlace(db, { name: 'Sverige', place_type: 'country' });
    createPlace(db, { name: 'Norge', place_type: 'country' });
    // A child — should NOT appear in the root listing
    createPlace(db, { name: 'Stockholms län', parent_place_id: root1.id });

    const result = await callTool<any[]>(tools, 'list_place_children', {
      parent_place_id: null,
    });

    const names = result.map((r: any) => r.name);
    expect(names).toContain('Sverige');
    expect(names).toContain('Norge');
    expect(names).not.toContain('Stockholms län');
  });

  it('returns direct children of a given parent', async () => {
    const parent = createPlace(db, { name: 'Sverige', place_type: 'country' });
    const child1 = createPlace(db, { name: 'Stockholms län', parent_place_id: parent.id });
    const child2 = createPlace(db, { name: 'Gotlands län', parent_place_id: parent.id });
    // Grandchild — should NOT appear at this level
    createPlace(db, { name: 'Nacka', parent_place_id: child1.id });

    const result = await callTool<any[]>(tools, 'list_place_children', {
      parent_place_id: parent.id,
    });

    const names = result.map((r: any) => r.name);
    expect(names).toContain('Stockholms län');
    expect(names).toContain('Gotlands län');
    expect(names).not.toContain('Nacka');
    expect(names).not.toContain('Sverige');

    // Both returned rows correspond to the created children
    const ids = result.map((r: any) => r.id);
    expect(ids).toContain(child1.id);
    expect(ids).toContain(child2.id);
  });

  it('returns empty array when the parent has no children', async () => {
    const leaf = createPlace(db, { name: 'Kärda', place_type: 'parish' });

    const result = await callTool<any[]>(tools, 'list_place_children', {
      parent_place_id: leaf.id,
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('includes hasChildren flag indicating whether a child has its own children', async () => {
    const root = createPlace(db, { name: 'Sverige' });
    const mid = createPlace(db, { name: 'Jönköpings län', parent_place_id: root.id });
    // Give `mid` a child so hasChildren = true
    createPlace(db, { name: 'Fröderyd', parent_place_id: mid.id });
    // A leaf child with no grandchildren
    createPlace(db, { name: 'Vetlanda', parent_place_id: root.id });

    const result = await callTool<Array<{ name: string; hasChildren: number | boolean }>>(
      tools,
      'list_place_children',
      { parent_place_id: root.id },
    );

    const midRow = result.find((r) => r.name === 'Jönköpings län');
    const leafRow = result.find((r) => r.name === 'Vetlanda');

    expect(midRow).toBeDefined();
    expect(leafRow).toBeDefined();
    // SQLite returns 1/0 for boolean; treat as truthy/falsy
    expect(midRow!.hasChildren).toBeTruthy();
    expect(leafRow!.hasChildren).toBeFalsy();
  });
});

// ── get_place_ancestors ────────────────────────────────────────────────────

describe('get_place_ancestors', () => {
  it('registers the tool', () => {
    expect(tools.has('get_place_ancestors')).toBe(true);
  });

  it('returns empty array for an unknown place_id', async () => {
    const result = await callTool<any[]>(tools, 'get_place_ancestors', {
      place_id: 'nonexistent-id',
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns a single-element array for a root-level place', async () => {
    const root = createPlace(db, { name: 'Sverige', place_type: 'country' });

    const result = await callTool<any[]>(tools, 'get_place_ancestors', {
      place_id: root.id,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(root.id);
    expect(result[0].name).toBe('Sverige');
  });

  it('returns the full ancestor chain in root-to-leaf order', async () => {
    const country = createPlace(db, { name: 'Sverige', place_type: 'country' });
    const province = createPlace(db, { name: 'Kronobergs län', place_type: 'province', parent_place_id: country.id });
    const parish = createPlace(db, { name: 'Kärda', place_type: 'parish', parent_place_id: province.id });

    const result = await callTool<Array<{ id: string; name: string }>>(
      tools,
      'get_place_ancestors',
      { place_id: parish.id },
    );

    expect(result).toHaveLength(3);
    // root → leaf order
    expect(result[0].id).toBe(country.id);
    expect(result[1].id).toBe(province.id);
    expect(result[2].id).toBe(parish.id);
    expect(result[0].name).toBe('Sverige');
    expect(result[1].name).toBe('Kronobergs län');
    expect(result[2].name).toBe('Kärda');
  });

  it('handles a two-level chain correctly', async () => {
    const parent = createPlace(db, { name: 'Jönköpings län', place_type: 'province' });
    const child = createPlace(db, { name: 'Fröderyd', place_type: 'parish', parent_place_id: parent.id });

    const result = await callTool<Array<{ id: string }>>(
      tools,
      'get_place_ancestors',
      { place_id: child.id },
    );

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(parent.id);
    expect(result[1].id).toBe(child.id);
  });
});

// ── update_place ───────────────────────────────────────────────────────────

describe('update_place', () => {
  it('registers the tool', () => {
    expect(tools.has('update_place')).toBe(true);
  });

  it('rejects a comma-separated name on update', async () => {
    const place = createPlace(db, { name: 'Chennai' });
    const tool = tools.get('update_place')!;
    await expect(
      tool.handler({ id: place.id, name: 'Chennai, India, World' }),
    ).rejects.toThrow(/comma|parent_chain/i);

    // Name was NOT changed
    const row = db.prepare('SELECT * FROM places WHERE id = ?').get([place.id]) as any;
    expect(row.name).toBe('Chennai');
  });

  it('accepts a single-component name on update', async () => {
    const place = createPlace(db, { name: 'Madras' });
    await callTool(tools, 'update_place', { id: place.id, name: 'Chennai' });

    const row = db.prepare('SELECT * FROM places WHERE id = ?').get([place.id]) as any;
    expect(row.name).toBe('Chennai');
  });

  it('updates other fields without touching name (no comma check needed)', async () => {
    const place = createPlace(db, { name: 'Chennai' });
    await callTool(tools, 'update_place', { id: place.id, place_type: 'city' });

    const row = db.prepare('SELECT * FROM places WHERE id = ?').get([place.id]) as any;
    expect(row.name).toBe('Chennai');
    expect(row.place_type).toBe('city');
  });
});
