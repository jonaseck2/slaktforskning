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
    const raw = (await window.api.persons.get(id)) as { id: string; sex: string; living: boolean } | null;
    if (personId.value !== id) return;
    if (!raw) { person.value = null; return; }

    await loadNames(id);
    if (personId.value !== id) return;

    // Get birth/death events with full date + place info
    const events = (await window.api.events.forPerson(id)) as Array<{
      event_type: string;
      date_value: string | null;
      date_original: string | null;
      place_id: string | null;
      place_address: string | null;
    }>;
    if (personId.value !== id) return;

    const birth = events.find(e => e.event_type === 'birth');
    const death = events.find(e => e.event_type === 'death');

    const [birthLine, deathLine] = await Promise.all([
      buildDateLine(birth),
      buildDateLine(death),
    ]);
    if (personId.value !== id) return;

    eventCount.value = events.length;
    mapPointCount.value = events.filter(e => e.place_id).length;

    person.value = {
      id: raw.id,
      sex: raw.sex as 'M' | 'F' | 'U',
      living: raw.living,
      birthLine,
      deathLine,
    };

    await Promise.all([loadGroups(id), loadResearchTasks(id), loadCounts(id)]);
  }

  async function loadCounts(id: string) {
    try {
      const [rels, ids, media, checks] = await Promise.all([
        window.api.relationships.getForPerson(id) as Promise<unknown[]>,
        window.api.persons.getIdentifiers(id) as Promise<unknown[]>,
        window.api.media.forEntity('person', id) as Promise<unknown[]>,
        (window.api.checks?.forPerson(id) ?? Promise.resolve([])) as Promise<unknown[]>,
      ]);
      if (personId.value !== id) return;
      relationshipCount.value = rels.length;
      identifierCount.value = ids.length;
      mediaCount.value = media.length;
      checkCount.value = checks.length;
    } catch {
      // ignore — counts are non-critical
    }
  }

  watch(personId, async (id) => {
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
    if (id) await loadPerson(id);
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
