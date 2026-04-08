import { ref } from 'vue';

export function useTTS() {
  const isSpeaking = ref(false);
  const isSupported = ref(typeof speechSynthesis !== 'undefined');

  function findVoice(locale: string): SpeechSynthesisVoice | null {
    if (!isSupported.value) return null;
    const voices = speechSynthesis.getVoices();
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

  function stop() {
    if (!isSupported.value) return;
    speechSynthesis.cancel();
    isSpeaking.value = false;
  }

  return { speak, stop, isSpeaking, isSupported };
}
