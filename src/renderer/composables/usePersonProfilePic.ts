import { computed, watch, type Ref } from 'vue';
import { useProfilePicStore } from '../stores/profilePic';

export function usePersonProfilePic(personId: Ref<string | undefined | null>) {
  const store = useProfilePicStore();

  watch(personId, (id) => {
    if (id) void store.ensureLoaded(id);
  }, { immediate: true });

  const src = computed<string | null>(() => {
    const id = personId.value;
    if (!id) return null;
    return store.get(id).src;
  });

  const loading = computed<boolean>(() => {
    const id = personId.value;
    if (!id) return false;
    return store.get(id).status === 'loading';
  });

  return { src, loading };
}
