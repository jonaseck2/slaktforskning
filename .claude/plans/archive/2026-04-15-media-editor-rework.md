# Media Editor Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `updateMedia` to the full stack (API/IPC/MCP/preload) and give MediaView a table mode with inline editing of title and notes.

**Architecture:** New `updateMedia` function follows the standard pattern (see `updatePlace`, `updateSource`). MediaView gets a gallery/table toggle persisted to localStorage. Table mode uses blur-to-save pattern for title and notes columns.

**Tech Stack:** TypeScript, Vue 3, SQLite, MCP (zod schemas).

**Spec:** `docs/plans/2026-04-15-gazetteer-quality-media-editor-design.md` (Feature 3)

---

### Task 1: Add updateMedia to API layer with tests

**Files:**
- Modify: `src/api/media.ts`
- Test: `tests/unit/media.test.ts` (create or extend)

- [ ] **Step 1: Write failing tests**

Create `tests/unit/media-update.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createMedia, getMedia, updateMedia } from '../../src/api/media';

describe('updateMedia', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('updates title', () => {
    const m = createMedia(db, { title: 'Old title' });
    const updated = updateMedia(db, m.id, { title: 'New title' });
    expect(updated?.title).toBe('New title');
    expect(getMedia(db, m.id)?.title).toBe('New title');
  });

  it('updates notes', () => {
    const m = createMedia(db, { title: 'Test', notes: '' });
    const updated = updateMedia(db, m.id, { notes: 'Some notes' });
    expect(updated?.notes).toBe('Some notes');
  });

  it('updates format', () => {
    const m = createMedia(db, { title: 'Test', format: 'jpg' });
    const updated = updateMedia(db, m.id, { format: 'png' });
    expect(updated?.format).toBe('png');
  });

  it('updates is_printable', () => {
    const m = createMedia(db, { title: 'Test' });
    expect(m.is_printable).toBeFalsy();
    const updated = updateMedia(db, m.id, { is_printable: true });
    expect(updated?.is_printable).toBeTruthy();
  });

  it('partial update preserves other fields', () => {
    const m = createMedia(db, { title: 'Keep', notes: 'Keep notes', format: 'jpg' });
    const updated = updateMedia(db, m.id, { title: 'Changed' });
    expect(updated?.title).toBe('Changed');
    expect(updated?.notes).toBe('Keep notes');
    expect(updated?.format).toBe('jpg');
  });

  it('returns null for non-existent id', () => {
    const result = updateMedia(db, 'non-existent', { title: 'x' });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/media-update.test.ts`
Expected: FAIL — `updateMedia` not exported

- [ ] **Step 3: Implement updateMedia**

Add to `src/api/media.ts`, after the `deleteMedia` function:

```typescript
export function updateMedia(db: Database, id: string, data: {
  title?: string;
  notes?: string;
  format?: string | null;
  is_printable?: boolean;
}): Media | null {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
  if (data.format !== undefined) { fields.push('format = ?'); values.push(data.format); }
  if (data.is_printable !== undefined) { fields.push('is_printable = ?'); values.push(data.is_printable ? 1 : 0); }

  if (fields.length === 0) return getMedia(db, id);

  values.push(id);
  const changes = runSqlChanges(db, `UPDATE media SET ${fields.join(', ')} WHERE id = ?`, values);
  if (changes === 0) return null;
  return getMedia(db, id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/media-update.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```
git add src/api/media.ts tests/unit/media-update.test.ts
git commit -m "feat: add updateMedia API function with tests"
```

---

### Task 2: Add IPC handler and preload binding

**Files:**
- Modify: `src/main/ipc/media.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add IPC handler**

In `src/main/ipc/media.ts`, after the `media:delete` handler, add:

```typescript
  wrapHandler('media:update', (id, data) => media.updateMedia(getDb(), id as string, data as Parameters<typeof media.updateMedia>[1]));
```

- [ ] **Step 2: Add preload binding**

In `src/preload/index.ts`, find the `media:` section and add:

```typescript
    update: mutating((id: string, data: unknown) => ipcRenderer.invoke('media:update', id, data)),
```

Add it after the existing `delete` binding.

- [ ] **Step 3: Commit**

```
git add src/main/ipc/media.ts src/preload/index.ts
git commit -m "feat: add media:update IPC handler and preload binding"
```

---

### Task 3: Add MCP tool

**Files:**
- Modify: `src/mcp/tools/media.ts`

- [ ] **Step 1: Add update_media tool**

In `src/mcp/tools/media.ts`, find where the other media tools are registered and add:

```typescript
  server.tool('update_media', 'Update media metadata (title, notes, format, is_printable)',
    {
      id: z.string().describe('Media ID'),
      title: z.string().optional().describe('New title'),
      notes: z.string().optional().describe('New notes/description'),
      format: z.string().optional().describe('File format'),
      is_printable: z.boolean().optional().describe('Whether media is printable'),
    },
    async ({ id, ...data }) => {
      const result = media.updateMedia(getDb(), id, data);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
```

- [ ] **Step 2: Run tests to verify nothing breaks**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```
git add src/mcp/tools/media.ts
git commit -m "feat: add update_media MCP tool"
```

---

### Task 4: Add table view mode to MediaView

**Files:**
- Modify: `src/renderer/views/MediaView.vue`

- [ ] **Step 1: Add view mode toggle state**

In the `<script setup>` section, add:

