import * as fs from 'fs';
import * as path from 'path';

/** Resolved path to src/api/place-gazetteers/data/. */
export const DATA_DIR = path.resolve(__dirname, '..', 'api', 'place-gazetteers', 'data');

/** Write a gazetteer object to DATA_DIR/<filename>. Returns file size in KB. */
export function writeGazetteer(
  data: unknown,
  filename: string,
  dataDir: string = DATA_DIR,
): { path: string; sizeKB: number } {
  fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, filename);
  const json = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(outPath, json);
  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
  return { path: outPath, sizeKB };
}
