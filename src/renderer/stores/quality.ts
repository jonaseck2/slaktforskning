import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface QualityResult {
  code: string;
  severity: 'error' | 'warning' | 'notice';
  message: string;
  messageParams?: Record<string, string | number>;
  personIds: string[];
  personNames: string[];
  eventIds?: string[];
  relationshipIds?: string[];
}

export const useQualityStore = defineStore('quality', () => {
  const results = ref<QualityResult[]>([]);
  const hasRun = ref(false);
  const running = ref(false);

  function setResults(r: QualityResult[]) {
    results.value = r;
    hasRun.value = true;
    running.value = false;
  }

  return { results, hasRun, running, setResults };
});
