import { defineChannel } from './registry';
import { buildPreview } from '../../api/html_site/preview';
import type { PreviewOptions } from '../../api/html_site/preview';

/**
 * `website:previewSnapshot` runs entirely in the worker. It walks the DB to
 * compute scope/totals/sample for the website-export preview pane.
 *
 * The other two `website:*` channels (`buildPreviewHtml`, `export`) keep their
 * main-thread `wrapHandler` shims because they need Electron-only APIs
 * (`nativeImage` for thumbnail JPEG resize, `dialog` for the output-dir
 * picker). Their heavy DB work already runs in the worker via the legacy
 * dispatch entries `website:buildSnapshot` / `website:resolveMediaPaths` in
 * `src/main/db-worker.ts`.
 */
defineChannel({
  name: 'website:previewSnapshot',
  thread: 'worker',
  mutating: false,
  handler: async (db, opts: PreviewOptions) => buildPreview(db, opts),
});
