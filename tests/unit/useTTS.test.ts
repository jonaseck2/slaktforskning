import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock speechSynthesis before importing
const mockCancel = vi.fn();
const mockSpeak = vi.fn();
const mockGetVoices = vi.fn(() => [
  { lang: 'sv-SE', name: 'Anna', default: false },
  { lang: 'en-US', name: 'Samantha', default: true },
]);

Object.defineProperty(globalThis, 'speechSynthesis', {
  value: {
    cancel: mockCancel,
    speak: mockSpeak,
    getVoices: mockGetVoices,
    speaking: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});
Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
  value: class {
    text = '';
    voice: unknown = null;
    lang = '';
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) { this.text = text; }
  },
  writable: true,
});

describe('useTTS', async () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('should be importable', async () => {
    const mod = await import('../../src/renderer/composables/useTTS');
    expect(mod.useTTS).toBeDefined();
  });

  it('should report isSupported as true when speechSynthesis exists', async () => {
    const { useTTS } = await import('../../src/renderer/composables/useTTS');
    const { isSupported } = useTTS();
    expect(isSupported.value).toBe(true);
  });

  it('should call speechSynthesis.speak when speak() is called', async () => {
    const { useTTS } = await import('../../src/renderer/composables/useTTS');
    const { speak } = useTTS();
    speak('Hello world', 'en');
    expect(mockCancel).toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(mockSpeak).toHaveBeenCalled();
  });

  it('should call speechSynthesis.cancel when stop() is called', async () => {
    const { useTTS } = await import('../../src/renderer/composables/useTTS');
    const { stop } = useTTS();
    stop();
    expect(mockCancel).toHaveBeenCalled();
  });

  it('should select Swedish voice for sv locale', async () => {
    const { useTTS } = await import('../../src/renderer/composables/useTTS');
    const { speak } = useTTS();
    speak('Hej', 'sv');
    vi.advanceTimersByTime(60);
    const utterance = mockSpeak.mock.calls[0][0];
    expect(utterance.voice?.lang || utterance.lang).toContain('sv');
  });
});
