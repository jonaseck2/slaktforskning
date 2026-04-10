# Error Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace silent `console.error` calls in form components with user-visible toast notifications, so users know when a save/delete operation fails.

**Architecture:** A simple Vue composable (`useToast`) exposes a reactive list of toasts. A single `ToastNotification.vue` component mounted in `App.vue` renders them. Form components import `useToast` and call `toast.error(message)` in their catch blocks. No external libraries.

**Tech Stack:** Vue 3 Composition API, CSS transitions

---

### Task 1: Create useToast composable

**Files:**
- Create: `src/renderer/composables/useToast.ts`

- [ ] **Step 1: Create the composable**

```typescript
// src/renderer/composables/useToast.ts
import { reactive } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info';
}

let nextId = 1;
const toasts = reactive<Toast[]>([]);

export function useToast() {
  function show(message: string, type: Toast['type'] = 'info', durationMs = 4000) {
    const id = nextId++;
    toasts.push({ id, message, type });
    setTimeout(() => dismiss(id), durationMs);
  }

  function dismiss(id: number) {
    const i = toasts.findIndex((t) => t.id === id);
    if (i !== -1) toasts.splice(i, 1);
  }

  return {
    toasts,
    error: (message: string) => show(message, 'error', 5000),
    success: (message: string) => show(message, 'success', 3000),
    info: (message: string) => show(message, 'info', 4000),
    dismiss,
  };
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 2: Create ToastNotification component

**Files:**
- Create: `src/renderer/components/ToastNotification.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- src/renderer/components/ToastNotification.vue -->
<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast"
          :class="'toast--' + toast.type"
          @click="dismiss(toast.id)"
        >
          {{ toast.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '../composables/useToast';

const { toasts, dismiss } = useToast();
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
  pointer-events: none;
}
.toast {
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 360px;
  cursor: pointer;
  pointer-events: all;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  line-height: 1.4;
}
.toast--error {
  background: #b91c1c;
  color: white;
}
.toast--success {
  background: #15803d;
  color: white;
}
.toast--info {
  background: #1d4ed8;
  color: white;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>
```

---

### Task 3: Add ToastNotification to App.vue

**Files:**
- Modify: `src/renderer/App.vue`

- [ ] **Step 1: Import and register the component**

In `App.vue`'s `<script setup>` section, add the import alongside existing component imports:
```typescript
import ToastNotification from './components/ToastNotification.vue';
```

- [ ] **Step 2: Add to template**

In `App.vue`'s `<template>`, add `<ToastNotification />` as the last child of the root element (before the closing tag):
```vue
<ToastNotification />
```

---

### Task 4: Wire toast into EventForm.vue

**Files:**
- Modify: `src/renderer/components/EventForm.vue`

- [ ] **Step 1: Import useToast and useI18n**

In `EventForm.vue`'s `<script setup>`, add:
```typescript
import { useToast } from '../composables/useToast';
const toast = useToast();
```

The `useI18n()` call is already present — `t` is already available.

- [ ] **Step 2: Update the save() catch block**

Replace the existing catch block in `save()`:
```typescript
// Before:
} catch (err) {
  console.error('[EventForm] save failed:', err);
}
```
```typescript
// After:
} catch (err) {
  console.error('[EventForm] save failed:', err);
  toast.error(t('errors.saveFailed'));
}
```

- [ ] **Step 3: Update deleteCitation() to handle errors**

The existing `deleteCitation` has no error handling. Wrap its body:
```typescript
async function deleteCitation(id: string) {
  try {
    await window.api.citations.delete(id);
    await loadCitations();
  } catch (err) {
    console.error('[EventForm] deleteCitation failed:', err);
    toast.error(t('errors.deleteFailed'));
  }
}
```

---

### Task 5: Wire toast into all remaining form components

**Files:**
- Modify: `src/renderer/components/CitationForm.vue`
- Modify: `src/renderer/components/AddRelatedPersonModal.vue`
- Modify: `src/renderer/components/PersonNameFormModal.vue`
- Modify: `src/renderer/components/PersonIdentifiersSection.vue`
- Modify: `src/renderer/components/EventList.vue`
- Modify: Any other component — run `grep -rn "console.error" src/renderer/` to find them all

For each file:

- [ ] **Step 1: Find all console.error calls**

Run: `grep -rn "console.error" src/renderer/ --include="*.vue"`

- [ ] **Step 2: Add import to each component**

Add to each component's `<script setup>`:
```typescript
import { useToast } from '../composables/useToast';
const toast = useToast();
```

- [ ] **Step 3: Add toast call after each console.error in catch blocks**

Pattern: after every `console.error('[ComponentName] ...')` line in a catch block, add:
```typescript
toast.error(t('errors.saveFailed'));  // for save/create/update failures
// or
toast.error(t('errors.deleteFailed'));  // for delete failures
// or
toast.error(t('errors.loadFailed'));  // for load failures
```

Use `saveFailed` for mutations, `loadFailed` for read operations.

---

### Task 6: Add i18n error keys

**Files:**
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [ ] **Step 1: Add to en.ts**

Find the top-level object in `en.ts` and add an `errors` key alongside `common`, `persons`, etc.:
```typescript
errors: {
  saveFailed: 'Could not save. Please try again.',
  deleteFailed: 'Could not delete. Please try again.',
  loadFailed: 'Could not load data. Please try again.',
},
```

- [ ] **Step 2: Add to sv.ts**

```typescript
errors: {
  saveFailed: 'Det gick inte att spara. Försök igen.',
  deleteFailed: 'Det gick inte att ta bort. Försök igen.',
  loadFailed: 'Det gick inte att ladda data. Försök igen.',
},
```

---

### Task 7: Run tests and commit

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Start the app and verify toasts appear**

Run: `npm start`
- Open the app, attempt an operation
- Simulate a failure (disconnect DB) to confirm toasts appear bottom-right
- Click a toast to dismiss it
- Confirm it auto-dismisses after ~5s for errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): user-facing error toasts for all form operations

Add useToast composable + ToastNotification component. Wire into
EventForm, CitationForm, AddRelatedPersonModal, PersonNameFormModal,
PersonIdentifiersSection, and EventList. Add errors.* i18n keys."
```