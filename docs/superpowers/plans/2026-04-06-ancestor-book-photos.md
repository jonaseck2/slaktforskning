# Ancestor Book — Photos Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all person-linked photos (with notes) in a "Foton" subsection inside each person summary in the Ancestor Book report, placed after Relationer and Anteckningar, before Källor.

**Architecture:** All changes are in `AncestorBookReport.vue`. Two new interfaces (`RawMedia`, `EnrichedMedia`) are added. `fetchAncestorFullData` is extended to fetch media and resolve file paths via existing IPC handlers. The template gets a new subsection that renders photos as a flex row with captions.

**Tech Stack:** Vue 3 `<script setup>`, `window.api.media.forEntity` + `window.api.media.getFilePath` (already wired in preload/IPC), `file://` URLs for local image src.

---

### Task 1: Add types and fetch media in `fetchAncestorFullData`

**Files:**
- Modify: `src/renderer/components/reports/AncestorBookReport.vue`

No unit test is practical here (Vue component + Electron IPC). Verification is visual in the running app.

- [ ] **Step 1: Add `RawMedia` and `EnrichedMedia` interfaces**

In `AncestorBookReport.vue`, after the existing `interface RawPerson` block (around line 293), add:

```typescript
interface RawMedia {
  id: string;
  title: string | null;
  file_ref: string | null;
  format: string | null;
  notes: string | null;
  link_id: string;
  link_type: string | null;
}
interface EnrichedMedia {
  id: string;
  title: string | null;
  notes: string | null;
  filePath: string;  // absolute path — only items with a resolved path are kept
}
```

- [ ] **Step 2: Add `media` field to `AncestorEntry`**

In the `interface AncestorEntry` block (currently lines 306–316), add one field:

```typescript
interface AncestorEntry {
  ahnNum: number;
  person: PersonNode;
  names: RawName[];
  events: EnrichedEvent[];
  parents: PersonRef[];
  spouses: PersonRef[];
  children: PersonRef[];
  sources: RawSource[];
  notes: string | null;
  media: EnrichedMedia[];          // ← add this
}
```

- [ ] **Step 3: Fetch and enrich media in `fetchAncestorFullData`**

After the sources block (after the `filter((s): s is RawSource => ...)` line, around line 590), add:

```typescript
  // Fetch person-linked media and resolve file paths
  const rawMedia = (await window.api.media.forEntity('person', pid)) as RawMedia[];
  const enrichedMedia: EnrichedMedia[] = (
    await Promise.all(
      rawMedia.map(async m => {
        const filePath = (await window.api.media.getFilePath(m.id)) as string | null;
        if (!filePath) return null;
        return { id: m.id, title: m.title, notes: m.notes, filePath };
      }),
    )
  ).filter((m): m is EnrichedMedia => m !== null);
```

- [ ] **Step 4: Include `media` in the return value**

Update the `return { ... }` statement at the end of `fetchAncestorFullData` (currently lines 592–602):

```typescript
  return {
    ahnNum,
    person,
    names: [...names].sort((a, b) => a.sort_order - b.sort_order),
    events: enrichedEvents,
    parents,
    spouses,
    children,
    sources,
    notes: personFull?.notes ?? null,
    media: enrichedMedia,
  };
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/reports/AncestorBookReport.vue
git commit -m "feat(ancestor-book): fetch person-linked media in report data"
```

---

### Task 2: Add "Foton" subsection to the template

**Files:**
- Modify: `src/renderer/components/reports/AncestorBookReport.vue`

- [ ] **Step 1: Add the Foton template section**

In the template, find the `<!-- Notes -->` block (around line 220) and the `<!-- Sources -->` block immediately after it (around line 226). Insert the Foton section **between** Notes and Sources:

```html
        <!-- Photos -->
        <div v-if="entry.media.length > 0" class="ab-subsection">
          <h3 class="ab-subsection-heading">Foton</h3>
          <div class="ab-photos">
            <div v-for="m in entry.media" :key="m.id" class="ab-photo">
              <img :src="`file://${m.filePath}`" class="ab-photo-img" />
              <p v-if="m.notes" class="ab-photo-note">{{ m.notes }}</p>
              <p v-else-if="m.title" class="ab-photo-note ab-photo-note--title">{{ m.title }}</p>
            </div>
          </div>
        </div>
```

- [ ] **Step 2: Add styles for the photo grid**

At the bottom of the `<style>` block (or wherever other `.ab-*` styles are defined), add:

```css
.ab-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}
.ab-photo {
  flex: 0 0 auto;
  max-width: 160px;
}
.ab-photo-img {
  display: block;
  max-width: 160px;
  max-height: 120px;
  width: auto;
  height: auto;
  object-fit: cover;
  border: 1px solid #ddd;
  border-radius: 2px;
}
.ab-photo-note {
  margin: 4px 0 0 0;
  font-size: 10px;
  color: #555;
  line-height: 1.4;
  white-space: pre-line;
  max-width: 160px;
}
.ab-photo-note--title {
  font-style: italic;
  color: #888;
}
```

- [ ] **Step 3: Verify in the running app**

```bash
npm start
```

Open the Reports view → Ancestor Book tab. Select a person who has imported media (e.g. from the Holger GEDCOM import). Confirm:
- "Foton" section appears after Relationer/Anteckningar for persons with photos
- Photos render correctly with notes below
- Persons without photos show no Foton section
- PDF export (via the Export PDF button) renders the images correctly

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/reports/AncestorBookReport.vue
git commit -m "feat(ancestor-book): add Foton subsection with photos and captions"
```
