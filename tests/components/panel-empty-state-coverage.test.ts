import { describe, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const COMPONENTS_DIR = resolve(__dirname, '../../src/renderer/components');

function listFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(suffix))
    .map((d) => join(dir, d.name));
}

const files = [
  ...listFiles(COMPONENTS_DIR, 'Section.vue'),
  ...listFiles(COMPONENTS_DIR, 'Panel.vue'),
];

const NA_MARKER = /Empty-state coaching N\/A:/;
const HAS_LIST = /v-for=/;
const HAS_EMPTY = /SectionEmpty|<AppEmptyState/;

describe('panel empty-state coverage', () => {
  it.each(files.map((f) => [basename(f), f]))(
    '%s has empty-state coaching for every list (or a documented N/A)',
    (_name, file) => {
      const src = readFileSync(file, 'utf-8');
      if (!HAS_LIST.test(src)) return; // no list → no coverage requirement
      if (HAS_EMPTY.test(src) || NA_MARKER.test(src)) return;
      throw new Error(
        `${basename(file)}: contains v-for but no SectionEmpty/AppEmptyState/N\\A comment.\n` +
          `Add <SectionEmpty :purpose-key="..." :action-label-key="..." @action="..." /> next to the list, ` +
          `or add a comment <!-- Empty-state coaching N/A: <reason> --> with a specific reason.`,
      );
    },
  );
});
