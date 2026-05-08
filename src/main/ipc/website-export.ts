import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { app, dialog, nativeImage } from 'electron';
import { buildPreviewHtml } from '../preview-protocol';
import { wrapHandler } from './wrap-handler';
import { callWorker } from './worker-client';
import { getCurrentDatabasePath } from '../database';

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
  // `website:previewSnapshot` is a registry-defined worker channel — see
  // src/shared/channels/website-export.ts. The registry walk in
  // src/main/ipc/index.ts wires its main-side ipcMain.handle automatically.

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
    // 'split' (default) writes index.html + data.json.gz alongside it — best
    // for hosted deployment (GitHub Pages, S3). The browser fetches data.json.gz
    // and decompresses it via DecompressionStream.
    // 'portable' writes a single index.html with the snapshot embedded as
    // base64-gzip in a <script> tag — best for emailing or opening locally
    // by double-click (file:// blocks fetch, so split mode can't load there).
    mode?: 'split' | 'portable';
    _outputDir?: string;
  }) => {
    let out: string;
    if ((opts as { _outputDir?: string })._outputDir) {
      out = (opts as { _outputDir?: string })._outputDir!;
    } else {
      const dir = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
      if (dir.canceled || !dir.filePaths[0]) return { canceled: true };
      out = dir.filePaths[0];
    }

    // 1. Copy dist-static bundle
    const bundleSrc = app.isPackaged
      ? path.join(process.resourcesPath, 'dist-static')
      : path.join(__dirname, '../..', 'dist-static');
    if (!fs.existsSync(bundleSrc)) {
      return { bundleMissing: true };
    }
    await fsp.cp(bundleSrc, out, { recursive: true });

    // 2. Build snapshot via worker thread
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

    // 3. Copy media first so we know which files actually made it. Items
    //    with no file_ref or whose source file has gone missing get dropped
    //    from the snapshot below — otherwise the static SPA happily builds
    //    `./media/full/<id>.<ext>` URLs for them and the gallery shows broken
    //    images. Async with periodic yields so the main thread stays
    //    responsive on large libraries (7000+ images would otherwise lock
    //    the app for minutes and trigger Electron's unresponsive-app kill).
    //    No thumbnails: the static site reads from media/full/ directly via
    //    static-api.readAsDataUrl; the browser handles scaling.
    const exportedMediaIds = new Set<string>();
    if (opts.options.includeMedia) {
      const fullDir = path.join(out, 'media', 'full');
      await fsp.mkdir(fullDir, { recursive: true });
      // file_ref is the post-consolidate relative shape (`<dbname>-media/<filename>`),
      // anchored at the database directory. Resolving via path.resolve handles both
      // that shape and any historical absolute refs.
      const dbDir = path.dirname(getCurrentDatabasePath());
      let copied = 0;
      for (const m of snapshot.media) {
        if (!m.file_ref) continue;
        const absPath = path.resolve(dbDir, m.file_ref);
        try {
          await fsp.access(absPath);
        } catch {
          continue;
        }
        const ext = path.extname(absPath);
        const filename = `${m.id}${ext}`;
        try {
          await fsp.copyFile(absPath, path.join(fullDir, filename));
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

      // Drop any media (and dependent links/regions) whose file didn't
      // make it. Keeps the static gallery lean and free of broken images.
      snapshot.media = snapshot.media.filter(m => exportedMediaIds.has(m.id));
      snapshot.mediaLinks = snapshot.mediaLinks.filter(ml => exportedMediaIds.has(ml.media_id));
      snapshot.mediaRegions = snapshot.mediaRegions.filter(r => exportedMediaIds.has(r.media_id));
    } else {
      // includeMedia=false: drop all media metadata so we don't ship dead
      // references the static SPA would try to render.
      snapshot.media = [];
      snapshot.mediaLinks = [];
      snapshot.mediaRegions = [];
    }

    // 4. Write the snapshot — gzipped in either mode. Done after the copy pass
    //    so the snapshot only references media that actually shipped.
    const json = JSON.stringify(snapshot);
    const gz = gzipSync(Buffer.from(json), { level: 9 });
    const mode = opts.mode ?? 'split';
    if (mode === 'portable') {
      // Embed gz+base64 directly in index.html via an inline <script>. The
      // bootstrap reads window.__SNAPSHOT_GZ__ and decompresses in-page so
      // the file works from a file:// URL with no host required.
      const indexHtmlPath = path.join(out, 'index.html');
      const html = await fsp.readFile(indexHtmlPath, 'utf8');
      const tag = `<script>window.__SNAPSHOT_GZ__=${JSON.stringify(gz.toString('base64'))};</script>`;
      const injected = html.includes('</head>')
        ? html.replace('</head>', `${tag}</head>`)
        : `${tag}${html}`;
      await fsp.writeFile(indexHtmlPath, injected);
    } else {
      // Split mode: data.json.gz lives alongside index.html. The bootstrap
      // fetches it (only works under http(s)) and decompresses on the client.
      await fsp.writeFile(path.join(out, 'data.json.gz'), gz);
    }

    return { canceled: false, outputDir: out, mode };
  });
}
