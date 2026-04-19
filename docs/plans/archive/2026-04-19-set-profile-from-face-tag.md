# Set profile picture from face tag / media row — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users set a person's profile picture by clicking a star in either the face-tag list (MediaPanel) or the per-person media list (PersonMediaSection).

**Architecture:** Pure renderer change built on existing `window.api.media.reorder` IPC. A shared helper `setMediaAsPersonProfile(personId, mediaId)` reorders a person's media_links so the target media's link is first. MediaPanel uses it per face-tag row and derives a per-region "is this person's profile?" state. PersonMediaSection uses the component's existing `reorder()` directly because it already has the link_ids in memory.

**Tech Stack:** Vue 3 Composition API, TypeScript, existing `window.api.media.*` IPC.

**Spec:** `docs/superpowers/specs/2026-04-19-set-profile-from-face-tag-design.md`

---

## File Map

- **Create:** `src/renderer/utils/mediaProfile.ts` — shared helper `setMediaAsPersonProfile`
- **Modify:** `src/renderer/i18n/en.ts:945` — add `media.setAsProfile`, `media.currentProfile`
- **Modify:** `src/renderer/i18n/sv.ts:945` — add `media.setAsProfile`, `media.currentProfile`
- **Modify:** `src/renderer/components/PersonMediaSection.vue` — replace profile badge with star radio
- **Modify:** `src/renderer/components/MediaPanel.vue` — add star per tagged face-tag row + profile state map
- **Modify:** `package.json` — version bump to 0.120.0
- **Modify:** `docs/PLAN.md` — roadmap entry for v0.120.0

No backend, no schema, no IPC, no MCP changes.

---

## Task 1: Add i18n keys

**Files:**
- Modify: `src/renderer/i18n/en.ts` (after line 945 `profileAlt`)
- Modify: `src/renderer/i18n/sv.ts` (after line 945 `profileAlt`)

- [ ] **Step 1: Add English keys**

In `src/renderer/i18n/en.ts`, in the `media` namespace, add two keys right after the existing `profileAlt` line (around line 946):

```ts
    profileAlt: 'Profile picture',
    setAsProfile: 'Set as profile picture',
    currentProfile: 'Current profile picture',
    moveUp: 'Move up',
```

- [ ] **Step 2: Add Swedish keys**

In `src/renderer/i18n/sv.ts`, in the `media` namespace, add two keys right after `profileAlt` (around line 946):

```ts
    profileAlt: 'Profilbild',
    setAsProfile: 'Sätt som profilbild',
    currentProfile: 'Nuvarande profilbild',
    moveUp: 'Flytta upp',
```

- [ ] **Step 3: Verify both files compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no new errors related to i18n.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "i18n: add media.setAsProfile / media.currentProfile keys"
```

---

## Task 2: Create shared helper

**Files:**
- Create: `src/renderer/utils/mediaProfile.ts`

- [ ] **Step 1: Write helper**

Create `src/renderer/utils/mediaProfile.ts`:

```ts
declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface LinkRow {
  id: string;       // media id
  link_id: string;  // media_link id
}

export async function setMediaAsPersonProfile(personId: string, mediaId: string): Promise<void> {
  const links = await window.api.media.forEntity('person', personId) as LinkRow[];
  const target = links.find(l => l.id === mediaId);
  if (!target) return;
  const reordered = [target.link_id, ...links.filter(l => l.id !== mediaId).map(l => l.link_id)];
  await window.api.media.reorder(reordered);
}

