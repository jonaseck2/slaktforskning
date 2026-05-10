import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { dialog, nativeImage, shell } from 'electron';
import * as media from '../../api/media';
import { callWorker } from './worker-client';
import type { WrapHandlerFn } from './wrap-handler';

const DEFAULT_THUMB_WIDTH = 256;
const THUMB_JPEG_QUALITY = 70;
// Cache directory under <dbname>-media/. Hidden from user-facing media folder
// listings; safe to delete (regenerated on next view). Per the media rules,
// derived render artifacts may live alongside <dbname>-media/.
const THUMB_CACHE_DIRNAME = '.thumbs';

/**
 * Derive the media folder name from the database filename: `foo.db` → `foo-media`.
 * Re-exported from `src/api/media.ts` so import.ts (archive import/export) and
 * other Electron-side callers can keep using `mediaFolderName(...)` while the
 * convention itself lives in the pure-TS api layer.
 */
export { getMediaFolderName as mediaFolderName, getMediaDir } from '../../api/media';

/**
 * Registers main-thread-only media IPC handlers.
 *
 * DB-backed media and mediaRegion channels (media:list, media:get, media:create, etc.)
 * have been migrated to src/shared/channels/media.ts and are registered via the
 * channel registry in index.ts.
 *
 * media:getFilePath and media:readAsDataUrl remain in the legacy dispatch table in
 * db-worker.ts because they require getDbDir() (worker-local state).
 *
 * These two handlers stay on the main thread:
 *   - media:attach — dialog + fs copy + media DB create (uses getDb() directly)
 *   - media:openFile — shell.openPath for local file
 */
