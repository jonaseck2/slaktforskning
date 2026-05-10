// Stub for src/api/place-gazetteers/bundled.ts in the Tauri renderer build.
// The real file does fileURLToPath(import.meta.url) at module init, which
// throws under tauri:// URLs. The renderer doesn't need bundled gazetteers
// in the spike — they're loaded from the DB or, eventually, served by Rust.
// Only the named exports actually used elsewhere are stubbed.

import type { Gazetteer } from '../api/place-gazetteers/types';

export const BUNDLED_GAZETTEERS: Gazetteer[] = [];
export const BUNDLED_GAZETTEER_MAP: Record<string, Gazetteer> = {};
export const LAN_LETTER_CODES: Record<string, string[]> = {};
export const HISTORICAL_LAN_ALIASES: Record<string, string[]> = {};

export function getAllGazetteers(): Gazetteer[] {
  return [];
}

export function getGazetteerById(_id: string): Gazetteer | undefined {
  return undefined;
}

export function getBundledGazetteerIds(): string[] {
  return [];
}
