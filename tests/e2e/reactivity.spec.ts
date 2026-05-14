/**
 * Reactivity — Task 4 of e2e-expansion.
 *
 * Data-driven over TRIPLES. For each (consumer-surface, mutator, assertion),
 * spins a fresh Tauri app, seeds the host, navigates to the consumer's route,
 * fires the mutation via `mutateViaMcp` (which waits for `data-changed`), then
 * polls the consumer's DOM for up to 2 s. If the consumer doesn't reflect the
 * mutation, the test fails — which is the regression net for the long-running
 * "list/panel didn't refresh until I navigated away and back" bug class.
 *
 * The "user-goal-falsifiability" check (rules/plans.md L1): if any consumer's
 * onDataChanged subscription is broken or its loader stops being called on
 * `data-changed`, that consumer's triple goes red. Verified empirically against
 * the PersonsView consumer during authoring (see commit message + report).
 */

import { test, expect } from '@playwright/test';
import { startApp, teardownApp, AppDriver, type AppInstance } from './fixture';
import { TRIPLES } from './fixtures/reactivity-triples';

const PORT = 19253;

for (const triple of TRIPLES) {
  test(`reactivity: ${triple.consumer} updates after mutation without view-switch`, async () => {
    // Each triple spins its own app so a stuck assertion in one consumer can't
    // poison the next. Wall-clock dominated by Tauri spawn (~3-5s/test) — for
    // ~15 triples that's well under the 5-minute target.
    const tag = triple.consumer.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    let app: AppInstance | undefined;
    try {
      app = await startApp(PORT, `react-${tag}`);
      const driver = new AppDriver(PORT);
      await driver.setLocale('en');

      const hostId = await triple.seed(driver);
      const route = triple.route.replace(':id', hostId);
      await driver.navigate(route);
      // Let the view settle (composables warm up, useEntityData / usePagedList
      // run their first fetch, sentinels register IntersectionObserver, etc.).
      await new Promise((r) => setTimeout(r, 600));

      if (triple.afterNavigate) {
        await triple.afterNavigate(driver, hostId);
      }

      await triple.mutate(driver, hostId);

      // Poll the assertion. `mutateViaMcp` already awaits a data-changed event
      // (or its 1.5 s fallback), but the DOM may take a frame or two more —
      // composables debounce reloads ~150-200 ms, then Vue renders on the next
      // tick. 2 s with 100 ms ticks is comfortable headroom.
      let observed = false;
      for (let i = 0; i < 20 && !observed; i++) {
        observed = await driver.executeJs<boolean>(triple.assert);
        if (!observed) await new Promise((r) => setTimeout(r, 100));
      }
      expect(observed, `${triple.consumer} did not reflect mutation within 2 s of data-changed`).toBe(true);
    } finally {
      await teardownApp(app);
    }
  });
}
