import { ref, watch, type Ref } from 'vue';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

export interface PersonData {
  id: string;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  birthLine: string | null;
  deathLine: string | null;
}

export interface NameData {
  id: string;
  given_name: string | null;
  surname: string | null;
  preferred_name: string | null;
  nickname: string | null;
  sort_order: number;
  name_type: string;
  name_prefix?: string | null;
  name_suffix?: string | null;
  name_qualifier?: string | null;
  patronymic_base?: string | null;
}

export interface GroupData {
  id: string;
  name: string;
  notes: string | null;
}

export interface ResearchTaskRow {
  id: string;
  task: string;
  notes: string | null;
  result: string | null;
  status: string;
  priority: number;
  person_id?: string | null;
  person_given_name?: string | null;
  person_surname?: string | null;
  created_at: string;
  updated_at: string;
}

async function buildDateLine(event: {
  date_original: string | null;
  date_value: string | null;
  place_id: string | null;
  place_address: string | null;
} | undefined): Promise<string | null> {
  if (!event) return null;

  const datePart = (event.date_original && event.date_original.trim())
    ? event.date_original.trim()
    : (event.date_value ?? null);

  if (!datePart) return null;

  let placePart: string | null = null;
  if (event.place_id) {
    try {
      const place = (await window.api.places.get(event.place_id)) as { name?: string; city?: string } | null;
      if (place) placePart = place.city ?? place.name ?? null;
    } catch {
      // ignore place fetch errors
    }
  } else if (event.place_address && event.place_address.trim()) {
    placePart = event.place_address.trim();
  }

  return placePart ? `${datePart}, ${placePart}` : datePart;
}

export function usePersonPanelData(personId: Ref<string | null>) {
  const person = ref<PersonData | null>(null);
  const primaryName = ref<NameData | null>(null);
  const names = ref<NameData[]>([]);
  const groups = ref<GroupData[]>([]);
  const researchTasks = ref<ResearchTaskRow[]>([]);

  // Counts for collapsed sections (loaded independently of child components)
  const eventCount = ref(0);
  const mapPointCount = ref(0);
  const relationshipCount = ref(0);
  const identifierCount = ref(0);
  const mediaCount = ref(0);
  const checkCount = ref(0);

  async function loadNames(id: string) {
    const fetched = (await window.api.persons.getNames(id)) as NameData[];
    const sorted = [...fetched].sort((a, b) => a.sort_order - b.sort_order);
    names.value = sorted;
    primaryName.value = sorted[0] ?? null;
  }

  async function loadGroups(id: string) {
    const raw = (await window.api.groups.forPerson(id)) as GroupData[];
    groups.value = raw;
  }

  async function loadResearchTasks(id: string) {
    const raw = (await window.api.researchTasks.forPerson(id)) as ResearchTaskRow[];
    researchTasks.value = raw;
  }

  async function loadPerson(id: string) {
    // Wave 1: fetch person, names, and events in parallel
    const [raw, fetchedNames, events] = await Promise.all([
      window.api.persons.get(id) as Promise<{ id: string; sex: string; living: boolean } | null>,
      window.api.persons.getNames(id) as Promise<NameData[]>,
      window.api.events.forPerson(id) as Promise<Array<{
        event_type: string;
        date_value: string | null;
        date_original: string | null;
        place_id: string | null;
        place_address: string | null;
      }>>,
    ]);
    if (personId.value !== id) return;
    if (!raw) { person.value = null; return; }

    // Update name and identity immediately — panel header shows the new person without
    // waiting for the place lookups that build the birth/death lines.
    const sorted = [...fetchedNames].sort((a, b) => a.sort_order - b.sort_order);
    names.value = sorted;
    primaryName.value = sorted[0] ?? null;
    eventCount.value = events.length;
    mapPointCount.value = events.filter(e => e.place_id).length;
    person.value = {
      id: raw.id,
      sex: raw.sex as 'M' | 'F' | 'U',
      living: raw.living,
      birthLine: person.value?.id === raw.id ? (person.value.birthLine ?? null) : null,
      deathLine: person.value?.id === raw.id ? (person.value.deathLine ?? null) : null,
    };

    const birth = events.find(e => e.event_type === 'birth');
    const death = events.find(e => e.event_type === 'death');

    // Wave 2: date lines, groups, tasks, and counts all in parallel.
    // checks.forPerson is intentionally excluded — it runs ~30 SQL queries
    // synchronously on the main thread and blocks all other IPC calls.
    // PersonChecksSection loads checks independently when the section is open.
    const [birthLine, deathLine, grps, tasks, rels, ids, media] = await Promise.all([
      buildDateLine(birth),
      buildDateLine(death),
      window.api.groups.forPerson(id) as Promise<GroupData[]>,
      window.api.researchTasks.forPerson(id) as Promise<ResearchTaskRow[]>,
      window.api.relationships.getForPerson(id) as Promise<unknown[]>,
      window.api.persons.getIdentifiers(id) as Promise<unknown[]>,
      window.api.media.forEntity('person', id) as Promise<unknown[]>,
    ]);
    if (personId.value !== id) return;

    groups.value = grps;
    researchTasks.value = tasks;
    relationshipCount.value = rels.length;
    identifierCount.value = ids.length;
    mediaCount.value = media.length;
    // Patch only the lifelines so avatar/name don't flicker
    if (person.value?.id === id) {
      person.value = { ...person.value, birthLine, deathLine };
    }
  }

  watch(personId, async (id) => {
    if (!id) {
      person.value = null;
      names.value = [];
      groups.value = [];
      researchTasks.value = [];
      eventCount.value = 0;
      mapPointCount.value = 0;
      relationshipCount.value = 0;
      identifierCount.value = 0;
      mediaCount.value = 0;
      checkCount.value = 0;
      return;
    }
    // Keep stale data visible while loading — avoids panel collapse/expand DOM churn
    await loadPerson(id);
  }, { immediate: true });

  return {
    person,
    primaryName,
    names,
    groups,
    researchTasks,
    loadPerson,
    loadNames,
    loadGroups,
    loadResearchTasks,
    eventCount,
    mapPointCount,
    relationshipCount,
    identifierCount,
    mediaCount,
    checkCount,
  };
}
