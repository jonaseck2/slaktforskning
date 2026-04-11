import { dialog, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { WrapHandlerFn } from './wrap-handler';
import * as media from '../../api/media';
import { getMediaTimeline } from '../../api/media_timeline';
import * as mediaRegions from '../../api/media_regions';

export function registerMediaHandlers(
  getDb: () => ReturnType<typeof import('../database').getDatabase>,
  getCurrentDatabasePath: () => string,
  wrapHandler: WrapHandlerFn,
) {
  // Media
  wrapHandler('media:list', () => media.listMedia(getDb()));
  wrapHandler('media:get', (id) => media.getMedia(getDb(), id as string));
  wrapHandler('media:create', (data) => media.createMedia(getDb(), data as Parameters<typeof media.createMedia>[1]));
  wrapHandler('media:delete', (id) => media.deleteMedia(getDb(), id as string));
  wrapHandler('media:forEntity', (entityType, entityId) => media.getMediaForEntity(getDb(), entityType as Parameters<typeof media.getMediaForEntity>[1], entityId as string));
  wrapHandler('media:linksForMedia', (mediaId) => media.getLinksForMedia(getDb(), mediaId as string));
  wrapHandler('media:addLink', (data) => media.addMediaLink(getDb(), data as Parameters<typeof media.addMediaLink>[1]));
  wrapHandler('media:removeLink', (linkId) => media.removeMediaLink(getDb(), linkId as string));
  wrapHandler('media:reorder', (linkIds) => media.reorderMediaLinks(getDb(), linkIds as string[]));

  wrapHandler('media:getTimeline', (entityType, entityId) =>
    getMediaTimeline(getDb(), entityType as 'person' | 'place', entityId as string)
  );

  wrapHandler('media:attach', async (data) => {
    const opts = data as { entityType?: string; entityId?: string } | undefined;
    const result = await dialog.showOpenDialog({
      title: 'Välj mediafil',
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };

    const srcPath = result.filePaths[0];
    const dbDir = path.dirname(getCurrentDatabasePath());
    const mediaDir = path.join(dbDir, 'media');
    fs.mkdirSync(mediaDir, { recursive: true });

    const filename = path.basename(srcPath);
    let destPath = path.join(mediaDir, filename);
    // Avoid overwriting: append suffix if file already exists
    if (fs.existsSync(destPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const suffix = Date.now();
      destPath = path.join(mediaDir, `${base}_${suffix}${ext}`);
    }
    fs.copyFileSync(srcPath, destPath);

    const fileRef = path.join('media', path.basename(destPath));
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

  wrapHandler('media:getFilePath', (id) => {
    const item = media.getMedia(getDb(), id as string);
    if (!item || !item.file_ref) return null;
    const dbDir = path.dirname(getCurrentDatabasePath());
    const absPath = path.resolve(dbDir, item.file_ref);
    return fs.existsSync(absPath) ? absPath : null;
  });

  wrapHandler('media:readAsDataUrl', (id) => {
    const item = media.getMedia(getDb(), id as string);
    if (!item || !item.file_ref) return null;
    const dbDir = path.dirname(getCurrentDatabasePath());
    const absPath = path.resolve(dbDir, item.file_ref);
    if (!fs.existsSync(absPath)) return null;
    const ext = path.extname(absPath).toLowerCase().slice(1);
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    };
    const mime = mimeMap[ext] ?? 'image/jpeg';
    const dataStr = fs.readFileSync(absPath).toString('base64');
    return `data:${mime};base64,${dataStr}`;
  });

  // Media Regions
  wrapHandler('mediaRegions:create', (data) => mediaRegions.createMediaRegion(getDb(), data as Parameters<typeof mediaRegions.createMediaRegion>[1]));
  wrapHandler('mediaRegions:getForMedia', (mediaId) => mediaRegions.getMediaRegions(getDb(), mediaId as string));
  wrapHandler('mediaRegions:getForPerson', (personId) => mediaRegions.getRegionsForPerson(getDb(), personId as string));
  wrapHandler('mediaRegions:update', (id, data) => mediaRegions.updateMediaRegion(getDb(), id as string, data as Parameters<typeof mediaRegions.updateMediaRegion>[2]));
  wrapHandler('mediaRegions:delete', (id) => mediaRegions.deleteMediaRegion(getDb(), id as string));
}
