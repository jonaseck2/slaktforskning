# Confirm/Reject Match Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users confirm good gazetteer matches (write coordinates to place), reject bad ones, or navigate to fix manually — all from QualityView.

**Architecture:** QualityView detects `PLACE_MATCH_*` check codes and shows confirm/reject/view buttons. Confirm calls `window.api.places.update()` to write coordinates. Reject stores place ID in `db_settings` key `gazetteer_rejections`. The check runner filters out rejected places.

**Tech Stack:** TypeScript, Vue 3, existing IPC + db_settings APIs.

**Spec:** `docs/superpowers/specs/2026-04-15-gazetteer-quality-media-editor-design.md` (Feature 2)

**Prerequisite:** Gazetteer Match Quality Checks plan must be implemented first (Task 2 populates `placeIds`, `resolvedLat`, `resolvedLon` on CheckResult).

---

### Task 1: Add confirm/reject/view buttons to QualityView

**Files:**
- Modify: `src/renderer/views/QualityView.vue`

- [ ] **Step 1: Add helper to detect place match checks**

In the `<script setup>` section, add:

```typescript
const PLACE_MATCH_CODES = new Set([
  'PLACE_MATCH_AMBIGUOUS', 'PLACE_MATCH_PARTIAL',
  'PLACE_MATCH_NONE', 'PLACE_MATCH_WRONG_LEVEL',
]);

function isPlaceMatch(r: QualityResult): boolean {
  return PLACE_MATCH_CODES.has(r.code);
}
```

- [ ] **Step 2: Add confirm and reject handlers**

```typescript
async function confirmMatch(r: QualityResult) {
  if (!r.placeIds?.[0] || r.resolvedLat == null || r.resolvedLon == null) return;
  try {
    await window.api.places.update(r.placeIds[0], {
      latitude: r.resolvedLat,
      longitude: r.resolvedLon,
    });
    toast.success(t('quality.matchConfirmed'));
    await runChecks();
  } catch (err) {
    console.error('[QualityView] confirmMatch failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}

async function rejectMatch(r: QualityResult) {
  if (!r.placeIds?.[0]) return;
  try {
    const raw = await window.api.db.getSetting('gazetteer_rejections') as string | null;
    const rejections: string[] = raw ? JSON.parse(raw) : [];
    if (!rejections.includes(r.placeIds[0])) {
      rejections.push(r.placeIds[0]);
    }
    await window.api.db.setSetting('gazetteer_rejections', JSON.stringify(rejections));
    toast.success(t('quality.matchRejected'));
    await runChecks();
  } catch (err) {
    console.error('[QualityView] rejectMatch failed:', err);
    toast.error(t('errors.saveFailed'));
  }
}
```

- [ ] **Step 3: Update the action column template**

Replace the existing action `<td>` in the template with conditional rendering:

```html
<td class="actions-td">
  <template v-if="isPlaceMatch(r) && !isIgnored(r)">
    <button
      v-if="r.resolvedLat != null"
      class="btn-sm btn-confirm"
      @click.stop="confirmMatch(r)"
      :title="$t('quality.confirmMatch')"
    >{{ $t('quality.confirm') }}</button>
    <button
      class="btn-sm btn-reject"
      @click.stop="rejectMatch(r)"
      :title="$t('quality.rejectMatch')"
    >{{ $t('quality.reject') }}</button>
    <router-link
      v-if="r.placeIds?.[0]"
      :to="'/places/' + r.placeIds[0]"
      class="btn-sm btn-view"
      @click.stop
    >{{ $t('quality.viewPlace') }}</router-link>
  </template>
  <button
    :class="['btn-sm', isIgnored(r) ? 'btn-unignore' : 'btn-ignore']"
    @click.stop="toggleIgnore(r)"
  >
    {{ isIgnored(r) ? $t('quality.unignore') : $t('quality.ignore') }}
  </button>
</td>
```

- [ ] **Step 4: Add styles for new buttons**

In the `<style scoped>` section, add:

```css
.btn-confirm {
  color: #16a34a;
  border-color: #16a34a;
}
.btn-confirm:hover {
  background: #f0fdf4;
}
.btn-reject {
  color: #dc2626;
  border-color: #dc2626;
}
.btn-reject:hover {
  background: #fef2f2;
}
.btn-view {
  color: #2563eb;
  border-color: #2563eb;
  text-decoration: none;
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: 4px;
  font-size: var(--font-xs);
}
.btn-view:hover {
  background: #eff6ff;
}
.actions-td {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
```

- [ ] **Step 5: Commit**

```
git add src/renderer/views/QualityView.vue
git commit -m "feat: confirm/reject/view buttons for place match checks in QualityView"
```

---

### Task 2: Add i18n keys for confirm/reject workflow

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add Swedish translations**

In `sv.ts`, inside the `quality` object, add these keys:

```typescript
    confirm: 'Bekrafta',
    reject: 'Avvisa',
    viewPlace: 'Visa plats',
    confirmMatch: 'Bekrafta matchning — skriver koordinater till platsen',
    rejectMatch: 'Avvisa matchning — platsen hoppar over vid framtida kontroller',
    matchConfirmed: 'Platsmatchning bekraftad — koordinater sparade',
    matchRejected: 'Platsmatchning avvisad',
```

- [ ] **Step 2: Add English translations**

In `en.ts`, inside the `quality` object, add:

```typescript
    confirm: 'Confirm',
    reject: 'Reject',
    viewPlace: 'View place',
    confirmMatch: 'Confirm match — writes coordinates to the place record',
    rejectMatch: 'Reject match — skips this place in future checks',
    matchConfirmed: 'Place match confirmed — coordinates saved',
    matchRejected: 'Place match rejected',
```

- [ ] **Step 3: Commit**

```
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n: add confirm/reject match workflow translations"
```

---

### Task 3: Widen actions column and test

**Files:**
- Modify: `src/renderer/views/QualityView.vue` (colgroup width)

- [ ] **Step 1: Widen the actions column**

The current actions column is 80px. With confirm/reject/view/ignore buttons, it needs more room. Change the colgroup:

```html
<col style="width: 220px">
```

- [ ] **Step 2: Run the app and test manually**

Run: `npm start`

Test:
1. Navigate to Quality view
2. Verify place match checks appear with confirm/reject/view/ignore buttons
3. Click "Confirm" on a match — verify coordinates written, check disappears on re-run
4. Click "Reject" on a match — verify it disappears on re-run
5. Click "View place" — verify navigation to PlaceDetailView
6. Click "Ignore" — verify it moves to ignored filter

- [ ] **Step 3: Update PLAN.md and bump version**

Add implementation status row. Bump patch version (extends existing feature).

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(vX.Y.Z): confirm/reject match workflow in QualityView"
```
