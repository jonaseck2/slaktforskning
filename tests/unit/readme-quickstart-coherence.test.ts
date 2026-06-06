import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Mechanical guard from `docs/plans/archive/2026-05-21-oss-launch-demo-and-manual.md` T38:
 * the "Your first family tree in 10 minutes" quickstart is the first thing a
 * brand-new user follows after install, and every numbered step must be backed
 * by a real screenshot. If a step loses its screenshot — or a screenshot is
 * renamed/deleted out from under the prose — this test goes red.
 *
 * The plan's original T38 parsed an inline README section; the quickstart was
 * later moved to a standalone `QUICKSTART.md` (commit 2c90c505) with the README
 * linking to it. This test follows the quickstart to wherever it lives: it
 * asserts README still points at QUICKSTART.md, then validates QUICKSTART.md's
 * numbered-step ↔ screenshot coherence.
 *
 * The "< 10 min" timing assertion from the plan's earlier draft is intentionally
 * NOT here — it was replaced by "every documented step is screenshotted and the
 * screenshots match the documented sequence" (see the plan's Verification §1).
 */

const REPO_ROOT = resolve(__dirname, '..', '..');
const README_PATH = join(REPO_ROOT, 'README.md');
const QUICKSTART_PATH = join(REPO_ROOT, 'QUICKSTART.md');
const QUICKSTART_IMG_DIR = join(REPO_ROOT, 'docs', 'quickstart');

const EXPECTED_STEP_COUNT = 8;

/** Lines like `1. **Add yourself first.** ...` — a numbered, bolded step. */
const NUMBERED_STEP = /^(\d+)\.\s+\*\*/;
/** Image refs like `![alt](docs/quickstart/01-empty-state.png)`. */
const QUICKSTART_IMG = /!\[[^\]]*\]\((docs\/quickstart\/(\d{2})-[^)]+\.png)\)/;

function readLines(path: string): string[] {
  return existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
}

describe('README → QUICKSTART quickstart coherence', () => {
  it('QUICKSTART.md exists at the repo root', () => {
    expect(
      existsSync(QUICKSTART_PATH),
      'QUICKSTART.md must exist — it is the first surface a new user follows after install',
    ).toBe(true);
  });

  it('README.md links to the quickstart', () => {
    const readme = existsSync(README_PATH) ? readFileSync(README_PATH, 'utf8') : '';
    expect(
      readme.includes('QUICKSTART.md'),
      'README.md must link to QUICKSTART.md so a first-time visitor can find the 10-minute walkthrough',
    ).toBe(true);
  });

  it('has exactly the expected number of numbered steps', () => {
    const steps = readLines(QUICKSTART_PATH).filter(l => NUMBERED_STEP.test(l));
    expect(
      steps.length,
      `Expected ${EXPECTED_STEP_COUNT} numbered steps in QUICKSTART.md; found ${steps.length}. ` +
        'If the walkthrough changed length, update EXPECTED_STEP_COUNT and the screenshot set together.',
    ).toBe(EXPECTED_STEP_COUNT);
  });

  it('pairs every numbered step with a sequentially-numbered screenshot that exists on disk', () => {
    const lines = readLines(QUICKSTART_PATH);

    // Walk the doc top-to-bottom, tracking the most recent step number. Each
    // image ref must (a) follow a step, (b) carry the same 2-digit index as
    // that step, and (c) resolve to a real file.
    let currentStep = 0;
    const problems: string[] = [];
    const referenced: string[] = [];

    for (const line of lines) {
      const stepMatch = line.match(NUMBERED_STEP);
      if (stepMatch) {
        currentStep = Number(stepMatch[1]);
        continue;
      }
      const imgMatch = line.match(QUICKSTART_IMG);
      if (imgMatch) {
        const [, relPath, imgIndexStr] = imgMatch;
        const imgIndex = Number(imgIndexStr);
        referenced.push(relPath);

        if (currentStep === 0) {
          problems.push(`${relPath} appears before any numbered step`);
        } else if (imgIndex !== currentStep) {
          problems.push(
            `${relPath} (index ${imgIndex}) is under step ${currentStep} — index must match the step number`,
          );
        }
        if (!existsSync(join(REPO_ROOT, relPath))) {
          problems.push(`${relPath} is referenced but does not exist on disk`);
        }
      }
    }

    expect(
      problems,
      `QUICKSTART.md step ↔ screenshot coherence broke:\n  - ${problems.join('\n  - ')}`,
    ).toEqual([]);

    expect(
      referenced.length,
      `Expected ${EXPECTED_STEP_COUNT} quickstart screenshots referenced; found ${referenced.length}`,
    ).toBe(EXPECTED_STEP_COUNT);
  });

  it('has no orphan screenshots in docs/quickstart/ (every PNG is referenced)', () => {
    const onDisk = existsSync(QUICKSTART_IMG_DIR)
      ? readdirSync(QUICKSTART_IMG_DIR).filter(f => f.endsWith('.png'))
      : [];
    const quickstart = existsSync(QUICKSTART_PATH) ? readFileSync(QUICKSTART_PATH, 'utf8') : '';

    const orphans = onDisk.filter(f => !quickstart.includes(`docs/quickstart/${f}`));
    expect(
      orphans,
      `These screenshots exist in docs/quickstart/ but no step references them:\n  - ${orphans.join('\n  - ')}\n` +
        'Either reference them in QUICKSTART.md or delete them.',
    ).toEqual([]);
  });
});