export function registerMediaHandlers(
  getDb: () => ReturnType<typeof import('../database').getDatabase>,
  getCurrentDatabasePath: () => string,
  wrapHandler: WrapHandlerFn,
) {
  // Worker channels requiring getDbDir() — stay in legacy dispatch table, but
  // wrapHandler registration still needed so ipcMain.handle is registered.
  wrapHandler('media:getFilePath', (...args) => callWorker('media:getFilePath', ...args));
  wrapHandler('media:readAsDataUrl', (...args) => callWorker('media:readAsDataUrl', ...args));

  // Resized thumbnail data URL. Stays on the main thread (nativeImage is an
  // Electron API; resizing on the worker would pin the single-threaded DB
  // worker behind every other IPC). Cached to <dbname>-media/.thumbs/<sha1>.jpg
  // so repeat visits do a 50 KB disk read instead of re-decoding the original
  // (~MB) image — the resize+encode is the dominant cost on a 100-item page.
  //
  // The renderer passes file_ref directly (already in hand from listPage /
  // forEntity) so this handler does not touch the database — the main-thread
  // DB connection running concurrently with the worker's write transactions
  // would race on SQLite's locks ("database is locked"). Both the file_ref
  // resolution and the cached thumbnail are deterministic relocations of an
  // authored value, never written back to the DB.
  wrapHandler('media:thumbnailDataUrl', async (fileRefArg, widthArg) => {
    const fileRef = typeof fileRefArg === 'string' ? fileRefArg : null;
    if (!fileRef) return null;
    const requested = typeof widthArg === 'number' && widthArg > 0 ? widthArg : DEFAULT_THUMB_WIDTH;

    const dbPath = getCurrentDatabasePath();
    const dbDir = path.dirname(dbPath);
    const absPath = path.resolve(dbDir, fileRef);

    const mediaFolder = media.getMediaFolderName(dbPath);
    const cacheDir = path.join(dbDir, mediaFolder, THUMB_CACHE_DIRNAME);
    const cacheKey = crypto.createHash('sha1').update(`${fileRef}|${requested}`).digest('hex');
    const cachePath = path.join(cacheDir, `${cacheKey}.jpg`);

    let jpeg: Buffer;
    try {
      jpeg = await fs.promises.readFile(cachePath);
    } catch {
      // Cache miss — read original, resize, persist.
      let buf: Buffer;
      try {
        buf = await fs.promises.readFile(absPath);
      } catch {
        return null;
      }
      const img = nativeImage.createFromBuffer(buf);
      if (img.isEmpty()) return null;
      jpeg = img.resize({ width: requested, quality: 'good' }).toJPEG(THUMB_JPEG_QUALITY);
      try {
        await fs.promises.mkdir(cacheDir, { recursive: true });
        await fs.promises.writeFile(cachePath, jpeg);
      } catch {
        // Failing to persist the cache is non-fatal — we still return the bytes.
      }
    }
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  });

  // Electron-specific operations — stay on main thread
  wrapHandler('media:attach', async (data) => {
    const opts = data as { entityType?: string; entityId?: string } | undefined;
    const dbDir = path.dirname(getCurrentDatabasePath());
    const result = await dialog.showOpenDialog({
      title: 'Välj mediafil',
      defaultPath: dbDir,
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };

    const srcPath = result.filePaths[0];
    const dbPath = getCurrentDatabasePath();
    const mediaFolder = media.getMediaFolderName(dbPath);
    const mediaDir = path.join(dbDir, mediaFolder);
    fs.mkdirSync(mediaDir, { recursive: true });

    const filename = path.basename(srcPath);
    let destPath = path.join(mediaDir, filename);
    if (fs.existsSync(destPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      destPath = path.join(mediaDir, `${base}_${Date.now()}${ext}`);
    }
    fs.copyFileSync(srcPath, destPath);

    const fileRef = path.join(mediaFolder, path.basename(destPath));
    const ext = path.extname(destPath).slice(1).toLowerCase();
    const db = getDb();
    const item = media.createMedia(db, {
      file_ref: fileRef,
      title: path.basename(destPath, path.extname(destPath)),
      format: ext || null,
    });

    if (opts?.entityType && opts?.entityId) {
      media.addMediaLink(db, {
        media_id: item.id,
        entity_type: opts.entityType as Parameters<typeof media.addMediaLink>[1]['entity_type'],
        entity_id: opts.entityId,
      });
    }

    return { canceled: false, media: item };
  });

  wrapHandler('media:createFromFile', async (data) => {
    const opts = data as { suggestedTitle?: string } | undefined;
    const dbDir = path.dirname(getCurrentDatabasePath());
    const result = await dialog.showOpenDialog({
      title: 'Välj mediafil',
      defaultPath: dbDir,
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };

    const srcPath = result.filePaths[0];
    const dbPath = getCurrentDatabasePath();
    const mediaFolder = media.getMediaFolderName(dbPath);
    const mediaDir = path.join(dbDir, mediaFolder);
    fs.mkdirSync(mediaDir, { recursive: true });

    const filename = path.basename(srcPath);
    let destPath = path.join(mediaDir, filename);
    if (fs.existsSync(destPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      destPath = path.join(mediaDir, `${base}_${Date.now()}${ext}`);
    }
    fs.copyFileSync(srcPath, destPath);

    const fileRef = path.join(mediaFolder, path.basename(destPath));
    const ext = path.extname(destPath).slice(1).toLowerCase();
    const db = getDb();
    const item = media.createMedia(db, {
      file_ref: fileRef,
      title: opts?.suggestedTitle?.trim() || path.basename(destPath, path.extname(destPath)),
      format: ext || null,
    });

    return { canceled: false, media: item };
  });

  wrapHandler('media:openFile', async (id) => {
    const item = media.getMedia(getDb(), id as string);
    if (!item || !item.file_ref) return { success: false, error: 'Media not found or no file_ref' };
    const dbDir = path.dirname(getCurrentDatabasePath());
    const absPath = path.resolve(dbDir, item.file_ref);
    if (!fs.existsSync(absPath)) return { success: false, error: 'File not found: ' + absPath };
    await shell.openPath(absPath);
    return { success: true };
  });
}
