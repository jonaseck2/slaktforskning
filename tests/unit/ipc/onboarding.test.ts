import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/sf-test-onboarding-ipc' } }));

import {
  handleOnboardingGetSeen,
  handleOnboardingMarkSeen,
  handleOnboardingReset,
} from '../../../src/main/ipc/onboarding';

beforeEach(async () => {
  if (fs.existsSync('/tmp/sf-test-onboarding-ipc')) {
    fs.rmSync('/tmp/sf-test-onboarding-ipc', { recursive: true });
  }
});

describe('onboarding IPC handlers', async () => {
  it('getSeen returns {} on empty', async () => {
    expect(handleOnboardingGetSeen()).toEqual({});
  });

  it('markSeen persists a key, getSeen returns it', async () => {
    handleOnboardingMarkSeen({ key: 'coach.hourglass.focus' });
    expect(handleOnboardingGetSeen()).toEqual({ 'coach.hourglass.focus': true });
  });

  it('reset clears all keys', async () => {
    handleOnboardingMarkSeen({ key: 'a' });
    handleOnboardingMarkSeen({ key: 'b' });
    handleOnboardingReset();
    expect(handleOnboardingGetSeen()).toEqual({});
  });
});