export async function isMediaPersonProfile(personId: string, mediaId: string): Promise<boolean> {
  const links = await window.api.media.forEntity('person', personId) as LinkRow[];
  return links.length > 0 && links[0].id === mediaId;
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/utils/mediaProfile.ts
git commit -m "feat(media): add mediaProfile helper (setMediaAsPersonProfile, isMediaPersonProfile)"
```

---

## Task 3: Replace profile badge in PersonMediaSection

**Files:**
- Modify: `src/renderer/components/PersonMediaSection.vue`

- [ ] **Step 1: Update template order-cell**

Replace the existing `<td class="td-shrink order-cell">...</td>` block (currently around lines 21-25) with:

```vue
          <td class="td-shrink order-cell">
            <button
              class="star-btn"
              :class="{ 'is-profile': idx === 0 }"
              :title="idx === 0 ? $t('media.currentProfile') : $t('media.setAsProfile')"
              :disabled="idx === 0"
              @click.stop="setAsProfile(idx)"
            >{{ idx === 0 ? '★' : '☆' }}</button>
            <button class="btn-order" :disabled="idx === 0" @click.stop="moveUp(idx)" :title="$t('media.moveUp')">&#9650;</button>
            <button class="btn-order" :disabled="idx === media.length - 1" @click.stop="moveDown(idx)" :title="$t('media.moveDown')">&#9660;</button>
          </td>
```

- [ ] **Step 2: Add setAsProfile function**

In the `<script setup>` block, add the function right after the existing `moveDown` function (around line 126):

```ts
function setAsProfile(idx: number) {
  if (idx === 0) return;
  const items = [...media.value];
  const [picked] = items.splice(idx, 1);
  items.unshift(picked);
  reorder(items);
}
```

- [ ] **Step 3: Replace profile-badge CSS with star-btn CSS**

In the `<style scoped>` block:

1. Delete the entire `.profile-badge { ... }` rule (lines 146-154).
2. Add this rule in its place:

```css
.star-btn {
  background: none;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0 3px;
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1;
  vertical-align: middle;
}
.star-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--surface-border);
}
.star-btn.is-profile {
  color: var(--accent);
  cursor: default;
}
.star-btn:disabled {
  cursor: default;
}
```

- [ ] **Step 4: Launch app and verify manually**

Run: `npm start` (let user verify in UI — pick a person with ≥2 media items, click ☆ on row 2, confirm it moves to row 0 and turns ★).

Expected in UI:
- Row 0 shows filled ★ with tooltip "Current profile picture" (or "Nuvarande profilbild"), disabled
- Rows 1..n show outlined ☆ with tooltip "Set as profile picture", clickable
- Clicking ☆ reorders and the star on that row becomes ★

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PersonMediaSection.vue
git commit -m "feat(media): replace profile badge with clickable star in PersonMediaSection"
```

---

## Task 4: Add star to face-tag rows in MediaPanel

**Files:**
- Modify: `src/renderer/components/MediaPanel.vue`

- [ ] **Step 1: Add profile state ref**

In `<script setup>`, import the helpers and add a reactive profile-state map. Find the import block around line 132-140 and add the mediaProfile import:

```ts
import { resolvePersonDisplayName } from '../utils/nameUtils';
import { setMediaAsPersonProfile, isMediaPersonProfile } from '../utils/mediaProfile';
```

Find where `regions` is declared (around line 197) and add right after it:

```ts
const regions = ref<RegionData[]>([]);
const regionIsProfile = ref<Record<string, boolean>>({});
```

- [ ] **Step 2: Add computeRegionProfileState function**

Right before the `load()` function (around line 231), add:

```ts
async function computeRegionProfileState() {
  if (!props.mediaId) {
    regionIsProfile.value = {};
    return;
  }
  const newState: Record<string, boolean> = {};
  for (const r of regions.value) {
    if (!r.person_id) continue;
    newState[r.id] = await isMediaPersonProfile(r.person_id, props.mediaId);
  }
  regionIsProfile.value = newState;
}
```

- [ ] **Step 3: Call it at end of load()**

Find the `load()` function. At the very end of its `try` block (right after `regions.value = enrichedRegions;` on line 347), add:

```ts
    regions.value = enrichedRegions;
    await computeRegionProfileState();
```

Also reset profile state when there's no mediaId. Find the early-return block in `load()` (around lines 231-240) and add one line:

```ts
  if (!props.mediaId) {
    media.value = null;
    thumbnailSrc.value = null;
    linkedPersons.value = [];
    linkedPlaces.value = [];
    linkedEvents.value = [];
    regions.value = [];
    regionIsProfile.value = {};
    return;
  }
```

- [ ] **Step 4: Add setProfileForRegion function**

Right after the existing `assignPersonToRegion` function (around line 401), add:

```ts
async function setProfileForRegion(r: RegionData) {
  if (!props.mediaId || !r.person_id) return;
  if (regionIsProfile.value[r.id]) return; // already profile
  await setMediaAsPersonProfile(r.person_id, props.mediaId);
  await computeRegionProfileState();
  emit('link-changed');
}
```

- [ ] **Step 5: Add star button to the face-tag row template**

Find the face-tag row template (around lines 107-125). Between the `<span class="face-tag-name">...</span>` and the `<AppButton ... @click="deleteRegion(r.id)">` lines, insert the star button. The full updated row body (the non-editing `<template v-else>` branch) should be:

