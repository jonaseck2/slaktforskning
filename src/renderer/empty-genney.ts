// Stub for src/import/genney/index.ts in the Tauri renderer build. The real
// genney importer needs Java/derby + child_process. Genney imports will move
// to a Rust command. For now, calling these throws.

const notAvailable = (name: string) => () => {
  throw new Error(`genney importer (${name}) not available in renderer; move to Rust command`);
};

export const importFromGenney = notAvailable('importFromGenney') as unknown as (...args: unknown[]) => Promise<unknown>;
export const discoverTables = notAvailable('discoverTables') as unknown as (...args: unknown[]) => Promise<unknown>;
