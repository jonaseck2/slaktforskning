# Media Ordering, Profile Picture & Export Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users reorder media for a person, use the first media as a profile picture in the detail view and exports, and fix image cropping in the ancestor book report.

**Architecture:** Add `sort_order` column to `media_links`, update API/IPC/MCP/import to respect it, add reorder UI with up/down arrows, show first media as profile thumbnail in person detail header, fix `object-fit` in report CSS.

**Tech Stack:** SQLite migration, TypeScript API, Vue 3 components, Electron IPC

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/api/schema.ts:187-196,289-302` | Add `sort_order` to CREATE TABLE + migration |
| Modify | `src/api/types.ts:179-186` | Add `sort_order` to `MediaLink` interface |
| Modify | `src/api/media.ts` | Update queries + add `reorderMediaLinks` function |
| Modify | `src/main/ipc.ts:410-417` | Add `media:reorder` IPC handler |
| Modify | `src/preload/index.ts:152-164` | Add `reorder` to `window.api.media` |
| Modify | `src/mcp/createServer.ts:897+` | Add `reorder_media_link` MCP tool |
| Modify | `src/import/gedcom/import-core.ts:686-690,804-807,356-359` | Pass sort_order during import |
| Modify | `src/renderer/components/PersonMediaSection.vue` | Add up/down buttons, profile badge |
| Modify | `src/renderer/views/PersonDetailView.vue:1-10` | Add profile thumbnail in header |
| Modify | `src/renderer/components/reports/AncestorBookReport.vue:711-718` | Fix cropping CSS |
| Modify | `src/renderer/i18n/en.ts` | Add i18n keys for profile/reorder |
| Modify | `src/renderer/i18n/sv.ts` | Add i18n keys for profile/reorder |
| Modify | `tests/unit/media.test.ts` | Add sort_order + reorder tests |

---

### Task 1: Schema migration + types

**Files:**
- Modify: `src/api/schema.ts:187-196,289-302`
- Modify: `src/api/types.ts:179-186`

- [x] **Step 1: Add `sort_order` to CREATE TABLE in schema.ts**

In `src/api/schema.ts`, in the `media_links` CREATE TABLE block (lines 187-194), add the `sort_order` column after `link_type`:

```sql
      link_type INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