```vue
            <template v-else>
              <AppAvatar v-if="r.person_id" :given-name="r.personGivenName || ''" :surname="r.personSurname || ''" :sex="r.personSex || 'U'" size="sm" />
              <div v-else class="face-tag-unknown">?</div>
              <span class="face-tag-name face-tag-clickable" @click="editingTagId = r.id">{{ r.person_id ? (r.personName || $t('media.untitled')) : $t('media.viewer.assignPerson') }}</span>
              <button
                v-if="r.person_id"
                class="star-btn"
                :class="{ 'is-profile': regionIsProfile[r.id] }"
                :title="regionIsProfile[r.id] ? $t('media.currentProfile') : $t('media.setAsProfile')"
                :disabled="!!regionIsProfile[r.id]"
                @click="setProfileForRegion(r)"
              >{{ regionIsProfile[r.id] ? '★' : '☆' }}</button>
            </template>
            <AppButton variant="ghost" size="sm" class="unlink-btn" @click="deleteRegion(r.id)">&#10005;</AppButton>
```

- [ ] **Step 6: Add star-btn CSS**

In the `<style scoped>` block, add (append to the existing face-tag styles section, near line 602):

```css
.star-btn {
  background: none;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0 3px;
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1;
  margin-left: auto;
}
.star-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--surface-border);
}
.star-btn.is-profile {
  color: var(--accent);
  cursor: default;
}
.star-btn:disabled {
  cursor: default;
}
```

`margin-left: auto` pushes the star to the right, leaving the ✕ button on the far right.

- [ ] **Step 7: Verify types**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: no new errors.

- [ ] **Step 8: Launch app and verify manually**

Run: `npm start`

Test scenarios (tell the user to verify):
1. Open a media with ≥2 tagged persons. Each tagged row shows ☆ or ★ depending on whether the media is that person's current profile.
2. Untagged face rows show no star.
3. Click ☆ on a row → it becomes ★ and the person's PersonDetailView → Media section shows that media first.
4. Open a media tagged to one person; if media is already their profile, star is filled and disabled (hover shows "Current profile picture" tooltip).
5. Click ★ → nothing happens (disabled).
6. If the same media is profile for multiple tagged persons, multiple stars can be filled simultaneously.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/MediaPanel.vue
git commit -m "feat(media): add set-as-profile star to face-tag rows in MediaPanel"
```

---

## Task 5: Version bump and roadmap

**Files:**
- Modify: `package.json`
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Bump version**

In `package.json`, change:

```json
"version": "0.119.6",
```

to:

```json
"version": "0.120.0",
```

- [ ] **Step 2: Add roadmap entry**

In `docs/PLAN.md`, find the Done roadmap table. Add a new row at the top of the in-progress-or-most-recent section (i.e., directly below the existing `v0.119.*` rows), matching the existing row format:

```
| v0.120.0 | feat(media): set profile picture from face-tag star or media-row star in MediaPanel and PersonMediaSection | — |
```

If the repo convention is to reference the design spec, use:

```
| v0.120.0 | feat(media): set profile picture from face-tag star or media-row star | [spec](docs/superpowers/specs/2026-04-19-set-profile-from-face-tag-design.md) |
```

(Check the surrounding table rows and match the style used for other small features.)

- [ ] **Step 3: Archive the spec**

Per CLAUDE.md convention (fully implemented specs go to `docs/superpowers/specs/archive/`):

```bash
git mv docs/superpowers/specs/2026-04-19-set-profile-from-face-tag-design.md docs/superpowers/specs/archive/2026-04-19-set-profile-from-face-tag-design.md
```

Update the `docs/PLAN.md` spec link to point to the archived path.

- [ ] **Step 4: Final commit**

```bash
git add package.json docs/PLAN.md docs/superpowers/specs/
git commit -m "release: v0.120.0 — set profile picture from face tag / media row"
```

---

## Verification Checklist

At the end of all tasks, the engineer should confirm:

- [ ] `npx tsc --noEmit` shows no new errors
- [ ] `npm run lint` shows zero errors
- [ ] Manual UI test passed (face-tag star in MediaPanel, media-row star in PersonMediaSection)
- [ ] Swedish tooltips display correctly (toggle locale in Settings)
- [ ] Version bumped to 0.120.0
- [ ] Spec archived, PLAN.md updated
