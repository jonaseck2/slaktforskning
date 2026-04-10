import { ref } from 'vue';

// ---------------------------------------------------------------------------
// Shared voice cache (module-level) — all useTTS() instances share the same
// loaded voices so late-created instances don't miss the voiceschanged event.
// ---------------------------------------------------------------------------
const _supported = typeof speechSynthesis !== 'undefined';
let _voicesLoaded = false;
let _cachedVoices: SpeechSynthesisVoice[] = [];

function _loadVoices(): SpeechSynthesisVoice[] {
  if (!_supported) return [];
  _cachedVoices = speechSynthesis.getVoices();
  if (_cachedVoices.length > 0) _voicesLoaded = true;
  return _cachedVoices;
}

if (_supported) {
  _loadVoices();
  speechSynthesis.addEventListener('voiceschanged', _loadVoices);
}

function findVoice(locale: string): SpeechSynthesisVoice | null {
  const voices = _voicesLoaded ? _cachedVoices : _loadVoices();
  return (
    voices.find((v) => v.lang === locale) ??
    voices.find((v) => v.lang.startsWith(locale.split('-')[0])) ??
    voices.find((v) => v.default) ??
    null
  );
}

export function useTTS() {
  const isSpeaking = ref(false);
  const isSupported = ref(_supported);

  // Chromium keepalive: Chrome kills speechSynthesis after ~15 s of
  // continuous speech.  Periodically calling pause()/resume() resets the
  // internal timer.  We run this only while an utterance is playing.
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  function startKeepalive(): void {
    stopKeepalive();
    keepaliveTimer = setInterval(() => {
      if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.pause();
        speechSynthesis.resume();
      }
    }, 10_000);
  }

  function stopKeepalive(): void {
    if (keepaliveTimer !== null) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  }

  // Debounce timer — coalesces rapid speak() calls (e.g. fast tabbing in
  // screen reader mode) so we don't hammer cancel()/speak() cycles which
  // corrupt Chromium's speech engine.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function speak(text: string, locale = 'sv') {
    if (!isSupported.value || !text) return;

    // Cancel any pending debounced speak
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Stop current speech immediately for responsiveness
    speechSynthesis.cancel();
    stopKeepalive();

    // Debounce + delay: wait a tick so Chrome fully processes the cancel()
    // before we queue a new utterance.  This prevents the engine from
    // entering a corrupt silent state after many rapid cancel/speak cycles.
    debounceTimer = setTimeout(() => {
      debounceTimer = null;

      function doSpeak() {
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = findVoice(locale);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = locale;
        }
        utterance.onstart = () => {
          isSpeaking.value = true;
          startKeepalive();
        };
        utterance.onend = () => {
          isSpeaking.value = false;
          stopKeepalive();
        };
        utterance.onerror = (ev) => {
          // 'canceled' errors are expected when we interrupt — don't treat
          // them as failures that could leave state dirty
          if (ev.error === 'canceled') return;
          isSpeaking.value = false;
          stopKeepalive();
        };
        speechSynthesis.speak(utterance);
      }

      // If voices aren't loaded yet, wait for them
      if (!_voicesLoaded && speechSynthesis.getVoices().length === 0) {
        speechSynthesis.addEventListener('voiceschanged', () => doSpeak(), { once: true });
      } else {
        doSpeak();
      }
    }, 60);
  }

  function stop() {
    if (!isSupported.value) return;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    speechSynthesis.cancel();
    stopKeepalive();
    isSpeaking.value = false;
  }

  return { speak, stop, isSpeaking, isSupported };
}
