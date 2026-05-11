// Universal stub for Node-only modules pulled in by main-thread code paths
// the renderer never executes (genney importer, child_process spawning,
// fs reads in archive_export / duplicates / media_ai). Module init is safe
// — only the actual *call* throws so missing-Rust-command bugs surface
// loudly with the function name in the message.

const throwIt = (modName: string, fnName: string) =>
  () => { throw new Error(`Node-only module ${modName}.${fnName} called in renderer; move to Rust command`); };

const proxyHandler: ProxyHandler<object> = {
  get(_target, prop) {
    if (prop === 'then') return undefined; // not a thenable
    return throwIt('node:fs', String(prop));
  },
};

const stub = new Proxy({}, proxyHandler);

// Common synchronous fs methods — exposed by name so import * as fs from 'fs'
// gets a usable shape (each fn throws when called, doesn't throw at module
// init). Async-style fs/promises lives in src/renderer/empty-fs-promises.ts.
export const readFileSync = throwIt('node:fs', 'readFileSync');
export const writeFileSync = throwIt('node:fs', 'writeFileSync');
export const appendFileSync = throwIt('node:fs', 'appendFileSync');
export const existsSync = throwIt('node:fs', 'existsSync');
export const statSync = throwIt('node:fs', 'statSync');
export const lstatSync = throwIt('node:fs', 'lstatSync');
export const readdirSync = throwIt('node:fs', 'readdirSync');
export const mkdirSync = throwIt('node:fs', 'mkdirSync');
export const mkdtempSync = throwIt('node:fs', 'mkdtempSync');
export const rmSync = throwIt('node:fs', 'rmSync');
export const rmdirSync = throwIt('node:fs', 'rmdirSync');
export const unlinkSync = throwIt('node:fs', 'unlinkSync');
export const renameSync = throwIt('node:fs', 'renameSync');
export const copyFileSync = throwIt('node:fs', 'copyFileSync');
export const cpSync = throwIt('node:fs', 'cpSync');
export const realpathSync = throwIt('node:fs', 'realpathSync');
export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };
export const promises = stub;  // fs.promises submodule

// child_process / worker_threads exports — same throw-on-call pattern.
export const Worker = stub;
export const spawn = throwIt('child_process', 'spawn');
export const spawnSync = throwIt('child_process', 'spawnSync');
export const exec = throwIt('child_process', 'exec');
export const execSync = throwIt('child_process', 'execSync');
export const fork = throwIt('child_process', 'fork');
export const isMainThread = true;
export const parentPort = null;
export const workerData = null;
export const threadId = 0;

export default stub;
