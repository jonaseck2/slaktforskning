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
  placeIds?: string[];
  placeNames?: string[];
  mediaIds?: string[];
  mediaTitles?: string[];
  sourceIds?: string[];
  sourceTitles?: string[];
  resolvedLat?: number;
  resolvedLon?: number;
  matchedPath?: string;
  /** Deep-link target — see CheckResult.landingPath in src/api/checks/check-utils.ts. */
  landingPath?: string;
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
