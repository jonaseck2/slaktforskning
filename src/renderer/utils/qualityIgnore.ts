import { ref } from 'vue';

const STORAGE_KEY = 'quality:ignored';

export interface IgnorableIssue {
  code: string;
  personIds: string[];
  placeIds?: string[];
  mediaIds?: string[];
  sourceIds?: string[];
}

export const ignoredKeys = ref<Set<string>>(
  new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[])
);

export function ignoreKey(r: IgnorableIssue): string {
  const ids = [
    ...r.personIds,
    ...(r.placeIds ?? []),
    ...(r.mediaIds ?? []),
    ...(r.sourceIds ?? []),
  ].sort();
  return `${r.code}:${ids.join(',')}`;
}

export function isIgnored(r: IgnorableIssue): boolean {
  return ignoredKeys.value.has(ignoreKey(r));
}

export function toggleIgnore(r: IgnorableIssue): void {
  const key = ignoreKey(r);
  const next = new Set(ignoredKeys.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  ignoredKeys.value = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
}

export function resetIgnored(): void {
  ignoredKeys.value = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]);
}
