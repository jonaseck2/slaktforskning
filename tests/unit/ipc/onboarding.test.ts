import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/sf-test-onboarding-ipc' } }));

import {
  handleOnboardingGetSeen,
  handleOnboardingMarkSeen,
  handleOnboardingReset,
} from '../../../src/main/ipc/onboarding';

beforeEach(() => {
  if (fs.existsSync('/tmp/sf-test-onboarding-ipc')) {
    fs.rmSync('/tmp/sf-test-onboarding-ipc', { recursive: true });
  }
});

describe('onboarding IPC handlers', () => {
  it('getSeen returns {} on empty', () => {
    expect(handleOnboardingGetSeen()).toEqual({});
  });

  it('markSeen persists a key, getSeen returns it', () => {
    handleOnboardingMarkSeen({ key: 'coach.hourglass.focus' });
    expect(handleOnboardingGetSeen()).toEqual({ 'coach.hourglass.focus': true });
  });

  it('reset clears all keys', () => {
    handleOnboardingMarkSeen({ key: 'a' });
    handleOnboardingMarkSeen({ key: 'b' });
    handleOnboardingReset();
    expect(handleOnboardingGetSeen()).toEqual({});
  });
});
