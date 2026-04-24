import * as fs from 'fs';
import * as path from 'path';
import { dialog, shell } from 'electron';
import * as media from '../../api/media';
import { callWorker } from './worker-client';
import type { WrapHandlerFn } from './wrap-handler';

/** Derive the media folder name from the database filename: `foo.db` → `foo-media` */
export function mediaFolderName(dbPath: string): string {
  const dbName = path.basename(dbPath, path.extname(dbPath));
  return `${dbName}-media`;
}

export function registerMediaHandlers(
  getDb: () => ReturnType<typeof import('../database').getDatabase>,
  getCurrentDatabasePath: () => string,
  wrapHandler: WrapHandlerFn,
) {
  // DB-only operations → worker
  wrapHandler('media:list', () => callWorker('media:list'));
  wrapHandler('media:listPage', (...args) => callWorker('media:listPage', ...args));
  wrapHandler('media:get', (...args) => callWorker('media:get', ...args));
  wrapHandler('media:create', (...args) => callWorker('media:create', ...args));
  wrapHandler('media:delete', (...args) => callWorker('media:delete', ...args));
  wrapHandler('media:update', (...args) => callWorker('media:update', ...args));
  wrapHandler('media:forEntity', (...args) => callWorker('media:forEntity', ...args));
  wrapHandler('media:linksForMedia', (...args) => callWorker('media:linksForMedia', ...args));
  wrapHandler('media:addLink', (...args) => callWorker('media:addLink', ...args));
  wrapHandler('media:removeLink', (...args) => callWorker('media:removeLink', ...args));
  wrapHandler('media:reorder', (...args) => callWorker('media:reorder', ...args));
  wrapHandler('media:profilePicRef', (...args) => callWorker('media:profilePicRef', ...args));
  wrapHandler('media:profilePicRefs', (...args) => callWorker('media:profilePicRefs', ...args));
  wrapHandler('media:getTimeline', (...args) => callWorker('media:getTimeline', ...args));
  wrapHandler('media:getFilePath', (...args) => callWorker('media:getFilePath', ...args));
  wrapHandler('media:readAsDataUrl', (...args) => callWorker('media:readAsDataUrl', ...args));

  // Media Regions → worker
  wrapHandler('mediaRegions:create', (...args) => callWorker('mediaRegions:create', ...args));
  wrapHandler('mediaRegions:getForMedia', (...args) => callWorker('mediaRegions:getForMedia', ...args));
  wrapHandler('mediaRegions:getForPerson', (...args) => callWorker('mediaRegions:getForPerson', ...args));
  wrapHandler('mediaRegions:update', (...args) => callWorker('mediaRegions:update', ...args));
  wrapHandler('mediaRegions:delete', (...args) => callWorker('mediaRegions:delete', ...args));

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
    const mediaFolder = mediaFolderName(dbPath);
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
