import * as fs from 'fs';
import * as path from 'path';
import { nativeImage } from 'electron';

const MAX_DIM = 800;

export async function generateThumbnail(srcPath: string, destPath: string): Promise<void> {
  const img = nativeImage.createFromPath(srcPath);
  if (img.isEmpty()) {
    fs.copyFileSync(srcPath, destPath);
    return;
  }
  const size = img.getSize();
  const longest = Math.max(size.width, size.height);
  if (longest <= MAX_DIM) {
    fs.copyFileSync(srcPath, destPath);
    return;
  }
  const scale = MAX_DIM / longest;
  const resized = img.resize({
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
    quality: 'good',
  });
  const ext = path.extname(destPath).toLowerCase();
  const buf = ext === '.png' ? resized.toPNG() : resized.toJPEG(85);
  fs.writeFileSync(destPath, buf);
}