```typescript
type ViewMode = 'gallery' | 'table';
const viewMode = ref<ViewMode>(
  (localStorage.getItem('media-view-mode') as ViewMode) || 'gallery'
);

function setViewMode(mode: ViewMode) {
  viewMode.value = mode;
  localStorage.setItem('media-view-mode', mode);
}
```

- [ ] **Step 2: Add save handler for inline editing**

```typescript
async function saveField(itemId: string, field: 'title' | 'notes', value: string) {
  try {
    await window.api.media.update(itemId, { [field]: value });
  } catch (err) {
    console.error('[MediaView] saveField failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
```

Add `useToast` import and `const toast = useToast();` if not already present.

- [ ] **Step 3: Add toggle buttons to template**

After the search filter div, add:

```html
    <!-- View mode toggle -->
    <div v-if="!loading && items.length > 0" class="view-toggle">
      <button
        :class="['btn-sm', { active: viewMode === 'gallery' }]"
        @click="setViewMode('gallery')"
      >{{ $t('media.galleryView') }}</button>
      <button
        :class="['btn-sm', { active: viewMode === 'table' }]"
        @click="setViewMode('table')"
      >{{ $t('media.tableView') }}</button>
    </div>
```

- [ ] **Step 4: Add table view template**

Wrap the existing gallery grid in `v-if="viewMode === 'gallery'"` and add the table view:

```html
    <!-- Table view -->
    <table v-else-if="viewMode === 'table' && filteredItems.length > 0" class="data-table media-table">
      <colgroup>
        <col style="width: 48px">
        <col>
        <col style="width: 60px">
        <col>
        <col style="width: 60px">
        <col style="width: 60px">
        <col style="width: 40px">
      </colgroup>
      <thead>
        <tr>
          <th></th>
          <th>{{ $t('media.colTitle') }}</th>
          <th>{{ $t('media.colFormat') }}</th>
          <th>{{ $t('media.colNotes') }}</th>
          <th>{{ $t('media.colLinks') }}</th>
          <th>{{ $t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in filteredItems" :key="item.id">
          <td class="thumb-cell">
            <img
              v-if="thumbnails[item.id]"
              :src="thumbnails[item.id]"
              class="table-thumb"
              @click="openLightbox(filteredItems.indexOf(item))"
            />
            <span v-else class="table-thumb-placeholder">{{ (item.format || '?').toUpperCase() }}</span>
          </td>
          <td>
            <input
              type="text"
              :value="item.title"
              class="inline-edit"
              @blur="e => { const v = (e.target as HTMLInputElement).value; if (v !== item.title) { item.title = v; saveField(item.id, 'title', v); } }"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </td>
          <td class="format-cell">
            <span v-if="item.format" class="format-badge">{{ item.format }}</span>
          </td>
          <td>
            <input
              type="text"
              :value="item.notes"
              class="inline-edit"
              :placeholder="$t('media.notesPlaceholder')"
              @blur="e => { const v = (e.target as HTMLInputElement).value; if (v !== item.notes) { item.notes = v; saveField(item.id, 'notes', v); } }"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </td>
          <td class="links-cell">{{ item.linkCount }}</td>
          <td>
            <button
              class="btn-sm btn-delete"
              @click="deleteItem(item.id)"
              :title="$t('media.delete')"
            >&#10005;</button>
          </td>
        </tr>
      </tbody>
    </table>
```

- [ ] **Step 5: Add table-specific styles**

```css
.view-toggle {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}
.view-toggle .btn-sm.active {
  background: #4a9eff;
  color: white;
  border-color: #4a9eff;
}

.media-table .thumb-cell {
  padding: 4px;
}
.table-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  cursor: pointer;
}
.table-thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: #f0f0f0;
  border-radius: 4px;
  font-size: var(--font-xs);
  font-weight: 600;
  color: #888;
}
.inline-edit {
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  padding: 4px 6px;
  font-size: var(--font-sm);
  border-radius: 4px;
  outline: none;
}
.inline-edit:focus {
  border-color: #4a9eff;
  background: white;
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.15);
}
.format-badge {
  font-size: var(--font-xs);
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
}
.format-cell, .links-cell {
  text-align: center;
}
```

- [ ] **Step 6: Commit**

```
git add src/renderer/views/MediaView.vue
git commit -m "feat: add table view mode with inline editing to MediaView"
```

---

### Task 5: Add i18n keys and finalize

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `docs/PLAN.md`
- Modify: `package.json`

- [ ] **Step 1: Add Swedish translations**

In `sv.ts`, inside the `media` object, add:

```typescript
    galleryView: 'Galleri',
    tableView: 'Tabell',
    colTitle: 'Titel',
    colFormat: 'Format',
    colNotes: 'Anteckningar',
    colLinks: 'Lankar',
    notesPlaceholder: 'Lagg till anteckningar...',
```

- [ ] **Step 2: Add English translations**

In `en.ts`, inside the `media` object, add:

```typescript
    galleryView: 'Gallery',
    tableView: 'Table',
    colTitle: 'Title',
    colFormat: 'Format',
    colNotes: 'Notes',
    colLinks: 'Links',
    notesPlaceholder: 'Add notes...',
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Update PLAN.md and bump version (minor — new feature)**

Add implementation status row. Bump minor version.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(vX.Y.0): media editor rework — updateMedia API + table view with inline editing"
```
