import { ref } from 'vue';

export function useTTS() {
  const isSpeaking = ref(false);
  const isSupported = ref(typeof speechSynthesis !== 'undefined');

  // Voices load asynchronously — cache them once ready
  let voicesLoaded = false;
  let cachedVoices: SpeechSynthesisVoice[] = [];

  function loadVoices(): SpeechSynthesisVoice[] {
    if (!isSupported.value) return [];
    cachedVoices = speechSynthesis.getVoices();
    if (cachedVoices.length > 0) voicesLoaded = true;
    return cachedVoices;
  }

  if (isSupported.value) {
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }

  function findVoice(locale: string): SpeechSynthesisVoice | null {
    const voices = voicesLoaded ? cachedVoices : loadVoices();
    return (
      voices.find((v) => v.lang === locale) ??
      voices.find((v) => v.lang.startsWith(locale.split('-')[0])) ??
      voices.find((v) => v.default) ??
      null
    );
  }

  function speak(text: string, locale = 'sv') {
    if (!isSupported.value || !text) return;
    speechSynthesis.cancel();

    function doSpeak() {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = findVoice(locale);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = locale;
      }
      utterance.onstart = () => { isSpeaking.value = true; };
      utterance.onend = () => { isSpeaking.value = false; };
      utterance.onerror = () => { isSpeaking.value = false; };
      speechSynthesis.speak(utterance);
    }

    // If voices aren't loaded yet, wait for them
    if (!voicesLoaded && speechSynthesis.getVoices().length === 0) {
      speechSynthesis.addEventListener('voiceschanged', () => doSpeak(), { once: true });
    } else {
      doSpeak();
    }
  }

  function stop() {
    if (!isSupported.value) return;
    speechSynthesis.cancel();
    isSpeaking.value = false;
  }

  return { speak, stop, isSpeaking, isSupported };
}
