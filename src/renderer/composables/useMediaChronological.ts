import { ref, watch, type Ref } from 'vue';

export interface ChronologicalMediaItem {
  id: string;
  title: string | null;
  notes: string | null;
  fileRef: string | null;
  format: string | null;
  isPrintable: boolean;
  sortOrder: number;
  inferredDateISO: string | null;
}

export interface MediaEntityRef {
  entityType: 'person' | 'relationship' | 'place' | 'event';
  entityId: string;
}

export function useMediaChronological(entityRef: Ref<MediaEntityRef | null>) {
  const items = ref<ChronologicalMediaItem[]>([]);
  const loading = ref(false);

  async function load() {
    if (!entityRef.value) {
      items.value = [];
      return;
    }
    loading.value = true;
    try {
      const media = (await window.api.media.forEntity(
        entityRef.value.entityType,
        entityRef.value.entityId,
      )) as Array<Record<string, unknown>>;
      // v1 sort: sort_order is the authoritative order set by the user via MediaPanel reorder.
      // Date-inference from linked events can be added later (requires additional lookups).
      const mapped: ChronologicalMediaItem[] = media.map((m) => ({
        id: m.id as string,
        title: (m.title as string) || null,
        notes: (m.notes as string) || null,
        fileRef: (m.file_ref as string) || null,
        format: (m.format as string) || null,
        isPrintable: !!(m.is_printable as number | boolean),
        sortOrder: (m.sort_order as number) ?? 0,
        inferredDateISO: null,
      }));
      mapped.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return (a.title || '').localeCompare(b.title || '');
      });
      items.value = mapped;
    } finally {
      loading.value = false;
    }
  }

  watch(entityRef, load, { immediate: true, deep: true });

  return { items, loading, reload: load };
}
