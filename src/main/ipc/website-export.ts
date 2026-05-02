import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { app, dialog, nativeImage } from 'electron';
import { buildPreviewHtml } from '../preview-protocol';
import { wrapHandler } from './wrap-handler';
import { callWorker } from './worker-client';

// Per-image and total budget for inlined preview thumbnails. The whole HTML
// is loaded into the iframe via a Blob URL — keeping this bounded avoids
// blowing up renderer memory on large libraries.
const PREVIEW_THUMB_COUNT = 24;
const PREVIEW_THUMB_WIDTH = 400;
const PREVIEW_THUMB_QUALITY = 70;
const PREVIEW_THUMB_BUDGET_BYTES = 5 * 1024 * 1024;

async function buildPreviewThumbnails(
  mediaItems: Array<{ id: string; file_ref: string | null }>,
): Promise<Record<string, string>> {
  const candidates = mediaItems.filter(m => m.file_ref).slice(0, PREVIEW_THUMB_COUNT);
  if (candidates.length === 0) return {};
  const sources = await callWorker('website:resolveMediaPaths', candidates.map(m => m.id)) as Record<string, { absPath: string; mime: string }>;
  const dataUrls: Record<string, string> = {};
  let totalBytes = 0;
  for (const id of Object.keys(sources)) {
    if (totalBytes >= PREVIEW_THUMB_BUDGET_BYTES) break;
    try {
      const img = nativeImage.createFromPath(sources[id].absPath);
      if (img.isEmpty()) continue;
      const resized = img.resize({ width: PREVIEW_THUMB_WIDTH });
      const jpeg = resized.toJPEG(PREVIEW_THUMB_QUALITY);
      if (totalBytes + jpeg.length > PREVIEW_THUMB_BUDGET_BYTES) continue;
      totalBytes += jpeg.length;
      dataUrls[id] = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    } catch {
      // Skip broken images rather than aborting the preview build
    }
  }
  return dataUrls;
}

