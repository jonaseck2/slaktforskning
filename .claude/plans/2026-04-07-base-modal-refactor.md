# BaseModal Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the repeated modal shell (overlay + container + keyboard handler) shared across 15 components into a single `BaseModal.vue`, eliminating ~200 lines of duplicated markup.

**Architecture:** `BaseModal.vue` wraps content via a default slot. It owns the overlay click-to-close and Escape key behavior. Consumer components keep their form content; they replace `<div class="modal-overlay" @click.self="...">` wrappers with `<BaseModal @close="...">`. The `modal` and `modal-overlay` CSS classes stay in `shared.css`; no style changes are needed.

**Tech Stack:** Vue 3 slots, `defineEmits`, `onMounted`/`onUnmounted` keyboard handler

---

### Task 1: Create BaseModal.vue

**Files:**
- Create: `src/renderer/components/BaseModal.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- src/renderer/components/BaseModal.vue -->
<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

const emit = defineEmits<{ close: [] }>();

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>
```

No `<style scoped>` — all modal styles are already in `shared.css`.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 2: Migrate EventForm.vue

**Files:**
- Modify: `src/renderer/components/EventForm.vue`

EventForm currently has:
```vue
<div class="modal-overlay" @click.self="$emit('close')">
  <div class="modal">
    <h3>...</h3>
    <form ...>...</form>
  </div>
</div>
```
and in `<script setup>`:
```typescript
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
```

- [ ] **Step 1: Add BaseModal import**

```typescript
import BaseModal from './BaseModal.vue';
```

- [ ] **Step 2: Replace template wrapper**

```vue
<!-- Before -->
<div class="modal-overlay" @click.self="$emit('close')">
  <div class="modal">
    <!-- content -->
  </div>
</div>

<!-- After -->
<BaseModal @close="$emit('close')">
  <!-- content (h3 + form, unchanged) -->
</BaseModal>
```

- [ ] **Step 3: Remove Escape key handler**

Delete the `handleKeydown` function and its `onMounted`/`onUnmounted` calls. BaseModal now owns Escape handling.

Also remove the `onMounted` and `onUnmounted` imports if they're no longer used elsewhere in the component.

- [ ] **Step 4: Verify the component still opens and closes correctly**

Run: `npm start`
- Open an event form
- Press Escape — should close
- Click the overlay — should close
- Save an event — should work as before

---

### Task 3: Migrate CitationForm.vue

**Files:**
- Modify: `src/renderer/components/CitationForm.vue`

- [ ] **Step 1: Apply the same migration as EventForm.vue**

1. Add `import BaseModal from './BaseModal.vue';`
2. Replace `<div class="modal-overlay" @click.self="..."><div class="modal">` with `<BaseModal @close="...">`
3. Remove `handleKeydown`, `onMounted`, `onUnmounted` for keyboard handling if present
4. Verify: open citation form, Escape closes it, save works

---

### Task 4: Migrate PersonNameFormModal.vue

**Files:**
- Modify: `src/renderer/components/PersonNameFormModal.vue`

- [ ] **Step 1: Apply the same migration**

1. Add `import BaseModal from './BaseModal.vue';`
2. Replace outer `div.modal-overlay > div.modal` with `<BaseModal @close="emit('close')">`
3. Remove keyboard handler if present
4. Verify: open name form, Escape closes, save works

---

### Task 5: Migrate AddRelatedPersonModal.vue

**Files:**
- Modify: `src/renderer/components/AddRelatedPersonModal.vue`

- [ ] **Step 1: Apply the same migration**

1. Add `import BaseModal from './BaseModal.vue';`
2. Replace outer `div.modal-overlay > div.modal` with `<BaseModal @close="emit('close')">`
3. Remove keyboard handler if present
4. Verify: open add-relative modal, Escape closes, submit works

---

### Task 6: Migrate remaining modal components

**Files:**
- Modify: All remaining `.vue` files with `class="modal-overlay"` in their template

- [ ] **Step 1: Find all remaining components**

Run:
```bash
grep -rln 'class="modal-overlay"' src/renderer/ --include="*.vue"
```

This will list components not yet migrated. Apply the same three-step migration to each:
1. Import `BaseModal`
2. Replace `div.modal-overlay > div.modal` with `<BaseModal @close="...">`
3. Remove keyboard handler

- [ ] **Step 2: For components that conditionally show modals (v-if)**

Some components use `v-if` on the outer overlay rather than unmounting. The `v-if` should be moved to wherever the component is used, or kept on `<BaseModal>`:

```vue
<!-- Fine — v-if on BaseModal works -->
<BaseModal v-if="showForm" @close="showForm = false">
  ...
</BaseModal>
```

---

### Task 7: Run tests and commit

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Verify all modals in the app**

Run: `npm start`
Open and close each modal type:
- Add Person
- Add Name
- Add Event (person)
- Add Event (relationship)
- Add Citation
- Add Related Person
- Any other modals in the app

For each: verify Escape closes, overlay click closes, save/cancel work.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(ui): extract BaseModal component, migrate all modal components

Add BaseModal.vue with slot, overlay-click-close, and Escape handling.
Migrate EventForm, CitationForm, PersonNameFormModal,
AddRelatedPersonModal, and all remaining modal components.
Removes ~200 lines of duplicated markup across 15 components."
```
