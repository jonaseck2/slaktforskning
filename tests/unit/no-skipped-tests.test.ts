/**
 * Standing guard: the suite must contain zero `it.skip` / `test.skip` /
 * `describe.skip` / `it.todo` / `test.todo` / `.skip()` calls.
 *
 * Why: a non-zero floor in `npm test`'s "skipped" summary count means any
 * future *real* skip — a broken test temporarily disabled to make CI green
 * — is invisible in the summary line. When the floor is N, no one notices
 * when it becomes N+1.
 *
 * Conditional skips via `.skipIf(...)` / `.runIf(...)` (Vitest's
 * predicate-based helpers, used for fixtures that may or may not exist on
 * disk) are NOT the antipattern this guard is for — they are an
 * intentional and documented design choice. They are therefore allowed.
 *
 * If you genuinely need to skip a broken test, talk to the team — the
 * answer is almost always "fix the test or delete it." If there's a real
 * reason (e.g. flake under investigation tracked in an issue), open a
 * tracking issue and add an explicit allow-list entry below pointing at
 * the issue URL.
 *
 * See docs/plans/archive/2026-05-12-skipped-tests-cleanup.md for the
 * rationale and the antipattern's history (the 112-skip floor that
 * masked the signal until 2026-05-12).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const TESTS_DIR = join(__dirname, '..');
const REPO_ROOT = join(TESTS_DIR, '..');

// Files allowed to mention the patterns (this guard's own source +
// documentation strings).
const ALLOWLIST_FILES = new Set<string>([
  'unit/no-skipped-tests.test.ts',
]);

// Patterns that signal a static skip-the-test antipattern. We deliberately
// match the literal `(` after `.skip` / `.todo` to exclude `.skipIf(` /
// `.runIf(` (legitimate conditional skips).
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bit\.skip\(/g, label: 'it.skip(' },
  { pattern: /\btest\.skip\(/g, label: 'test.skip(' },
  { pattern: /\bdescribe\.skip\(/g, label: 'describe.skip(' },
  { pattern: /\bit\.todo\(/g, label: 'it.todo(' },
  { pattern: /\btest\.todo\(/g, label: 'test.todo(' },
];

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listTestFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function findAll(haystack: string, pattern: RegExp): number[] {
  const indices: number[] = [];
  pattern.lastIndex = 0;
  let m: RegExpExecArray | null = pattern.exec(haystack);
  while (m !== null) {
    indices.push(m.index);
    m = pattern.exec(haystack);
  }
  return indices;
}

describe('no-skipped-tests guard', () => {
  it('every static `*.skip(...)` / `*.todo(...)` call is gone (or allow-listed)', () => {
    const files = listTestFiles(TESTS_DIR);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(TESTS_DIR, file);
      if (ALLOWLIST_FILES.has(rel)) continue;
      const content = readFileSync(file, 'utf8');
      for (const { pattern, label } of FORBIDDEN_PATTERNS) {
        for (const idx of findAll(content, pattern)) {
          const line = content.slice(0, idx).split('\n').length;
          offenders.push(`${relative(REPO_ROOT, file)}:${line}: ${label}`);
        }
      }
    }

    expect(
      offenders,
      `Found static skipped/todo tests. Either fix the underlying test, ` +
        `delete it, or convert it to a passing assertion. See ` +
        `docs/plans/archive/2026-05-12-skipped-tests-cleanup.md for the ` +
        `pattern.\n\nOffenders:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