export function registerWebsiteExportHandlers(): void {
  wrapHandler('website:previewSnapshot', async (...args) => {
    const opts = args[0] as {
      siteTitle: string;
      scope: { everyone?: boolean; focusId?: string; ancestors?: number; descendants?: number };
      options: {
        excludeLiving: boolean;
        redactLiving: boolean;
      };
    };
    return await callWorker('website:buildPreview', {
      siteTitle: opts.siteTitle,
      scope: opts.scope,
      options: {
        excludeLiving: opts.options.excludeLiving,
        redactLiving: opts.options.redactLiving,
      },
    });
  });

  // Builds the full snapshot for the iframe preview and inlines it into a
  // copy of the static SPA's index.html. The renderer drops the returned
  // HTML into a Blob URL so the preview shares the exact bootstrap path with
  // the exported site, without needing a custom protocol scheme.
  //
  // Media metadata is included, and the first ~24 images are resized to
  // thumbnails (~400px JPEG @ 70%) and inlined as data URLs in
  // `snapshot.meta.previewMediaDataUrls`. The static SPA's `readAsDataUrl`
  // uses these directly so the preview gets real photos instead of broken
  // images.
  wrapHandler('website:buildPreviewHtml', async (opts: {
    siteTitle: string;
    focusPersonId: string | null;
    scope: { everyone?: boolean; focusId?: string; ancestors?: number; descendants?: number };
    options: { excludeLiving: boolean; redactLiving: boolean; mediaPersonOnly: boolean };
  }) => {
    const snapshot = await callWorker('website:buildSnapshot', {
      siteTitle: opts.siteTitle,
      focusPersonId: opts.focusPersonId ?? '',
      scope: opts.scope,
      options: {
        ...opts.options,
        includeMedia: true,
      },
    }) as {
      meta: Record<string, unknown>;
      media: Array<{ id: string; file_ref: string | null }>;
      mediaLinks: Array<{ media_id: string }>;
      mediaRegions: Array<{ media_id: string }>;
      settings: Record<string, string>;
    };
    const totalMediaInScope = snapshot.media.length;
    const previewMediaDataUrls = await buildPreviewThumbnails(snapshot.media);
    // Trim the snapshot's media (and dependent rows) to the items we actually
    // inlined. The static SPA can't reach the user's local files, so anything
    // beyond the inlined subset would render as a broken image in the gallery.
    const inlinedIds = new Set(Object.keys(previewMediaDataUrls));
    snapshot.media = snapshot.media.filter(m => inlinedIds.has(m.id));
    snapshot.mediaLinks = snapshot.mediaLinks.filter(ml => inlinedIds.has(ml.media_id));
    snapshot.mediaRegions = snapshot.mediaRegions.filter(r => inlinedIds.has(r.media_id));
    snapshot.meta = { ...snapshot.meta, previewMediaDataUrls };
    // Surface the cap to the static SPA so MediaView can show a "preview
    // limited to N images" notice. Read via window.api.db.getSetting().
    snapshot.settings = {
      ...snapshot.settings,
      preview_media_limit: String(PREVIEW_THUMB_COUNT),
      preview_media_total_linked: String(totalMediaInScope),
    };
    return await buildPreviewHtml(snapshot);
  });

  wrapHandler('website:export', async (opts: {
    siteTitle: string;
    focusPersonId: string | null;
    scope: { everyone?: boolean; focusId?: string; ancestors?: number; descendants?: number };
    options: {
      includeMedia: boolean;
      excludeLiving: boolean;
      redactLiving: boolean;
      mediaPersonOnly: boolean;
    };
    _outputDir?: string;
  }) => {
    // 1. Build snapshot FIRST (before any dialog) so we know if there's media
    const snapshot = await callWorker('website:buildSnapshot', {
      siteTitle: opts.siteTitle,
      focusPersonId: opts.focusPersonId ?? '',
      scope: opts.scope,
      options: opts.options,
    }) as {
      media: Array<{ id: string; file_ref: string | null }>;
      mediaLinks: Array<{ media_id: string }>;
      mediaRegions: Array<{ media_id: string }>;
    };

    // 2. Determine if we have media to export
    const hasMedia = opts.options.includeMedia && snapshot.media.some(m => !!m.file_ref);

    if (!hasMedia) {
      // === SINGLE-FILE PATH ===
      // No media → produce a single self-contained HTML file
      let outputPath: string;
      if (opts._outputDir) {
        // Test mode: write index.html inside the provided directory
        outputPath = path.join(opts._outputDir, 'index.html');
      } else {
        const result = await dialog.showSaveDialog({
          defaultPath: `${opts.siteTitle || 'family-tree'}.html`,
          filters: [{ name: 'HTML', extensions: ['html'] }],
        });
        if (result.canceled || !result.filePath) return { canceled: true };
        outputPath = result.filePath;
      }

      // Strip media from snapshot
      snapshot.media = [];
      snapshot.mediaLinks = [];
      snapshot.mediaRegions = [];

      // Build self-contained HTML
      const html = await buildPreviewHtml(snapshot);
      await fsp.writeFile(outputPath, html, 'utf-8');

      return { canceled: false, outputDir: opts._outputDir || outputPath };
    }

    // === FOLDER PATH (has media to export) ===
    let out: string;
    if (opts._outputDir) {
      out = opts._outputDir;
    } else {
      const dir = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
      if (dir.canceled || !dir.filePaths[0]) return { canceled: true };
      out = dir.filePaths[0];
    }

    // Copy dist-static bundle
    const bundleSrc = app.isPackaged
      ? path.join(process.resourcesPath, 'dist-static')
      : path.join(__dirname, '../..', 'dist-static');
    if (!fs.existsSync(bundleSrc)) {
      return { bundleMissing: true };
    }
    await fsp.cp(bundleSrc, out, { recursive: true });

    // Copy media with DEFERRED mkdir — only create media/full/ when the
    // first file passes the access() check. If all files are missing, no
    // directory is created and the snapshot media arrays are emptied.
    const exportedMediaIds = new Set<string>();
    let fullDirCreated = false;
    let copied = 0;
    for (const m of snapshot.media) {
      if (!m.file_ref) continue;
      try {
        await fsp.access(m.file_ref);
      } catch {
        continue;
      }
      if (!fullDirCreated) {
        await fsp.mkdir(path.join(out, 'media', 'full'), { recursive: true });
        fullDirCreated = true;
      }
      const ext = path.extname(m.file_ref);
      const filename = `${m.id}${ext}`;
      try {
        await fsp.copyFile(m.file_ref, path.join(out, 'media', 'full', filename));
      } catch {
        // Skip individual file failures rather than aborting the export
        continue;
      }
      exportedMediaIds.add(m.id);
      copied++;
      // Yield every 25 files so IPC and renderer events can process
      if (copied % 25 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    // If no files were actually copied, empty the snapshot media arrays
    if (exportedMediaIds.size === 0) {
      snapshot.media = [];
      snapshot.mediaLinks = [];
      snapshot.mediaRegions = [];
    } else {
      // Drop any media (and dependent links/regions) whose file didn't
      // make it. Keeps the static gallery lean and free of broken images.
      snapshot.media = snapshot.media.filter(m => exportedMediaIds.has(m.id));
      snapshot.mediaLinks = snapshot.mediaLinks.filter(ml => exportedMediaIds.has(ml.media_id));
      snapshot.mediaRegions = snapshot.mediaRegions.filter(r => exportedMediaIds.has(r.media_id));
    }

    // Write data.js (script tag, works from file:// — JSON would need fetch
    // which is blocked from file://). Done after the copy pass so the
    // snapshot only references media that actually shipped.
    const json = JSON.stringify(snapshot);
    await fsp.writeFile(path.join(out, 'data.js'), `window.__SNAPSHOT__=${json};`);

    return { canceled: false, outputDir: out };
  });

  wrapHandler('website:exportSingleFile', async (opts: {
    siteTitle: string;
    focusPersonId: string | null;
    scope: { everyone?: boolean; focusId?: string; ancestors?: number; descendants?: number };
    options: {
      excludeLiving: boolean;
      redactLiving: boolean;
      mediaPersonOnly: boolean;
    };
  }) => {
    // 1. Prompt user for save location
    const result = await dialog.showSaveDialog({
      defaultPath: 'family-tree.html',
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    // 2. Build snapshot (no media)
    const snapshot = await callWorker('website:buildSnapshot', {
      siteTitle: opts.siteTitle,
      focusPersonId: opts.focusPersonId ?? '',
      scope: opts.scope,
      options: {
        ...opts.options,
        includeMedia: false,
      },
    });

    // 3. Build self-contained HTML (reuses buildPreviewHtml)
    const html = await buildPreviewHtml(snapshot);

    // 4. Write single file
    await fsp.writeFile(result.filePath, html, 'utf-8');

    return { canceled: false, outputPath: result.filePath };
  });
}
