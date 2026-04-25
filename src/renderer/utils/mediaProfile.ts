import { useProfilePicStore } from '../stores/profilePic';

declare const window: Window & {
  api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

interface LinkRow {
  id: string;       // media id
  link_id: string;  // media_link id
}

export async function setMediaAsPersonProfile(personId: string, mediaId: string): Promise<void> {
  let links = await window.api.media.forEntity('person', personId) as LinkRow[];

  // If the media isn't linked to this person yet (e.g. only tagged via face region),
  // create the link first so the reorder can find it.
  if (!links.some(l => l.id === mediaId)) {
    await window.api.media.addLink({ media_id: mediaId, entity_type: 'person', entity_id: personId });
    links = await window.api.media.forEntity('person', personId) as LinkRow[];
  }

  const target = links.find(l => l.id === mediaId);
  if (!target) return;
  const reordered = [target.link_id, ...links.filter(l => l.id !== mediaId).map(l => l.link_id)];
  await window.api.media.reorder(reordered);

  const store = useProfilePicStore();
  store.invalidatePerson(personId);
  void store.ensureLoaded(personId);
}

export async function isMediaPersonProfile(personId: string, mediaId: string): Promise<boolean> {
  const links = await window.api.media.forEntity('person', personId) as LinkRow[];
  return links.length > 0 && links[0].id === mediaId;
}
