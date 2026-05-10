// Stub for fs/promises in the Tauri renderer build. The api/ modules that
// import this (media_consolidate.ts) never run in the renderer — file I/O
// moves to Rust commands. Any call here is a bug.

const throwIt = (name: string) => () => {
  throw new Error(`fs/promises.${name} called in renderer; move to Rust command`);
};

export const readFile = throwIt('readFile');
export const writeFile = throwIt('writeFile');
export const access = throwIt('access');
export const stat = throwIt('stat');
export const mkdir = throwIt('mkdir');
export const cp = throwIt('cp');
export const copyFile = throwIt('copyFile');
export const rename = throwIt('rename');
export const unlink = throwIt('unlink');
export const readdir = throwIt('readdir');
export const rm = throwIt('rm');
export const realpath = throwIt('realpath');

export default {
  readFile, writeFile, access, stat, mkdir, cp, copyFile, rename, unlink, readdir, rm, realpath,
};