```

- [x] **Step 2: Add migration for existing databases**

After the `is_missing` migration block (line 293), add:

```typescript
  // v0.9.0 media_links: sort_order for user-controlled ordering
  const mediaLinkCols = (db.prepare('PRAGMA table_info(media_links)').all([]) as Array<{ name: string }>).map(c => c.name);
  if (!mediaLinkCols.includes('sort_order')) {
    db.exec('ALTER TABLE media_links ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }
```

- [x] **Step 3: Add `sort_order` to MediaLink type**

In `src/api/types.ts`, add `sort_order: number;` to the `MediaLink` interface (after `link_type`):

```typescript
export interface MediaLink {
  id: string;
  media_id: string;
  entity_type: MediaLinkEntityType;
  entity_id: string;
  link_type: number | null;
  sort_order: number;
  created_at: string;
}
```

- [x] **Step 4: Run tests to verify migration doesn't break existing tests**

Run: `npm test`
Expected: All existing tests pass (the migration is additive, defaults to 0).

- [x] **Step 5: Commit**

```
feat: add sort_order column to media_links
```

---

### Task 2: API — update queries + add reorder function

**Files:**
- Modify: `src/api/media.ts`
- Modify: `tests/unit/media.test.ts`

- [x] **Step 1: Write failing tests for sort_order behavior**

Add to `tests/unit/media.test.ts`, inside the `'media links'` describe block:

```typescript
  it('getMediaForEntity returns items ordered by sort_order', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'Order' });
    const m1 = createMedia(db, { title: 'Photo C' });
    const m2 = createMedia(db, { title: 'Photo A' });
    const m3 = createMedia(db, { title: 'Photo B' });

    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id, sort_order: 2 });
    addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id, sort_order: 0 });
    addMediaLink(db, { media_id: m3.id, entity_type: 'person', entity_id: person.id, sort_order: 1 });

    const results = getMediaForEntity(db, 'person', person.id);
    expect(results.map(r => r.title)).toEqual(['Photo A', 'Photo B', 'Photo C']);
  });

  it('addMediaLink auto-assigns sort_order as next in sequence', () => {
    const person = createPerson(db, { given_name: 'Auto', surname: 'Order' });
    const m1 = createMedia(db, { title: 'First' });
    const m2 = createMedia(db, { title: 'Second' });
    const m3 = createMedia(db, { title: 'Third' });

    const l1 = addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    const l2 = addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id });
    const l3 = addMediaLink(db, { media_id: m3.id, entity_type: 'person', entity_id: person.id });

    expect(l1.sort_order).toBe(0);
    expect(l2.sort_order).toBe(1);
    expect(l3.sort_order).toBe(2);
  });

  it('reorderMediaLinks updates sort_order for all links of an entity', () => {
    const person = createPerson(db, { given_name: 'Reorder', surname: 'Test' });
    const m1 = createMedia(db, { title: 'First' });
    const m2 = createMedia(db, { title: 'Second' });
    const m3 = createMedia(db, { title: 'Third' });

    const l1 = addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    const l2 = addMediaLink(db, { media_id: m2.id, entity_type: 'person', entity_id: person.id });
    const l3 = addMediaLink(db, { media_id: m3.id, entity_type: 'person', entity_id: person.id });

    // Reverse the order: Third, Second, First
    reorderMediaLinks(db, [l3.id, l2.id, l1.id]);

    const results = getMediaForEntity(db, 'person', person.id);
    expect(results.map(r => r.title)).toEqual(['Third', 'Second', 'First']);
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/media.test.ts`
Expected: FAIL — `sort_order` param not accepted by `addMediaLink`, `reorderMediaLinks` not defined.

- [x] **Step 3: Update `addMediaLink` to accept and auto-assign sort_order**

In `src/api/media.ts`, update `addMediaLink`:

```typescript
export function addMediaLink(db: Database, data: {
  media_id: string;
  entity_type: MediaLinkEntityType;
  entity_id: string;
  link_type?: number | null;
  sort_order?: number;
}): MediaLink {
  const id = crypto.randomUUID();
  let sortOrder = data.sort_order;
  if (sortOrder === undefined) {
    const max = queryOne<{ m: number | null }>(db,
      'SELECT MAX(sort_order) AS m FROM media_links WHERE entity_type = ? AND entity_id = ?',
      [data.entity_type, data.entity_id]);
    sortOrder = (max?.m ?? -1) + 1;
  }
  runSql(db, `
    INSERT INTO media_links (id, media_id, entity_type, entity_id, link_type, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, data.media_id, data.entity_type, data.entity_id, data.link_type ?? null, sortOrder]);
  return queryOne<MediaLink>(db, 'SELECT * FROM media_links WHERE id = ?', [id])!;
}
```

- [x] **Step 4: Update `getMediaForEntity` to order by sort_order**

Change the ORDER BY in `getMediaForEntity`:

```typescript
export function getMediaForEntity(db: Database, entityType: MediaLinkEntityType, entityId: string): (Media & { link_id: string; link_type: number | null; sort_order: number })[] {
  return queryAll<Media & { link_id: string; link_type: number | null; sort_order: number }>(db, `
    SELECT m.*, ml.id AS link_id, ml.link_type, ml.sort_order
    FROM media m
    JOIN media_links ml ON ml.media_id = m.id
    WHERE ml.entity_type = ? AND ml.entity_id = ?
    ORDER BY ml.sort_order, ml.created_at
  `, [entityType, entityId]);
}
```

- [x] **Step 5: Add `reorderMediaLinks` function**

Add to `src/api/media.ts`:

```typescript
export function reorderMediaLinks(db: Database, linkIds: string[]): void {
  const stmt = db.prepare('UPDATE media_links SET sort_order = ? WHERE id = ?');
  for (let i = 0; i < linkIds.length; i++) {
    stmt.run([i, linkIds[i]]);
  }
  stmt.finalize();
}
```

- [x] **Step 6: Update imports in test file**

Add `reorderMediaLinks` to the import statement in `tests/unit/media.test.ts`:

```typescript
import {
  createMedia,
  getMedia,
  listMedia,
  deleteMedia,
  addMediaLink,
  getMediaForEntity,
  removeMediaLink,
  reorderMediaLinks,
} from '../../src/api/media';
```

- [x] **Step 7: Run tests**

Run: `npm test -- tests/unit/media.test.ts`
Expected: All tests pass, including new sort_order tests.

- [x] **Step 8: Commit**

```
feat: media ordering — sort_order in addMediaLink, getMediaForEntity, reorderMediaLinks
```

---

### Task 3: IPC + Preload + MCP wiring

**Files:**
- Modify: `src/main/ipc.ts:410-417`
- Modify: `src/preload/index.ts:152-164`
- Modify: `src/mcp/createServer.ts:897+`

- [x] **Step 1: Add IPC handler for media:reorder**

In `src/main/ipc.ts`, after the `media:removeLink` handler (line 417), add:

```typescript
  wrapHandler('media:reorder', (linkIds) => media.reorderMediaLinks(getDatabase(), linkIds as string[]));
```

Also add `reorderMediaLinks` to the import from `../../api/media` at the top of the file (find the existing media import).

- [x] **Step 2: Add preload binding**

In `src/preload/index.ts`, inside the `media` object (around line 159), add after `removeLink`:

```typescript
    reorder: mutating((linkIds: string[]) => ipcRenderer.invoke('media:reorder', linkIds)),
```

- [x] **Step 3: Add MCP tool**

In `src/mcp/createServer.ts`, after the `remove_media_link` tool registration, add:

```typescript
  server.registerTool('reorder_media_links', {
    description: 'Reorder media links by providing the link IDs in the desired order. The first ID gets sort_order 0, second gets 1, etc.',
    inputSchema: {
      link_ids: z.array(z.string()).describe('Media link IDs in desired display order'),
    },
  }, async ({ link_ids }) => {
    media.reorderMediaLinks(db, link_ids);
    return { content: [{ type: 'text', text: `Reordered ${link_ids.length} media links` }] };
  });
```

- [x] **Step 4: Run tests to verify nothing broke**

Run: `npm test`
Expected: All tests pass.

- [x] **Step 5: Commit**

```
feat: media reorder — IPC handler, preload binding, MCP tool
```

---

### Task 4: Import — preserve GEDCOM OBJE ordering

**Files:**
- Modify: `src/import/gedcom/import-core.ts:686-690,804-807,356-359`

- [x] **Step 1: Add sort_order counter when importing person media**

In `src/import/gedcom/import-core.ts`, around line 686-690, change the person media import loop to track order:

```typescript
    // Person-level media
    let personMediaOrder = 0;
    for (const objeNode of getChildren(node, 'OBJE')) {
      const mediaId = importObjeNode(db, objeNode, objeMap, options);
      if (mediaId) {
        addMediaLink(db, { media_id: mediaId, entity_type: 'person', entity_id: person.id, sort_order: personMediaOrder });
        personMediaOrder++;
      }
    }
```

- [x] **Step 2: Add sort_order counter for relationship media**

Around line 804-807, change the relationship media import loop:

```typescript
    // Family-level media
    let relMediaOrder = 0;
    for (const objeNode of getChildren(node, 'OBJE')) {
      const mediaId = importObjeNode(db, objeNode, objeMap, options);
      if (mediaId) {
        addMediaLink(db, { media_id: mediaId, entity_type: 'relationship', entity_id: couple.id, sort_order: relMediaOrder });
        relMediaOrder++;
      }
    }
```

- [x] **Step 3: Add sort_order counter for event media**

Around line 356-359, change the event media import loop:

```typescript
  // Event media
  let eventMediaOrder = 0;
  for (const objeNode of getChildren(evNode, 'OBJE')) {
    const mediaId = importObjeNode(db, objeNode, objeMap, importOptions);
    if (mediaId) {
      addMediaLink(db, { media_id: mediaId, entity_type: 'event', entity_id: event.id, sort_order: eventMediaOrder });
      eventMediaOrder++;
    }
  }
```

- [x] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass (import tests use sort_order param now).

- [x] **Step 5: Commit**

```
feat: preserve GEDCOM OBJE ordering during import
```

---

### Task 5: PersonMediaSection — reorder UI

**Files:**
- Modify: `src/renderer/components/PersonMediaSection.vue`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [x] **Step 1: Add i18n keys**

In `src/renderer/i18n/en.ts`, in the `media` section, add:

```typescript
    profile: 'Profile',
    moveUp: 'Move up',
    moveDown: 'Move down',
```

In `src/renderer/i18n/sv.ts`, in the `media` section, add:

```typescript
    profile: 'Profil',
    moveUp: 'Flytta upp',
    moveDown: 'Flytta ner',
```

- [x] **Step 2: Update PersonMediaSection template**

Replace the entire `<template>` in `src/renderer/components/PersonMediaSection.vue`:

```vue
<template>
  <div>
    <div v-if="media.length === 0" class="empty-hint">{{ $t('media.noMedia') }}</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th class="th-shrink"></th>
          <th>{{ $t('media.title_label') }}</th>
          <th class="th-shrink">{{ $t('media.format') }}</th>
          <th class="actions-cell">{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(m, idx) in media" :key="m.link_id">
          <td class="td-shrink order-cell">
            <span v-if="idx === 0" class="profile-badge">{{ $t('media.profile') }}</span>
            <button class="btn-order" :disabled="idx === 0" @click="moveUp(idx)" :title="$t('media.moveUp')">▲</button>
            <button class="btn-order" :disabled="idx === media.length - 1" @click="moveDown(idx)" :title="$t('media.moveDown')">▼</button>
          </td>
          <td>{{ m.title || '—' }}</td>
          <td class="td-shrink">{{ m.format || '—' }}</td>
          <td class="actions-cell">
            <button v-if="m.file_ref" class="btn-sm" @click="openFile(m.id)">{{ $t('media.open') }}</button>
            <button class="btn-sm btn-delete" @click="unlink(m.link_id)">✕</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

- [x] **Step 3: Update script to add move functions**

Replace the `<script setup>` block:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';

export interface MediaItem {
  id: string;
  title: string;
  file_ref: string | null;
  format: string | null;
  link_id: string;
  link_type: number | null;
  sort_order: number;
}

const props = defineProps<{ personId: string }>();
const emit = defineEmits<{ profileChanged: [] }>();

const media = ref<MediaItem[]>([]);

defineExpose({ attach, reload: load });

async function load() {
  media.value = (await window.api.media.forEntity('person', props.personId)) as MediaItem[];
}

async function attach() {
  const result = await window.api.media.attach({ entityType: 'person', entityId: props.personId });
  if (!result.canceled) {
    await load();
    emit('profileChanged');
  }
}

async function openFile(id: string) {
  await window.api.media.openFile(id);
}

async function unlink(linkId: string) {
  await window.api.media.removeLink(linkId);
  await load();
  emit('profileChanged');
}

async function reorder(newOrder: MediaItem[]) {
  media.value = newOrder;
  await window.api.media.reorder(newOrder.map(m => m.link_id));
  emit('profileChanged');
}

function moveUp(idx: number) {
  if (idx === 0) return;
  const items = [...media.value];
  [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
  reorder(items);
}

function moveDown(idx: number) {
  if (idx === media.value.length - 1) return;
  const items = [...media.value];
  [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
  reorder(items);
}

watch(() => props.personId, load, { immediate: true });
</script>
```

- [x] **Step 4: Update styles**

Replace the `<style scoped>` block:

```vue
<style scoped>
.th-shrink, .td-shrink { width: 1%; white-space: nowrap; }
.actions-cell { width: 1px; text-align: right; white-space: nowrap; vertical-align: middle; }
.order-cell { text-align: center; vertical-align: middle; }
.btn-order {
  background: none;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0 3px;
  font-size: 10px;
  color: #888;
  line-height: 1;
}
.btn-order:hover:not(:disabled) { color: #333; border-color: #ccc; }
.btn-order:disabled { opacity: 0.3; cursor: default; }
.profile-badge {
  display: inline-block;
  font-size: var(--font-xs, 11px);
  background: #e8f0fe;
  color: #1a73e8;
  padding: 1px 6px;
  border-radius: 3px;
  margin-bottom: 2px;
}
</style>
```

- [x] **Step 5: Run `npm test` and verify no regressions**

Run: `npm test`
Expected: All tests pass.

- [x] **Step 6: Commit**

```
feat: media reorder UI with up/down buttons and profile badge
```

---

### Task 6: Profile picture in PersonDetailView header

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue:1-10`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [x] **Step 1: Add i18n key for profile picture alt text**

In both `en.ts` and `sv.ts`, in the `media` section, add:

```typescript
    // en.ts
    profileAlt: 'Profile picture',
    // sv.ts
    profileAlt: 'Profilbild',
```

- [x] **Step 2: Update PersonDetailView template header**

Replace the `detail-header` div (lines 3-10 of the template) in `src/renderer/views/PersonDetailView.vue`:

```vue
    <div class="detail-header">
      <button class="btn-back" @click="$router.back()">{{ $t('personDetail.back') }}</button>
      <div class="header-row">
        <img
          v-if="profilePicUrl"
          :src="profilePicUrl"
          class="profile-thumbnail"
          :alt="$t('media.profileAlt')"
        />
        <div v-else class="profile-placeholder" :class="'sex-' + person.sex">
          {{ person.sex === 'F' ? '♀' : person.sex === 'M' ? '♂' : '?' }}
        </div>
        <div class="header-info">
          <h2>{{ primaryName }}</h2>
          <span v-if="!person.living" class="deceased-badge">{{ $t('personDetail.deceased') }}</span>
          <button type="button" class="btn-view-tree" data-testid="view-in-tree-btn" @click="$router.push('/visualisering/' + personId)">{{ $t('personDetail.viewInTree') }} →</button>
        </div>
      </div>
    </div>
```

- [x] **Step 3: Add profilePicUrl ref and loading logic**

In the `<script setup>` section, add a ref and a function to load the profile picture. Find the existing `person` ref and add nearby:

```typescript
const profilePicUrl = ref<string | null>(null);

async function loadProfilePic() {
  if (!person.value) { profilePicUrl.value = null; return; }
  const mediaItems = await window.api.media.forEntity('person', person.value.id) as Array<{ id: string }>;
  if (mediaItems.length > 0) {
    profilePicUrl.value = await window.api.media.readAsDataUrl(mediaItems[0].id) as string | null;
  } else {
    profilePicUrl.value = null;
  }
}
```

Call `loadProfilePic()` after loading the person data (in the existing `loadPerson` or equivalent function, after the person is fetched).

- [x] **Step 4: Wire profileChanged event from PersonMediaSection**

Find the `<PersonMediaSection>` usage in the template and add the event handler:

```vue
  <PersonMediaSection ref="mediaSectionRef" :person-id="person.id" @profile-changed="loadProfilePic" />
```

- [x] **Step 5: Add CSS for profile thumbnail**

In the `<style scoped>` section, add:

```css
.header-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.profile-thumbnail {
  width: 80px;
  height: 80px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid #ddd;
  background: #f5f5f5;
  flex-shrink: 0;
}
.profile-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 6px;
  border: 1px solid #ddd;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: #bbb;
  flex-shrink: 0;
}
.profile-placeholder.sex-M { color: #6fa8dc; }
.profile-placeholder.sex-F { color: #e06666; }
```

- [x] **Step 6: Run tests**

Run: `npm test`
Expected: All tests pass.

- [x] **Step 7: Commit**

```
feat: profile picture thumbnail in person detail header
```

---

### Task 7: Fix image cropping in AncestorBookReport

**Files:**
- Modify: `src/renderer/components/reports/AncestorBookReport.vue:711-718`

- [x] **Step 1: Update CSS for .ab-photo-img**

In `src/renderer/components/reports/AncestorBookReport.vue`, replace the `.ab-photo-img` style (lines 711-718):

```css
.ab-photo-img {
  display: block;
  max-width: 160px;
  max-height: 200px;
  width: auto;
  height: auto;
  object-fit: contain;
  border: 1px solid #ddd;
  border-radius: 2px;
}
```

This removes the fixed width/height that forced `object-fit: cover` to crop, and instead constrains the image within a max box while preserving its natural aspect ratio.

- [x] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass.

- [x] **Step 3: Commit**

```
fix: preserve image aspect ratio in ancestor book report
```

---

### Task 8: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`

- [x] **Step 1: Update CLAUDE.md**

In the `MediaLink` interface in the Domain Types section, add `sort_order: number` field.

In the `media.ts` API functions section, add:
```
reorderMediaLinks(db, linkIds: string[]) → void
```

In the `addMediaLink` parameters, note that `sort_order` is optional and auto-assigned.

In the MCP tools section, add `reorder_media_links` tool.

In the `window.api` / preload section reference, note the new `reorder` method.

In the PersonMediaSection shared component table, update description to mention reordering and profile badge.

- [x] **Step 2: Update docs/PLAN.md**

Add a completed milestone for media ordering + profile picture.

- [x] **Step 3: Commit**

```
docs: update CLAUDE.md and PLAN.md for media ordering feature
```
