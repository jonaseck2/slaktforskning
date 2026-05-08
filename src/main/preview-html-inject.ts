// Pure HTML-mutation helper for the website-export preview iframe.
//
// Lives outside preview-protocol.ts (which imports electron) so it can be
// unit-tested without an Electron runtime.

/**
 * Stable marker rendered verbatim in src/static/index.html (and preserved
 * by viteSingleFile in the dist-static build). The preview builder swaps
 * it for an inline `<script>window.__SNAPSHOT__=…</script>` which sets the
 * snapshot before the bundled main.ts module runs.
 */
export const INJECTION_MARKER = '<!--PREVIEW_SNAPSHOT_INJECTION_POINT-->';

/**
 * Inlines `snapshot` as window.__SNAPSHOT__ at the marker. Throws if the
 * marker is missing — silent no-op was the original failure mode (Track B
 * removed the `<script src="./data.js">` tag the regex used to anchor on,
 * which produced a blank iframe with a cryptic `fetch ./data.json` error
 * from installStaticApi's last-resort dev path).
 */
export function injectSnapshotIntoHtml(html: string, snapshot: unknown): string {
  const json = JSON.stringify(snapshot ?? null);
  // Closing-tag-safe inline script: snapshots can contain `</script>` inside
  // string fields (notes, transcriptions). Escape the slash to be safe.
  const safeJson = json.replace(/<\/script/gi, '<\\/script');
  const inline = `<script>window.__SNAPSHOT__=${safeJson};</script>`;
  const result = html.replace(INJECTION_MARKER, inline);
  if (result === html) {
    throw new Error(`[preview-protocol] index.html missing ${INJECTION_MARKER}`);
  }
  return result;
}
