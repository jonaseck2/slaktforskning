import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function getAppName(): string {
  const pkg = require('../../package.json') as { productName?: string; name: string };
  return pkg.productName ?? pkg.name;
}

export function getDefaultDbPath(): string {
  const appName = getAppName();
  const platform = process.platform;
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName, 'slaktforskning.db');
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName, 'slaktforskning.db');
  }
  return path.join(os.homedir(), '.config', appName, 'slaktforskning.db');
}
