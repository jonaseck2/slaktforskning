import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Holds the person-duplicate-pair count shown in the sidebar's "Dubbletter"
 * badge. DuplicatesView's persons tab is the single writer — it sets this from
 * the `total` its paged list already computes, so the badge reflects that count
 * at zero extra DB cost. App.vue reads `count` reactively; it must NOT fire its
 * own `duplicates.count()` scan on navigation (that contended with the view's
 * own load on the single SQLite connection and made the e2e duplicates spec
 * flaky). The badge stays empty until the user first visits /duplicates, then
 * reflects the last computation — acceptable for a sidebar hint.
 * See docs/plans/2026-06-17-instant-updates-on-large-databases.md.
 */
export const useDuplicateCountStore = defineStore('duplicateCount', () => {
  const count = ref(0);
  const hasRun = ref(false);

  function setCount(n: number) {
    count.value = n;
    hasRun.value = true;
  }

  return { count, hasRun, setCount };
});
