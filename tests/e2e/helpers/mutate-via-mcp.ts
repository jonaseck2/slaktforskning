import type { AppDriver } from '../fixture';

/**
 * Invoke an api/ tool against the running app's window.api, then wait for the
 * renderer's data-changed event to fire. Returns whatever the tool returned
 * (parsed JSON).
 *
 * `toolPath` is dot-separated against `window.api`, matching the auto-walked
 * channel shape (e.g. `'persons.create'`, `'places.create'`, `'media.create'`).
 */
export async function mutateViaMcp<T = unknown>(
  driver: AppDriver,
  toolPath: string,
  ...args: unknown[]
): Promise<T> {
  const script = `
    (async () => {
      const path = ${JSON.stringify(toolPath)}.split('.');
      let tool = window.api;
      for (const seg of path) {
        if (tool == null) break;
        tool = tool[seg];
      }
      if (typeof tool !== 'function') throw new Error('no such tool: ' + ${JSON.stringify(toolPath)});
      const pDataChanged = new Promise((resolve) => {
        const off = window.api.onDataChanged?.(() => { off?.(); resolve(null); });
        setTimeout(() => resolve(null), 1500); // fallback if no listener fires
      });
      const result = await tool(...${JSON.stringify(args)});
      await pDataChanged;
      return result;
    })()
  `;
  return driver.executeJs<T>(script);
}
